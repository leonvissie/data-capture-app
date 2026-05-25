import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

type ImageAssetLike = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  name?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
};

export const WIZARD_IMAGE_MAX_DIMENSION = 2000;
export const WIZARD_IMAGE_JPEG_QUALITY = 0.6;
const CLOUD_IMAGE_UNAVAILABLE_MESSAGE =
  'This photo is not available on this device right now. Check that you are online and signed-in to the account where your photos are stored.';

const HEIC_PATTERN = /\.(heic|heif)$/i;

function normalizeWizardImageError(error: unknown): Error {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  const isUnavailableCloudAsset =
    message.includes('failed to read picked image') ||
    message.includes('cannot load representation') ||
    message.includes('public.png') ||
    message.includes('public.jpeg') ||
    message.includes('public.heic') ||
    message.includes('public.heif');

  if (isUnavailableCloudAsset) {
    return new Error(CLOUD_IMAGE_UNAVAILABLE_MESSAGE);
  }
  return error instanceof Error ? error : new Error(String(error ?? 'Unable to process this image.'));
}

function hasHeicHint(asset: ImageAssetLike): boolean {
  if (!asset?.uri) return false;
  const mime = asset.mimeType ?? '';
  if (/heic|heif/i.test(mime)) return true;
  const name = asset.fileName ?? asset.name ?? '';
  if (HEIC_PATTERN.test(name ?? '')) return true;
  if (HEIC_PATTERN.test(asset.uri)) return true;
  return false;
}

async function ensureFileSize(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info?.exists && typeof info.size === 'number') {
      return info.size;
    }
  } catch {
    // ignore and fallback to provided fileSize
  }
  return null;
}

export async function ensureJpegAsset<T extends ImageAssetLike>(asset: T): Promise<T> {
  if (!asset?.uri) return asset;

  const needsConversion = hasHeicHint(asset);
  if (!needsConversion) {
    if (typeof asset.fileSize !== 'number') {
      const size = await ensureFileSize(asset.uri);
      if (size !== null) {
        return { ...asset, fileSize: size } as T;
      }
    }
    return asset;
  }

  try {
    const manipulated = await ImageManipulator.manipulateAsync(asset.uri, [], {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const baseName = asset.fileName ?? asset.name ?? 'image.jpg';
    const normalizedName = baseName.replace(HEIC_PATTERN, '.jpg');
    const size = await ensureFileSize(manipulated.uri);
    return {
      ...asset,
      uri: manipulated.uri,
      mimeType: 'image/jpeg',
      fileName: normalizedName.endsWith('.jpg') ? normalizedName : `${normalizedName}.jpg`,
      fileSize: size ?? asset.fileSize,
      width: manipulated.width ?? asset.width,
      height: manipulated.height ?? asset.height,
    } as T;
  } catch {
    return asset;
  }
}

export async function prepareWizardImage<T extends ImageAssetLike>(asset: T): Promise<T> {
  const normalized = await ensureJpegAsset(asset);
  const width = normalized.width ?? null;
  const height = normalized.height ?? null;
  const actions: ImageManipulator.Action[] = [];

  if (width && height) {
    const longEdge = Math.max(width, height);
    if (longEdge > WIZARD_IMAGE_MAX_DIMENSION) {
      const scale = WIZARD_IMAGE_MAX_DIMENSION / longEdge;
      actions.push({
        resize: {
          width: Math.round(width * scale),
          height: Math.round(height * scale),
        },
      });
    }
  }

  let manipulated: ImageManipulator.ImageResult;
  try {
    manipulated = await ImageManipulator.manipulateAsync(
      normalized.uri,
      actions,
      {
        compress: WIZARD_IMAGE_JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
  } catch (error) {
    throw normalizeWizardImageError(error);
  }

  const size = await ensureFileSize(manipulated.uri);
  return {
    ...normalized,
    uri: manipulated.uri,
    mimeType: 'image/jpeg',
    fileSize: size ?? normalized.fileSize,
    width: manipulated.width ?? normalized.width,
    height: manipulated.height ?? normalized.height,
  } as T;
}
