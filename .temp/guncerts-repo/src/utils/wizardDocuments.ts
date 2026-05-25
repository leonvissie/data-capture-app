import * as FileSystem from 'expo-file-system/legacy';
import { Document, IdentityDocumentSide } from '../data/types';
import { persistAsync, touch, withMeta } from '../data/repo';
import { deleteEntity } from '../data/sqlite';
import { invalidateDocumentPreview } from './docCache';
import { warnTempStorageFallback } from './storageAlerts';
import { getCacheBaseDir, getDocumentBaseDir, resolveDocumentUri, toRelativeDocumentPath } from './documentPaths';

type ImageAssetLike = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  name?: string | null;
  fileSize?: number | null;
};

export type WizardDocumentContext = {
  parentType:
    | 'CompetencyCertificate'
    | 'Firearm'
    | 'Safe'
    | 'Profile'
    | 'Membership'
    | 'Proficiency'
    | 'ActivityEvidence';
  parentId: string;
  holderProfileId?: string;
  label: string;
  kind: Document['kind'];
  side?: IdentityDocumentSide;
  createDocumentId: () => string;
};

type UpsertResult = {
  document: Document;
  createdNew: boolean;
};

const sanitizeSegment = (value: string) => value.replace(/[^a-z0-9_-]/gi, '_');

const ensureWizardDir = async (ctx: WizardDocumentContext) => {
  let base = getDocumentBaseDir();
  if (!base) {
    warnTempStorageFallback();
    base = getCacheBaseDir();
  }
  if (!base) {
    throw new Error('Unable to access device storage for wizard documents.');
  }
  const typeSegment = sanitizeSegment(ctx.parentType || 'entity');
  const parentSegment = sanitizeSegment(ctx.parentId || 'unknown');
  const dir = `${base}wizard-docs/${typeSegment}/${parentSegment}/`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch (error: any) {
    if (!String(error?.message ?? '').includes('already exists')) {
      throw error;
    }
  }
  return dir;
};

const deriveExtension = (asset: ImageAssetLike) => {
  const mime = (asset.mimeType ?? '').toLowerCase();
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('png')) return '.png';
  if (mime.includes('heic') || mime.includes('heif')) return '.jpg';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  const name = asset.fileName ?? asset.name ?? asset.uri ?? '';
  const match = name.match(/\.[a-z0-9]+$/i);
  if (match) return match[0];
  return '.jpg';
};

const getFileSize = async (uri: string): Promise<number | undefined> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof info.size === 'number') {
      return info.size;
    }
  } catch {
    // ignore
  }
  return undefined;
};

const copyAssetToDestination = async (asset: ImageAssetLike, ctx: WizardDocumentContext) => {
  if (!asset?.uri) {
    throw new Error('Missing image path.');
  }
  const dir = await ensureWizardDir(ctx);
  const suffix = ctx.side ? `_${ctx.side}` : '';
  const ext = deriveExtension(asset);
  const stamp = Date.now().toString(36);
  const dest = `${dir}${sanitizeSegment(ctx.parentId)}${suffix}_${stamp}${ext}`;
  try {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  } catch {
    // ignore delete failures
  }
  await FileSystem.copyAsync({ from: asset.uri, to: dest });
  const size = await getFileSize(dest);
  const relative = toRelativeDocumentPath(dest) ?? dest;
  return { uri: relative, size: size ?? asset.fileSize ?? undefined };
};

export const upsertWizardDocumentFromAsset = async (
  params: {
    asset: ImageAssetLike;
    context: WizardDocumentContext;
    existing?: Document | null;
  },
): Promise<UpsertResult> => {
  const { asset, context, existing } = params;
  const stored = await copyAssetToDestination(asset, context);
  const baseFields = {
    uri: stored.uri,
    filePath: stored.uri,
    mime: asset.mimeType ?? existing?.mime ?? 'image/jpeg',
    size: stored.size ?? existing?.size,
    holderProfileId: (context.holderProfileId ?? existing?.holderProfileId ?? '') as Document['holderProfileId'],
    parentType: context.parentType,
    parentId: context.parentId,
    identityDocumentSide: (context.side ?? existing?.identityDocumentSide ?? 'front') as IdentityDocumentSide,
    pages: 1,
    capturedAt: new Date().toISOString(),
    barcodeData: undefined,
    barcodeType: undefined,
    ocrExtractionId: undefined,
    thumbPath: undefined,
  } as Partial<Document>;

  if (existing) {
    if (existing.ocrExtractionId) {
      deleteEntity(existing.ocrExtractionId);
    }
    const previousPaths = new Set<string>();
    if (existing.uri) previousPaths.add(existing.uri);
    if (existing.filePath) previousPaths.add(existing.filePath);
    if (existing.thumbPath) previousPaths.add(existing.thumbPath);
    previousPaths.delete(stored.uri);
    const updated = touch({
      ...existing,
      ...baseFields,
    } as Document);
    await persistAsync(updated);
    await Promise.all(
      Array.from(previousPaths).map(async path => {
        try {
          const resolved = resolveDocumentUri(path);
          if (resolved) {
            await FileSystem.deleteAsync(resolved, { idempotent: true });
          }
        } catch {
          // ignore cleanup
        }
      }),
    );
    await invalidateDocumentPreview(updated.id);
    return { document: updated, createdNew: false };
  }

  const created = withMeta<Document>({
    id: context.createDocumentId(),
    type: 'Document',
    kind: context.kind,
    name: context.label,
    sha256: '',
    ...baseFields,
  } as any);
  await persistAsync(created);
  await invalidateDocumentPreview(created.id);
  return { document: created, createdNew: true };
};
