import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Platform, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Screen from '../src/components/Screen';
import { useTones } from '../src/theme/tones';
import Button from '../src/components/Button';
import type { TextRecognitionResult } from 'expo-mlkit-ocr';
import { useRouter } from 'expo-router';
import { appConfig } from '../src/config/appConfig';
import { scanPdf417FromUri, scanDebugFromUri, hasBarcodeSupport } from '../src/barcode/provider';
import { hasNativePdfRasterizer, rasterizePdf } from '../src/pdf/rasterizer';
import type { RasterizedPage } from '../src/pdf/rasterizer';
import { logger } from '@/src/utils/logger';
import { ensurePhotoLibraryPermission } from '../src/utils/permissions';

type MlkitModule = {
  recognizeText?: (uri: string) => Promise<TextRecognitionResult>;
} | null;

let mlkitModule: MlkitModule = null;
try {
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  const imported = require('expo-mlkit-ocr');
  mlkitModule = imported?.default ?? imported;
} catch {
  mlkitModule = null;
}

type ClipboardModule = {
  setStringAsync?: (value: string) => Promise<void>;
} | null;

let clipboardModule: ClipboardModule = null;
try {
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  clipboardModule = require('expo-clipboard');
} catch {
  clipboardModule = null;
}

type CleanupStatus = 'kept' | 'deleted' | 'failed';

type BarcodeScanOutput = {
  value?: string;
  format?: number;
  [key: string]: unknown;
};

type EnsureLocalResult = {
  uri: string;
  copied: boolean;
  cleanup?: () => Promise<void>;
};

type PdfPreviewState = {
  pages: RasterizedPage[];
  cleanup: () => Promise<void>;
} | null;

type PipelineDebug = {
  sourceLabel: string;
  originalUri: string;
  savedUri: string;
  copied: boolean;
  cleanupStatus: CleanupStatus;
  mime?: string | null;
  size?: number | null;
  totalDurationMs?: number;
  barcode: {
    available: boolean;
    durationMs?: number;
    error?: string | null;
    results?: BarcodeScanOutput[] | null;
    found?: { type: string; data: string } | null;
    engine?: 'mlkit' | 'none';
  };
  pdf: {
    available: boolean;
    processed: boolean;
    pageCount?: number | null;
    previewUri?: string | null;
    pages?: RasterizedPage[] | null;
    error?: string | null;
  };
  ocr: {
    available: boolean;
    durationMs?: number;
    error?: string | null;
    result?: TextRecognitionResult | null;
    text?: string | null;
    engine?: 'mlkit' | 'pdf_unsupported' | 'none';
  };
  outcome: 'barcode' | 'ocr' | 'none';
  extractedSample?: string | null;
};

function guessExtension(mime?: string | null, name?: string | null, fallbackUri?: string | null) {
  if (mime?.includes('png')) return '.png';
  if (mime?.includes('jpeg') || mime?.includes('jpg')) return '.jpg';
  if (mime?.includes('heic')) return '.heic';
  if (mime?.includes('webp')) return '.webp';
  if (mime?.includes('pdf')) return '.pdf';
  if (name?.includes('.')) {
    const ext = name.split('.').pop();
    if (ext) return `.${ext}`;
  }
  if (fallbackUri?.includes('.')) {
    const ext = fallbackUri.split('.').pop();
    if (ext) return `.${ext}`;
  }
  return '.jpg';
}

async function ensureLocalFile(uri: string, mime?: string | null, name?: string | null): Promise<EnsureLocalResult> {
  if (uri.startsWith('file://')) {
    return { uri, copied: false };
  }
  const destDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  if (!destDir) {
    throw new Error('No writable directory available for local copies.');
  }
  const extension = guessExtension(mime, name, uri);
  const dest = `${destDir}ocrdbg_${Date.now()}_${Math.random().toString(36).slice(2)}${extension}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return {
    uri: dest,
    copied: true,
    cleanup: () => FileSystem.deleteAsync(dest, { idempotent: true }),
  };
}

async function cleanupEnsured(result: EnsureLocalResult | null | undefined): Promise<CleanupStatus> {
  if (result?.cleanup) {
    try {
      await result.cleanup();
      return 'deleted';
    } catch {
      return 'failed';
    }
  }
  return 'kept';
}

function truncate(value: string, limit = 200) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
}

function formatBytes(size?: number | null) {
  if (size === undefined || size === null) return 'unknown';
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function buildSummary(debug: PipelineDebug) {
  const barcodeSummary = debug.barcode.found
    ? `found PDF417 (${debug.barcode.found.type}): ${truncate(debug.barcode.found.data, 80)}`
    : debug.barcode.error
      ? `error: ${debug.barcode.error}`
      : debug.barcode.results
        ? `checked ${debug.barcode.results.length} result(s), none matched PDF417`
        : 'not attempted';

  let ocrSummary = 'not attempted';
  if (debug.outcome === 'barcode') {
    ocrSummary = 'skipped (barcode succeeded)';
  } else if (debug.ocr.engine === 'pdf_unsupported') {
    ocrSummary = 'skipped (PDF document not supported)';
  } else if (!debug.ocr.available) {
    ocrSummary = 'unavailable on this platform';
  } else if (debug.ocr.error) {
    ocrSummary = `error: ${debug.ocr.error}`;
  } else if (debug.ocr.result) {
    const text = debug.ocr.text ?? '';
    ocrSummary = text ? `completed, text length ${text.length}` : 'completed but no text returned';
  }

  const lines = [
    `Source: ${debug.sourceLabel}`,
    `Original URI: ${debug.originalUri}`,
    `Saved copy: ${debug.savedUri} (${debug.copied ? 'copied' : 'existing'})`,
    `Cleanup: ${debug.cleanupStatus}`,
    `MIME: ${debug.mime ?? 'unknown'}`,
    `Size: ${formatBytes(debug.size)}`,
    `PDF: ${
      debug.pdf.processed
        ? `processed ${debug.pdf.pageCount ?? debug.pdf.pages?.length ?? 0} page(s)`
        : debug.pdf.error
          ? `error: ${debug.pdf.error}`
          : debug.pdf.available
            ? 'available but not processed'
            : 'unavailable'
    }`,
    `Barcode: ${barcodeSummary}`,
    `OCR: ${ocrSummary}`,
    `Outcome: ${
      debug.outcome === 'barcode'
        ? 'Barcode (PDF417) used'
        : debug.outcome === 'ocr'
          ? 'Fallback OCR text used'
          : 'No data extracted'
    }`,
  ];
  if (debug.totalDurationMs !== undefined) {
    lines.push(`Total duration: ${debug.totalDurationMs} ms`);
  }
  return lines.join('\n');
}

export default function DevOcrDebugger() {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Guard: enforce dev environment to access this tool.
  useEffect(() => {
    if (!appConfig.features.allowDevOcr) {
      router.replace('/(tabs)');
    }
  }, [router]);

  const [uri, setUri] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [resultText, setResultText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [debugInfo, setDebugInfo] = useState<PipelineDebug | null>(null);
  const [activeMode, setActiveMode] = useState<'pipeline' | null>(null);
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState>(null);

  useEffect(() => {
    return () => {
      pdfPreview?.cleanup().catch(() => {});
    };
  }, [pdfPreview]);

  const moduleDetected = !!mlkitModule;
  const hasRecognizer = typeof mlkitModule?.recognizeText === 'function';
  const pdfRasterizerDetected = hasNativePdfRasterizer;

  const rawJson = useMemo(() => {
    if (!debugInfo) return '';
    try {
      return JSON.stringify(debugInfo, null, 2);
    } catch {
      return '';
    }
  }, [debugInfo]);

  const resultJson = useMemo(() => resultText, [resultText]);

  const resultHeading = useMemo(() => {
    if (activeMode === 'pipeline') return 'Pipeline Summary';
    return 'Result';
  }, [activeMode]);

  const rawHeading = useMemo(() => {
    if (activeMode === 'pipeline') return 'Pipeline Debug JSON';
    return 'Raw Output';
  }, [activeMode]);

  const runPipeline = useCallback(
    async ({
      uri: inputUri,
      mime,
      size,
      name,
      sourceLabel,
    }: {
      uri: string;
      mime?: string | null;
      size?: number | null;
      name?: string | null;
      sourceLabel: string;
    }) => {
      const trimmedUri = inputUri?.trim();
      if (!trimmedUri) {
        setError('Provide a local file URI (file://...) or pick a file first.');
        return;
      }

      const isPdfInput = Boolean(
        mime?.toLowerCase().includes('pdf') ||
          name?.toLowerCase().endsWith('.pdf') ||
          trimmedUri.toLowerCase().includes('.pdf')
      );

      setActiveMode('pipeline');
      setIsRunning(true);
      setError(null);
      setResultText('');
      setDurationMs(null);
      setDebugInfo(null);
      setPdfPreview(null);

      const totalStart = Date.now();
      const barcodeAvailable = hasBarcodeSupport;
      const pdfRasterizerAvailable = hasNativePdfRasterizer;
      const ocrAvailable = hasRecognizer && typeof mlkitModule?.recognizeText === 'function';

      const debug: PipelineDebug = {
        sourceLabel,
        originalUri: trimmedUri,
        savedUri: trimmedUri,
        copied: false,
        cleanupStatus: 'kept',
        mime: mime ?? null,
        size: size ?? null,
        barcode: {
          available: barcodeAvailable,
          results: null,
          found: null,
          engine: 'none',
        },
        pdf: {
          available: pdfRasterizerAvailable,
          processed: false,
          pageCount: null,
          previewUri: null,
          pages: null,
          error: null,
        },
        ocr: {
          available: ocrAvailable,
          text: null,
          engine: 'none',
        },
        outcome: 'none',
        extractedSample: null,
      };

      let ensured: EnsureLocalResult | null = null;
      let rasterizedForDebug: Awaited<ReturnType<typeof rasterizePdf>> | null = null;
      let pipelineCompleted = false;

      try {
        ensured = await ensureLocalFile(trimmedUri, mime, name);
        debug.savedUri = ensured.uri;
        debug.copied = ensured.copied;
        setUri(ensured.uri);

        if (isPdfInput) {
          if (!pdfRasterizerAvailable) {
            debug.pdf.error = 'PDF rasterizer unavailable on this platform.';
          } else {
            try {
              rasterizedForDebug = await rasterizePdf(ensured.uri, 300);
              debug.pdf.processed = true;
              debug.pdf.pages = rasterizedForDebug.pages;
              debug.pdf.pageCount = rasterizedForDebug.pages.length;
              debug.pdf.previewUri = rasterizedForDebug.pages[0]?.uri ?? null;
            } catch (err: any) {
              debug.pdf.error = err?.message ?? String(err);
              throw err;
            }
          }
        }

        if (!barcodeAvailable) {
          debug.barcode.error = 'Barcode scanning unavailable on this platform.';
          debug.barcode.results = null;
          debug.barcode.engine = 'none';
        } else if (isPdfInput && !pdfRasterizerAvailable) {
          debug.barcode.error = 'Barcode scanning requires PDF rasterizer support on this platform.';
          debug.barcode.results = null;
          debug.barcode.engine = 'none';
        } else {
          const barcodeStart = Date.now();
          try {
            const dbg = await scanDebugFromUri(ensured.uri);
            debug.barcode.durationMs = Date.now() - barcodeStart;
            debug.barcode.engine = dbg.engine;
            debug.barcode.results = Array.isArray(dbg.results) ? dbg.results : [];
            const hit = await scanPdf417FromUri(ensured.uri);
            if (hit) {
              debug.barcode.found = { type: hit.type, data: hit.data };
              debug.outcome = 'barcode';
              debug.extractedSample = hit.data;
            }
          } catch (err: any) {
            debug.barcode.error = err?.message ?? String(err);
            debug.barcode.durationMs = Date.now() - barcodeStart;
            debug.barcode.results = null;
          }
        }

        if (debug.outcome !== 'barcode') {
          if (!ocrAvailable || !mlkitModule?.recognizeText) {
            if (!ocrAvailable) {
              debug.ocr.error = 'ML Kit recognizeText unavailable on this platform.';
            }
          } else if (isPdfInput && !pdfRasterizerAvailable) {
            debug.ocr.error = 'OCR requires PDF rasterizer support on this platform.';
            debug.ocr.engine = 'pdf_unsupported' as any;
          } else {
            const ocrStart = Date.now();
            try {
              let targetUri = ensured.uri;
              if (isPdfInput) {
                const firstPage = rasterizedForDebug?.pages?.[0];
                if (!firstPage?.uri) {
                  throw new Error('PDF rasterization produced no pages for OCR.');
                }
                targetUri = firstPage.uri;
              }
              const output = await mlkitModule.recognizeText(targetUri);
              debug.ocr.result = output;
              debug.ocr.engine = 'mlkit';
              const text =
                output?.text ??
                (output?.blocks?.length ? output.blocks.map((block) => block.text).join('\n') : '');
              debug.ocr.text = text ?? '';
              if (text) {
                debug.outcome = 'ocr';
                debug.extractedSample = text;
              }
            } catch (err: any) {
              debug.ocr.error = err?.message ?? String(err);
            } finally {
              debug.ocr.durationMs = Date.now() - ocrStart;
            }
          }
        }

        if (debug.outcome === 'barcode' && debug.barcode.found) {
          debug.extractedSample = debug.barcode.found.data;
        }

        if (isPdfInput && debug.pdf.processed && rasterizedForDebug) {
          setPdfPreview({ pages: rasterizedForDebug.pages, cleanup: rasterizedForDebug.cleanup });
          rasterizedForDebug = null;
        }

        pipelineCompleted = true;
      } catch (err: any) {
        setError(err?.message ?? 'Failed to process the selected file.');
      } finally {
        if (rasterizedForDebug) {
          await rasterizedForDebug.cleanup().catch(() => {});
          rasterizedForDebug = null;
        }
        const cleanupStatus = await cleanupEnsured(ensured);
        debug.cleanupStatus = cleanupStatus;
        const totalDuration = Date.now() - totalStart;
        debug.totalDurationMs = totalDuration;
        if (pipelineCompleted) {
          setDurationMs(totalDuration);
          setDebugInfo(debug);
          setResultText(buildSummary(debug));
        }
        setIsRunning(false);
      }
    },
    [hasRecognizer]
  );

  const handleManualRun = useCallback(() => {
    runPipeline({ uri, sourceLabel: 'Manual URI input', mime: null, size: null, name: null });
  }, [runPipeline, uri]);

  const handleCameraCapture = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to capture a photo.');
      return;
    }
    const captured = await ImagePicker.launchCameraAsync({
      quality: 1,
      base64: false,
      allowsEditing: false,
      mediaTypes: ['images'],
    });
    if (captured.canceled || !captured.assets?.length) return;
    const asset = captured.assets[0];
    await runPipeline({
      uri: asset.uri,
      mime: asset.mimeType ?? null,
      size: asset.fileSize ?? null,
      name: asset.fileName ?? 'camera-capture',
      sourceLabel: 'Camera capture',
    });
  }, [runPipeline]);

  const handleLibraryPick = useCallback(async () => {
    const hasPermission = await ensurePhotoLibraryPermission();
    if (!hasPermission) {
      setError('Media library permission is required to choose a photo.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    await runPipeline({
      uri: asset.uri,
      mime: asset.mimeType ?? null,
      size: asset.fileSize ?? null,
      name: asset.fileName ?? asset.uri.split('/').pop() ?? 'library-image',
      sourceLabel: 'Photo library',
    });
  }, [runPipeline]);

  const handleFilePick = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: false,
      multiple: false,
    });
    const canceled = 'type' in res && res.type === 'cancel';
    if (canceled) return;
    const doc = Array.isArray((res as any)?.assets) ? (res as any).assets[0] : res;
    const docUri: string | undefined = doc?.uri;
    if (!docUri) return;
    await runPipeline({
      uri: docUri,
      mime: doc?.mimeType ?? doc?.mime ?? null,
      size: doc?.size ?? doc?.fileSize ?? null,
      name: doc?.name ?? doc?.fileName ?? null,
      sourceLabel: 'File picker',
    });
  }, [runPipeline]);

  const handleCopyRaw = useCallback(async () => {
    if (!rawJson) return;
    if (clipboardModule?.setStringAsync) {
      try {
        await clipboardModule.setStringAsync(rawJson);
        return;
      } catch (err) {
        logger.warn('Failed to copy OCR output via expo-clipboard', err);
      }
    }
    const navClipboard: { writeText?: (value: string) => Promise<void> } | undefined =
      (globalThis as any)?.navigator?.clipboard;
    if (navClipboard?.writeText) {
      try {
        await navClipboard.writeText(rawJson);
        return;
      } catch (err) {
        logger.warn('Failed to copy OCR output via navigator.clipboard', err);
      }
    }
    logger.warn('Clipboard unavailable: could not copy OCR output');
  }, [rawJson]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 20 + insets.bottom }]}>
        <Text style={styles.h1}>Expo ML Kit OCR Debugger</Text>
        <View style={styles.section}>
          <Text style={styles.label}>APP_ENV</Text>
          <Text style={styles.value}>{appConfig.buildEnv}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Module detected</Text>
          <Text style={[styles.value, moduleDetected ? styles.ok : styles.err]}>
            {moduleDetected ? 'Yes' : 'No'}
          </Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>recognizeText available</Text>
          <Text style={[styles.value, hasRecognizer ? styles.ok : styles.err]}>
            {hasRecognizer ? 'Yes' : 'No'}
          </Text>
        </View>
        <Text style={styles.helpText}>
          Use this screen to simulate the in-app pipeline: capture or pick a document, store a local copy,
          scan for a PDF417 barcode, and fall back to ML Kit OCR. Detailed debug output is shown below.
        </Text>

        <Text style={styles.inputLabel}>Source URI</Text>
        <TextInput
          style={styles.input}
          value={uri}
          onChangeText={setUri}
          placeholder="file:///path/to/local-image.jpg"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Button
          label="Run pipeline (URI)"
          sublabel="Save locally, scan for PDF417, then fall back to OCR"
          onPress={handleManualRun}
          tone="teal"
          disabled={!uri.trim() || isRunning}
          loading={isRunning}
          style={styles.button}
        />

        <Button
          label="Capture photo (camera)"
          sublabel="Save to device, then scan barcode → OCR"
          onPress={handleCameraCapture}
          tone="blue"
          disabled={isRunning}
          loading={isRunning}
          style={styles.button}
        />

        <Button
          label="Pick photo from library"
          sublabel="Run the pipeline on a selected image"
          onPress={handleLibraryPick}
          tone="blue"
          disabled={isRunning}
          loading={isRunning}
          style={styles.button}
        />

        <Button
          label="Pick file (PDF or image)"
          sublabel="Import from Files / iCloud / Drive and process"
          onPress={handleFilePick}
          tone="blue"
          disabled={isRunning}
          loading={isRunning}
          style={styles.button}
        />

        <Button
          label="Back"
          variant="outline"
          onPress={() => router.back()}
          style={styles.button}
        />

        <Text style={styles.helpText}>
          PDF rasterizer: {pdfRasterizerDetected ? 'available' : 'unavailable'} (300 dpi)
        </Text>

        {durationMs !== null ? (
          <Text style={styles.helpText}>Last run duration: {durationMs} ms</Text>
        ) : null}

        {error ? (
          <View style={[styles.panel, styles.errorPanel]}>
            <Text style={styles.panelTitle}>Error</Text>
            <Text style={styles.panelText}>{error}</Text>
          </View>
        ) : null}

        {resultJson ? (
          <View style={[styles.panel, styles.resultPanel]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>{resultHeading}</Text>
              {rawJson ? (
                <Pressable onPress={handleCopyRaw}>
                  <Text style={styles.copyLink}>Copy</Text>
                </Pressable>
              ) : null}
            </View>
            <Text selectable style={styles.mono}>{resultJson}</Text>
          </View>
        ) : null}

        {debugInfo ? (
          <>
            <View style={[styles.panel, styles.infoPanel]}>
              <Text style={styles.panelTitle}>Source Details</Text>
              <Text style={styles.panelText}>
                <Text style={styles.panelLabel}>Source:</Text> {debugInfo.sourceLabel}
              </Text>
              <Text style={styles.panelText}>
                <Text style={styles.panelLabel}>Original URI:</Text> {debugInfo.originalUri}
              </Text>
              <Text style={styles.panelText}>
                <Text style={styles.panelLabel}>Saved URI:</Text> {debugInfo.savedUri}
              </Text>
              <Text style={styles.panelText}>
                <Text style={styles.panelLabel}>MIME:</Text> {debugInfo.mime ?? 'unknown'} |{' '}
                <Text style={styles.panelLabel}>Size:</Text> {formatBytes(debugInfo.size)}
              </Text>
              <Text style={styles.panelText}>
                <Text style={styles.panelLabel}>Cleanup:</Text> {debugInfo.cleanupStatus}
              </Text>
            </View>

            <View style={[styles.panel, styles.infoPanel]}>
              <Text style={styles.panelTitle}>PDF Workflow</Text>
              <Text style={styles.panelText}>
                <Text style={styles.panelLabel}>Rasterizer available:</Text>{' '}
                {debugInfo.pdf.available ? 'Yes' : 'No'}
              </Text>
              {debugInfo.pdf.processed ? (
                <>
                  <Text style={styles.panelText}>
                    <Text style={styles.panelLabel}>Pages:</Text> {debugInfo.pdf.pageCount ?? 0}
                  </Text>
                  {debugInfo.pdf.previewUri ? (
                    <Image
                      style={styles.pdfPreviewImage}
                      source={{ uri: debugInfo.pdf.previewUri }}
                      resizeMode="contain"
                    />
                  ) : null}
                  {debugInfo.pdf.pages && debugInfo.pdf.pages.length > 1 ? (
                    <Text style={styles.panelText}>
                      Showing first page preview. Total pages: {debugInfo.pdf.pages.length}.
                    </Text>
                  ) : null}
                </>
              ) : debugInfo.pdf.error ? (
                <Text style={[styles.panelText, styles.panelTextError]}>
                  Error: {debugInfo.pdf.error}
                </Text>
              ) : (
                <Text style={styles.panelText}>
                  PDF rasterization not triggered for this run.
                </Text>
              )}
            </View>

            <View style={[styles.panel, styles.infoPanel]}>
              <Text style={styles.panelTitle}>Barcode Scan</Text>
              <Text style={styles.panelText}>
                <Text style={styles.panelLabel}>Available:</Text> {debugInfo.barcode.available ? 'Yes' : 'No'}
              </Text>
              {debugInfo.barcode.durationMs !== undefined ? (
                <Text style={styles.panelText}>
                  <Text style={styles.panelLabel}>Duration:</Text> {debugInfo.barcode.durationMs} ms
                </Text>
              ) : null}
              <Text style={styles.panelText}>
                <Text style={styles.panelLabel}>Engine:</Text>{' '}
                {debugInfo.barcode.engine ?? 'unknown'}
              </Text>
              <Text style={styles.panelText}>
                <Text style={styles.panelLabel}>Detections:</Text>{' '}
                {debugInfo.barcode.results ? debugInfo.barcode.results.length : 0}
              </Text>
              {debugInfo.barcode.found ? (
                <>
                  <Text style={styles.panelText}>
                    <Text style={styles.panelLabel}>PDF417 ({debugInfo.barcode.found.type}):</Text>
                  </Text>
                  <Text selectable style={styles.mono}>{debugInfo.barcode.found.data}</Text>
                </>
              ) : (
                <Text style={styles.panelText}>
                  {debugInfo.barcode.error
                    ? `Error: ${debugInfo.barcode.error}`
                    : 'No PDF417 barcode detected.'}
                </Text>
              )}
            </View>

            <View style={[styles.panel, styles.infoPanel]}>
              <Text style={styles.panelTitle}>OCR</Text>
              <Text style={styles.panelText}>
                <Text style={styles.panelLabel}>Available:</Text> {debugInfo.ocr.available ? 'Yes' : 'No'}
              </Text>
              {debugInfo.ocr.durationMs !== undefined ? (
                <Text style={styles.panelText}>
                  <Text style={styles.panelLabel}>Duration:</Text> {debugInfo.ocr.durationMs} ms
                </Text>
              ) : null}
              {debugInfo.ocr.error ? (
                <Text style={[styles.panelText, styles.panelTextError]}>
                  Error: {debugInfo.ocr.error}
                </Text>
              ) : debugInfo.ocr.text ? (
                <>
                  <Text style={styles.panelText}>
                    <Text style={styles.panelLabel}>Text length:</Text> {debugInfo.ocr.text.length}
                  </Text>
                  <Text selectable style={styles.mono}>{truncate(debugInfo.ocr.text, 400)}</Text>
                </>
              ) : (
                <Text style={styles.panelText}>OCR not executed or returned no text.</Text>
              )}
            </View>
          </>
        ) : null}

        {rawJson ? (
          <View style={[styles.panel, styles.rawPanel]}>
            <Text style={styles.panelTitle}>{rawHeading}</Text>
            <Text selectable style={styles.mono}>{rawJson}</Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    content: {
      padding: 20,
      gap: 16,
    },
    h1: { fontSize: 22, fontWeight: '700', color: neutral.onSurface },
    section: { flexDirection: 'row', justifyContent: 'space-between' },
    label: { color: neutral.base, fontWeight: '600' },
    value: { color: neutral.onSurface, fontWeight: '700' },
    ok: { color: tones.green.onSurface },
    err: { color: tones.red.onSurface },
    helpText: { color: neutral.base },
    inputLabel: { color: neutral.base, fontWeight: '600' },
    input: {
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: neutral.onSurface,
      fontSize: 14,
    },
    button: { alignSelf: 'stretch' },
    panel: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      gap: 8,
    },
    infoPanel: {
      borderColor: neutral.border,
      backgroundColor: neutral.surface,
    },
    panelHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    copyLink: {
      color: tones.teal.base,
      fontWeight: '600',
    },
    errorPanel: {
      borderColor: tones.red.border,
      backgroundColor: tones.red.surface,
    },
    resultPanel: {
      borderColor: tones.green.border,
      backgroundColor: tones.green.surface,
    },
    rawPanel: {
      borderColor: tones.teal.border,
      backgroundColor: tones.teal.surface,
    },
    pdfPreviewImage: {
      marginTop: 8,
      width: '100%',
      height: 200,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.surface,
    },
    panelTitle: { fontSize: 16, fontWeight: '700', color: neutral.onSurface },
    panelText: { color: neutral.onSurface },
    panelLabel: { fontWeight: '600' },
    panelTextError: { color: tones.red.onSurface },
    mono: {
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Courier' }),
      color: neutral.onSurface,
      fontSize: 12,
    },
  });
// Provider abstracts barcode formats, not needed here anymore.
