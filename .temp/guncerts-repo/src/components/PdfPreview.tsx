import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import Pdf from 'react-native-pdf';
import { useTones } from '../theme/tones';
import { getAppDirectories } from '../utils/appDirectories';
import { logger } from '@/src/utils/logger';
import { resolveDocumentUri } from '../utils/documentPaths';

type PdfPreviewProps = {
  uri: string | null | undefined;
};

export const PdfPreview: React.FC<PdfPreviewProps> = ({ uri }) => {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones.red), [neutral, tones.red]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [base64Html, setBase64Html] = useState<string | null>(null);

  const normalizeFileUri = (value: string) =>
    value.startsWith('file://') ? value : value.startsWith('/') ? `file://${value}` : value;

  const writeDataUriToFile = useCallback(async (dataUri: string) => {
    const commaIdx = dataUri.indexOf(',');
    const base64 = commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : dataUri;
    const { cacheDirectory } = await getAppDirectories();
    const baseDir = cacheDirectory || null;
    if (!baseDir) throw new Error('No writable directory available for PDF.');
    const normalizedBase = baseDir.replace(/\/+$/, '');
    const targetPath = `${normalizedBase}/pdf-inline-${Date.now()}.pdf`;
    await FileSystem.writeAsStringAsync(targetPath, base64, { encoding: FileSystem.EncodingType.Base64 });
    return normalizeFileUri(targetPath);
  }, []);

  const downloadToFile = useCallback(async (remoteUri: string) => {
    const { cacheDirectory } = await getAppDirectories();
    const baseDir = cacheDirectory || null;
    if (!baseDir) throw new Error('No writable directory available for PDF download.');
    const normalizedBase = baseDir.replace(/\/+$/, '');
    const targetPath = `${normalizedBase}/pdf-${Date.now()}.pdf`;
    const download = await FileSystem.downloadAsync(remoteUri, targetPath);
    return normalizeFileUri(download.uri);
  }, []);

  const ensureBase64Html = useCallback(
    async (resolvedUri: string) => {
      if (base64Html) return base64Html;
      const background = neutral.onBase;
      const htmlDoc = `
        <!DOCTYPE html><html><head><meta charset="utf-8" />
        <style>
          html, body { margin: 0; padding: 0; height: 100%; background: ${background}; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          embed { width: 100%; height: 100%; border: 0; background: ${background}; }
        </style>
        </head>
        <body>
          <embed src="data:application/pdf;base64,${await FileSystem.readAsStringAsync(resolvedUri, {
            encoding: FileSystem.EncodingType.Base64,
          })}" type="application/pdf" />
        </body>
      </html>
      `;
      setBase64Html(htmlDoc);
      return htmlDoc;
    },
    [base64Html, neutral.onBase]
  );

  useEffect(() => {
    setPdfUri(null);
    setBase64Html(null);
    setError(null);
    const raw = typeof uri === 'string' ? uri.trim() : '';
    if (!raw) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        let resolved: string | null = null;
        if (raw.startsWith('data:application/pdf')) {
          resolved = await writeDataUriToFile(raw);
        } else if (raw.startsWith('http://') || raw.startsWith('https://')) {
          resolved = await downloadToFile(raw);
        } else {
          resolved = resolveDocumentUri(raw);
        }

        if (cancelled) return;
        if (!resolved || (!resolved.startsWith('file://') && !resolved.startsWith('/'))) {
          throw new Error('Unsupported PDF source.');
        }
        resolved = normalizeFileUri(resolved);
        const info = await FileSystem.getInfoAsync(resolved);
        if (!info.exists) {
          throw new Error('PDF file missing at expected location.');
        }
        setPdfUri(resolved);
        setError(null);
      } catch (err: any) {
        logger.warn('pdf preview resolve failed', err);
        if (!cancelled) {
          setError(err?.message ?? 'Unable to load PDF preview.');
          setPdfUri(null);
          setBase64Html(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uri, writeDataUriToFile, downloadToFile]);

  return (
    <View style={styles.wrap}>
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={tones.teal.base} />
          <Text style={styles.loaderText}>Loading PDF…</Text>
        </View>
      ) : null}
      {error && !pdfUri && !base64Html ? (
        <View style={styles.loader}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {pdfUri ? (
        Platform.OS === 'android' ? (
          <Pdf
            key={pdfUri}
            source={{ uri: pdfUri }}
            trustAllCerts
            style={styles.pdf}
            onLoadComplete={() => setLoading(false)}
            onError={(e) => {
              logger.warn('pdf preview android error', e);
              setError('Unable to load PDF preview.');
              setLoading(false);
            }}
          />
        ) : (
          <WebView
            originWhitelist={['*']}
            source={base64Html ? { html: base64Html } : { uri: pdfUri }}
            style={styles.pdf}
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
            nestedScrollEnabled
            onLoadEnd={() => setLoading(false)}
            onError={async (e) => {
              logger.warn('pdf preview ios webview error', e.nativeEvent);
              if (!base64Html && pdfUri) {
                try {
                  const html = await ensureBase64Html(pdfUri);
                  setBase64Html(html);
                  return;
                } catch (fallbackErr) {
                  logger.warn('pdf preview ios base64 fallback failed', fallbackErr);
                }
              }
              setError('Unable to load PDF preview.');
              setLoading(false);
            }}
          />
        )
      ) : !loading && !error ? (
        <View style={styles.loader}>
          <Text style={styles.errorText}>Unable to load PDF preview.</Text>
        </View>
      ) : null}
    </View>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], danger: ReturnType<typeof useTones>['red']) =>
  StyleSheet.create({
    wrap: { flex: 1, minHeight: 260, width: '100%' },
    pdf: { flex: 1, width: '100%', backgroundColor: neutral.onBase },
    loader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loaderText: { color: neutral.base },
    errorText: { color: danger.base, textAlign: 'center', paddingHorizontal: 16 },
  });

export default PdfPreview;
