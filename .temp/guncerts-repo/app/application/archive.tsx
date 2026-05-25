import React, { useCallback, useMemo, useState } from 'react';
import { Alert, LayoutAnimation } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { deleteEntity, getById, listByType } from '../../src/data/sqlite';
import { deleteOwnedDocFile } from '../../src/utils/docCrypto';
import { Application, Document } from '../../src/data/types';
import ApplicationListScreen from './components/ApplicationListScreen';
import { generateDocumentBundlePdf } from '../../src/pdf/bundle';
import { persist, touch } from '../../src/data/repo';
import { getAppDirectories } from '../../src/utils/appDirectories';
import * as FileSystem from 'expo-file-system/legacy';
import { File as FSFile } from 'expo-file-system/next';
import { logger } from '@/src/utils/logger';
import { resolveDocumentUri, toRelativeDocumentPath } from '../../src/utils/documentPaths';
import { sharePdf } from '../../src/utils/sharePdf';
import { backOrReplaceWithContext, decodeNav } from '../../src/navigation/helpers';
import { buildApplicationAlertDetails } from '../../src/utils/applicationAlertDetails';
import { appConfig } from '../../src/config/appConfig';

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function ArchivedApplicationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ nav?: string | string[]; hideHome?: string | string[] }>();
  const navCtx = useMemo(() => {
    const raw = Array.isArray(params.nav) ? params.nav[0] : params.nav;
    if (!raw) return decodeNav(null);
    try {
      return decodeNav(JSON.parse(raw));
    } catch {
      return decodeNav(null);
    }
  }, [params.nav]);
  const listPathWithNav = useMemo(() => {
    const serialized = Array.isArray(params.nav) ? params.nav[0] : params.nav;
    if (!serialized) return '/application/archive';
    return `/application/archive?nav=${encodeURIComponent(String(serialized))}`;
  }, [params.nav]);
  const hideHome = useMemo(() => {
    const raw = Array.isArray(params.hideHome) ? params.hideHome[0] : params.hideHome;
    return raw === '1' || raw === 'true';
  }, [params.hideHome]);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const deleteApplicationRecord = useCallback(async (applicationId: string) => {
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        deleteEntity(applicationId);
      } catch (error) {
        logger.warn('[application/archive] deleteEntity threw', { applicationId, attempt, error });
      }
      const exists = getById<Application>(applicationId);
      if (!exists) return true;
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
    logger.warn('[application/archive] Application still present after delete retries', { applicationId });
    return false;
  }, []);

  const confirmDelete = useCallback((app: Application, refresh: () => void) => {
    const message = `${buildApplicationAlertDetails(app)}\n\nThis delete cannot be undone. Make sure you have a copy of the application before deleting it.`;

    const deleteAppAndPdfs = async () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      try {
        const docs = listByType<Document>('Document').filter((doc) => doc.applicationId === app.id);
        const pdfDocs = docs.filter((doc) => {
          const mime = (doc.mime ?? '').toLowerCase();
          const name = (doc.name ?? doc.filePath ?? '').toLowerCase();
          return mime === 'application/pdf' || name.endsWith('.pdf');
        });

        for (const doc of pdfDocs) {
          const paths = [doc.uri, doc.filePath, doc.thumbPath].filter(Boolean) as string[];
          for (const path of paths) {
            try {
              await deleteOwnedDocFile(path);
            } catch {
              // ignore storage delete errors
            }
          }
          try {
            deleteEntity(doc.id);
          } catch {
            // ignore doc delete failures
          }
        }
      } finally {
        const deleted = await deleteApplicationRecord(app.id);
        if (deleted) {
          refresh();
        }
      }
    };

    Alert.alert('Permanently delete application?', message, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: () => { void deleteAppAndPdfs(); },
      },
    ]);
  }, [deleteApplicationRecord]);

  const ensureSharedDirectory = useCallback(async (): Promise<string> => {
    const { cacheDirectory, documentDirectory } = await getAppDirectories();
    const baseDir = cacheDirectory || documentDirectory;
    if (!baseDir) throw new Error('No writable directory available for PDF.');

    const normalizedBase = baseDir.replace(/\/+$/, '');
    const sharedDir = `${normalizedBase}/shared-pdfs`;

    const info = await FileSystem.getInfoAsync(sharedDir);
    if (info.exists && info.isDirectory) return sharedDir;

    if (info.exists && !info.isDirectory) {
      await FileSystem.deleteAsync(sharedDir, { idempotent: true });
    }

    await FileSystem.makeDirectoryAsync(sharedDir, { intermediates: true });
    return sharedDir;
  }, []);

  const prepareShareablePdf = useCallback(async (uri: string, baseName: string): Promise<string> => {
    const raw = uri.trim();
    if (!raw) throw new Error('Missing PDF URI.');
    if (raw.startsWith('file://')) return raw;
    if (raw.startsWith('/')) return `file://${raw}`;

    if (raw.startsWith('data:application/pdf')) {
      const sharedDir = await ensureSharedDirectory();
      const targetName = `${baseName}-${uid()}.pdf`;
      const targetPath = `${sharedDir}/${targetName}`;

      await FileSystem.deleteAsync(targetPath, { idempotent: true }).catch(() => {});
      const file = new FSFile(targetPath);
      const commaIdx = raw.indexOf(',');
      const base64 = commaIdx >= 0 ? raw.slice(commaIdx + 1) : raw;
      await file.write(base64, { encoding: 'base64' });

      return targetPath.startsWith('file://') ? targetPath : `file://${targetPath}`;
    }

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const sharedDir = await ensureSharedDirectory();
      const targetName = `${baseName}-${uid()}.pdf`;
      const targetPath = `${sharedDir}/${targetName}`;

      const response = await FileSystem.downloadAsync(raw, targetPath);
      return response.uri;
    }

    return resolveDocumentUri(raw) ?? raw;
  }, [ensureSharedDirectory]);

  const ensureDocumentBundle = useCallback(async (app: Application) => {
    const candidate = app.documentBundlePath || app.pdfPath || '';
    if (candidate) {
      try {
        const resolvedCandidate = resolveDocumentUri(candidate) ?? candidate;
        const info = await FileSystem.getInfoAsync(resolvedCandidate);
        if (info.exists) {
          return { uri: resolvedCandidate, path: resolvedCandidate };
        }
      } catch {
        // fall through
      }
    }

    const generated = await generateDocumentBundlePdf(app);
    const storedPath = toRelativeDocumentPath(generated.path) ?? generated.path;
    const updated = touch({
      ...app,
      documentBundlePath: storedPath,
      documentBundlePageCount: generated.pageCount,
      pdfPath: storedPath,
    } as Application);
    persist(updated);
    return { uri: generated.uri, path: generated.path };
  }, []);

  const handleShareBundle = useCallback(async (app: Application, refresh: () => void) => {
    if (sharingId) return;
    setSharingId(app.id);
    try {
      const bundle = await ensureDocumentBundle(app);
      refresh();
      const shareableUri = await prepareShareablePdf(bundle.uri, 'document-bundle');
      await sharePdf(shareableUri, 'Share document bundle');
    } catch (err: any) {
      logger.warn('archive share error', err);
      Alert.alert('Unable to share', err?.message ?? 'An error occurred while sharing the document bundle.');
    } finally {
      setSharingId(null);
    }
  }, [ensureDocumentBundle, prepareShareablePdf, sharingId]);

  const handleHome = useCallback(() => {
    backOrReplaceWithContext(router as any, navCtx, '/(tabs)' as any);
  }, [navCtx, router]);

  return (
    <ApplicationListScreen
      title="Archived applications"
      filter={(app) => app.status === 'archived'}
      onPressApplication={(app) =>
        router.push({
          pathname: '/application/[id]/ready-actions',
          params: {
            id: app.id,
            nav: JSON.stringify({
              returnTo: listPathWithNav,
              routeBack: listPathWithNav,
              origin: listPathWithNav,
            }),
            listNav: Array.isArray(params.nav) ? params.nav[0] : params.nav,
            listPath: '/application/archive',
            ...(hideHome ? { hideHome: '1' } : {}),
          },
        } as any)
      }
      headerClosePath="/(tabs)"
      onClose={handleHome}
      emptyTitle="No archived applications"
      emptyText="Archived applications will appear here."
      actionMode={appConfig.features.allowArchivedApplicationDeletion ? 'delete' : undefined}
      buildOnDelete={
        appConfig.features.allowArchivedApplicationDeletion
          ? (app, refresh) => () => confirmDelete(app, refresh)
          : undefined
      }
      buildOnShare={(app, refresh) => () => handleShareBundle(app, refresh)}
    />
  );
}
