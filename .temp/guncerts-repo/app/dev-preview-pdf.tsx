import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Buffer } from 'buffer';
import Screen from '../src/components/Screen';
import PageHeader from '../src/components/PageHeader';
import Button from '../src/components/Button';
import PhotoCaptureCard from '../src/components/PhotoCaptureCard';
import { useTones } from '../src/theme/tones';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Asset } from 'expo-asset';
import * as DocumentPicker from 'expo-document-picker';
import { deleteEntity, listByType } from '../src/data/sqlite';
import { withMeta, persist, now } from '../src/data/repo';
import { Document, Profile } from '../src/data/types';
import { getAppDirectories } from '../src/utils/appDirectories';
import { logger } from '@/src/utils/logger';
import { toRelativeDocumentPath } from '../src/utils/documentPaths';

const hexToPdfColor = (hex: string) => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  const num = parseInt(value, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return rgb(r / 255, g / 255, b / 255);
};

export default function DevPreviewPdf() {
  const router = useRouter();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones.red), [neutral, tones.red]);
  const pdfColors = useMemo(
    () => ({
      primary: hexToPdfColor(neutral.onSurface),
      secondary: hexToPdfColor(neutral.base),
      danger: hexToPdfColor(tones.red.base),
    }),
    [neutral.base, neutral.onSurface, tones.red.base]
  );
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<'pdf' | 'image' | null>(null);
  const [previewLabel, setPreviewLabel] = useState<string | null>(null);
  const [generatedUri, setGeneratedUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const cleanupRef = useRef<{ docId?: string | null; filePath?: string | null }>({
    docId: null,
    filePath: null,
  });
  const previewSourceRef = useRef<'generated' | 'picked'>('generated');

  const cleanupTemp = async () => {
    const { docId, filePath } = cleanupRef.current;
    cleanupRef.current = { docId: null, filePath: null };
    if (filePath) {
      try {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      } catch (err) {
        logger.warn('dev preview cleanup file error', err);
      }
    }
    if (docId) {
      try {
        deleteEntity(docId);
      } catch (err) {
        logger.warn('dev preview cleanup entity error', err);
      }
    }
  };

  const generateTestPdf = async () => {
    const pdf = await PDFDocument.create({ updateMetadata: true });
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pages: { path: string; heading: string }[] = [
    ];

    for (const entry of pages) {
      const page = pdf.addPage([595.28, 841.89]);
      const textSize = 18;
      const textWidth = font.widthOfTextAtSize(entry.heading, textSize);
      const textHeight = font.heightAtSize(textSize);
      page.drawText(entry.heading, {
        x: (595.28 - textWidth) / 2,
        y: 841.89 - textHeight - 28,
        size: textSize,
        font,
        color: pdfColors.primary,
      });

      let embedded: any = null;
      try {
        const asset = Asset.fromModule(entry.path);
        if (!asset.downloaded) {
          await asset.downloadAsync();
        }
        const localUri = asset.localUri || asset.uri;
        if (!localUri) throw new Error('Image URI unavailable');
        const data = await FileSystem.readAsStringAsync(localUri, {
          encoding: FileSystem.EncodingType.Base64 as any,
        });
        const imgBytes = Buffer.from(data, 'base64');
        const isPng = entry.heading.toLowerCase().endsWith('.png');
        try {
          embedded = isPng ? await pdf.embedPng(imgBytes) : await pdf.embedJpg(imgBytes);
        } catch (err) {
          logger.warn('primary embed failed, trying fallback', entry.heading, err);
          embedded = isPng ? await pdf.embedJpg(imgBytes) : await pdf.embedPng(imgBytes);
        }
      } catch (err) {
        logger.warn('image embed failed', entry.heading, err);
      }

      if (embedded) {
        const { width, height } = embedded.scale(1);
        const maxWidth = 400; // tighter bounds for compression
        const maxHeight = 500;
        const scale = Math.min(maxWidth / width, maxHeight / height, 1);
        const drawWidth = width * scale;
        const drawHeight = height * scale;
        page.drawImage(embedded, {
          x: (595.28 - drawWidth) / 2,
          y: (841.89 - drawHeight) / 2 - 24,
          width: drawWidth,
          height: drawHeight,
        });
      } else {
        page.drawText('Image failed to embed', {
          x: (595.28 - font.widthOfTextAtSize('Image failed to embed', 14)) / 2,
          y: 841.89 - textHeight - 60,
          size: 14,
          font,
          color: pdfColors.danger,
        });
      }
    }

    // After images, add a first page with title and size details
    const finalBytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
    const sizeKb = Math.round(finalBytes.length / 1024);

    const finalPdf = await PDFDocument.create({ updateMetadata: true });
    const finalFont = await finalPdf.embedFont(StandardFonts.HelveticaBold);
    const summaryPage = finalPdf.addPage([595.28, 841.89]);
    const heading = 'TEST PDF IMAGE INSERT';
    const headingSize = 24;
    const headingWidth = finalFont.widthOfTextAtSize(heading, headingSize);
    const headingHeight = finalFont.heightAtSize(headingSize);
    summaryPage.drawText(heading, {
      x: (595.28 - headingWidth) / 2,
      y: 841.89 - headingHeight - 32,
      size: headingSize,
      font: finalFont,
      color: pdfColors.primary,
    });
    summaryPage.drawText(`Final size: ${sizeKb} KB`, {
      x: (595.28 - finalFont.widthOfTextAtSize(`Final size: ${sizeKb} KB`, 14)) / 2,
      y: 841.89 - headingHeight - 60,
      size: 14,
      font: finalFont,
      color: pdfColors.secondary,
    });

    const embeddedOriginal = await finalPdf.embedPdf(finalBytes);
    for (let i = 0; i < embeddedOriginal.length; i++) {
      const { width: w, height: h } = embeddedOriginal[i].size();
      const page = finalPdf.addPage([w, h]);
      page.drawPage(embeddedOriginal[i]);
    }

    const base64 = await finalPdf.saveAsBase64({ dataUri: false });

    const { cacheDirectory, documentDirectory } = await getAppDirectories();
    const baseDir = cacheDirectory || documentDirectory || FileSystem.documentDirectory;
    if (!baseDir) throw new Error('No writable directory available for PDF.');
    const normalizedBase = baseDir.replace(/\/+$/, '');
    const filePath = `${normalizedBase}/dev-preview-${Date.now()}.pdf`;
    await FileSystem.writeAsStringAsync(filePath, base64, { encoding: 'base64' });
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    const storedPath = toRelativeDocumentPath(uri) ?? uri;

    const holderProfileId = listByType<Profile>('Profile')[0]?.id ?? '';
    const doc: Document = withMeta<Document>({
      id: (globalThis.crypto?.randomUUID?.() ?? `doc_${Math.random().toString(36).slice(2)}`) as any,
      type: 'Document',
      holderProfileId,
      kind: 'OTHER',
      filePath: storedPath,
      uri: storedPath,
      sha256: '',
      pages: embeddedOriginal.length + 1,
      name: 'TEST PDF IMAGE INSERT',
      mime: 'application/pdf',
      size: Math.round(base64.length * 0.75),
      capturedAt: now(),
    } as any);
    persist(doc, false);
    cleanupRef.current = { docId: doc.id, filePath };
    return uri;
  };

  const setGeneratedPreview = useCallback(async () => {
    try {
      setLoading(true);
      await cleanupTemp();
      const uri = await generateTestPdf();
      setGeneratedUri(uri);
      setPreviewUri(uri);
      setPreviewKind('pdf');
      setPreviewLabel('Generated test PDF');
      setError(null);
    } catch (err: any) {
      logger.warn('dev preview pdf failed', err);
      setError(err?.message ?? 'Unable to load PDF preview.');
      setPreviewUri(null);
      setPreviewKind(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const uri = asset.uri;
      if (!uri) return;
      const name = asset.name ?? '';
      const mime = asset.mimeType ?? '';
      const isPdf =
        mime.toLowerCase().includes('pdf') ||
        name.toLowerCase().endsWith('.pdf') ||
        uri.toLowerCase().endsWith('.pdf');
      previewSourceRef.current = 'picked';
      setPreviewUri(uri);
      setPreviewKind(isPdf ? 'pdf' : 'image');
      setPreviewLabel(name || (isPdf ? 'Uploaded PDF' : 'Uploaded image'));
      setError(null);
    } catch (err) {
      logger.warn('dev preview pick failed', err);
      setError('Unable to open file picker.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUseGenerated = useCallback(async () => {
    previewSourceRef.current = 'generated';
    if (generatedUri) {
      setPreviewUri(generatedUri);
      setPreviewKind('pdf');
      setPreviewLabel('Generated test PDF');
      setError(null);
      setLoading(false);
      return;
    }
    await setGeneratedPreview();
  }, [generatedUri, setGeneratedPreview]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const uri = await generateTestPdf();
        if (cancelled) return;
        setGeneratedUri(uri);
        if (previewSourceRef.current !== 'picked') {
          setPreviewUri(uri);
          setPreviewKind('pdf');
          setPreviewLabel('Generated test PDF');
        }
        setError(null);
      } catch (err: any) {
        logger.warn('dev preview pdf failed', err);
        if (!cancelled) {
          setError(err?.message ?? 'Unable to load PDF preview.');
          setPreviewUri(null);
          setPreviewKind(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      void cleanupTemp();
    };
  }, []);

  const handleExit = async (to?: 'back' | 'close') => {
    await cleanupTemp();
    if (to === 'close') {
      router.replace('/(tabs)');
    } else {
      router.back();
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader
          title="Bundled PDF preview"
          onBack={() => handleExit('back')}
          onClose={() => handleExit('close')}
          style={styles.header}
        />
        <View style={styles.content}>
          {/* <View style={styles.actions}>
            <Button
              label="Pick PDF or image"
              onPress={handlePickFile}
              tone="grey"
            />
            <Button
              label="Use generated PDF"
              onPress={handleUseGenerated}
              tone="grey"
            />
          </View> */}
          <PhotoCaptureCard
            title="Preview"
            helpText="Tap the preview to open it full screen."
            previewUri={previewUri}
            previewKind={previewKind ?? undefined}
            previewLabel={previewLabel ?? undefined}
            onPressCamera={handleUseGenerated}
            onPressLibrary={handlePickFile}
            onPressUpload={handlePickFile}
            showUploadButton
            onDelete={previewSourceRef.current === 'picked' ? () => {
              setPreviewUri(generatedUri);
              setPreviewKind('pdf');
              setPreviewLabel('Generated test PDF');
              setError(null);
            } : undefined}
            disabled={loading}
          />
          {/* {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={tones.teal.base} />
              <Text style={styles.loaderText}>Loading test PDF…</Text>
            </View>
          ) : error ? (
            <View style={styles.loader}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null} */}
        </View>
      </View>
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], danger: ReturnType<typeof useTones>['red']) =>
  StyleSheet.create({
    container: { flex: 1, paddingVertical: 12 },
    header: { paddingHorizontal: 20 },
    content: { flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
    actions: { gap: 10 },
    loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loaderText: { color: neutral.base },
    errorText: { color: danger.base, textAlign: 'center' },
  });
