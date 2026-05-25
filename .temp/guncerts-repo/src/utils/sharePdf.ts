import { Platform, Share } from 'react-native';
import { logger } from '@/src/utils/logger';
import { normalizeFileUri, resolveDocumentUri } from './documentPaths';

type ExpoSharingModule = {
  isAvailableAsync?: () => Promise<boolean>;
  shareAsync?: (
    url: string,
    options?: {
      mimeType?: string;
      dialogTitle?: string;
      UTI?: string;
    }
  ) => Promise<void>;
};

export async function sharePdf(uri: string, title = 'Share PDF'): Promise<void> {
  const raw = String(uri ?? '').trim();
  if (!raw) {
    throw new Error('Missing PDF URI.');
  }

  const resolved = resolveDocumentUri(raw) ?? raw;
  const normalized = normalizeFileUri(resolved);

  if (Platform.OS === 'android') {
    try {
      const sharing = require('expo-sharing') as ExpoSharingModule;
      if (sharing?.isAvailableAsync && sharing?.shareAsync) {
        const available = await sharing.isAvailableAsync();
        if (available && normalized.startsWith('file://')) {
          await sharing.shareAsync(normalized, {
            mimeType: 'application/pdf',
            dialogTitle: title,
            UTI: 'com.adobe.pdf',
          });
          return;
        }
      }
    } catch (err) {
      logger.warn('[sharePdf] expo-sharing unavailable, falling back to Share.share', err);
    }
  }

  const content =
    Platform.OS === 'android'
      ? { url: normalized, title }
      : { url: normalized, title };
  const options = Platform.OS === 'android' ? { dialogTitle: title } : undefined;
  await Share.share(content, options);
}

