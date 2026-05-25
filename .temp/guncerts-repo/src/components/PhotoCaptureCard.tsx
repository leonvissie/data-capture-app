import React, { useCallback, useState, useMemo, useEffect } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  LayoutChangeEvent,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import * as ImageManipulator from 'expo-image-manipulator';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconRoundButton } from './RoundIconButton';
import PdfPreview from './PdfPreview';
import { useTones } from '../theme/tones';
import { promptLibraryConnectivity } from '../utils/libraryConnectivity';
import { getAppDirectories } from '../utils/appDirectories';
import { hasNativePdfRasterizer, rasterizePdf } from '../pdf/rasterizer';
import { logger } from '../utils/logger';
import { SvgXml } from 'react-native-svg';
import { resolveDocumentUri, withDocumentImageCacheBust } from '../utils/documentPaths';

type PhotoCaptureCardProps = {
  title: string;
  required?: boolean;
  isError?: boolean;
  helpText?: string;
  imageUri?: string | null;
  previewUri?: string | null;
  previewKind?: 'image' | 'pdf';
  previewLabel?: string;
  previewVersionKey?: string | number | null;
  onPressCamera: () => void;
  onPressLibrary: () => void;
  onPressRotate?: () => void;
  onPressUpload?: () => void;
  showUploadButton?: boolean;
  showActionButtons?: boolean;
  showRotateButton?: boolean;
  rotateDisabled?: boolean;
  previewRotationDegrees?: number;
  persistRotationOnPreviewClose?: boolean;
  showModalRotateButton?: boolean;
  onDelete?: () => void;
  deleteConfirmTitle?: string;
  deleteConfirmMessage?: string;
  deleteConfirmConfirmLabel?: string;
  deleteConfirmCancelLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
  checkConnectivityBeforeLibrary?: boolean;
  headerContent?: React.ReactNode;
  footerContent?: React.ReactNode;
};

const PhotoCaptureCard: React.FC<PhotoCaptureCardProps> = ({
  title,
  required = false,
  isError = false,
  helpText,
  imageUri,
  previewUri,
  previewKind,
  previewLabel,
  previewVersionKey,
  onPressCamera,
  onPressLibrary,
  onPressRotate,
  onPressUpload,
  showUploadButton = false,
  showActionButtons = true,
  showRotateButton = false,
  rotateDisabled = false,
  previewRotationDegrees = 0,
  persistRotationOnPreviewClose = true,
  showModalRotateButton = true,
  onDelete,
  deleteConfirmTitle = 'Remove photo?',
  deleteConfirmMessage = 'This will remove the image from this card.',
  deleteConfirmConfirmLabel = 'Continue',
  deleteConfirmCancelLabel = 'Cancel',
  disabled = false,
  style,
  onLayout,
  checkConnectivityBeforeLibrary = true,
  headerContent,
  footerContent,
}) => {
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const resolvedPreviewUri = resolveDocumentUri(previewUri ?? imageUri ?? null);
  const resolvedPreviewKind = previewKind ?? (imageUri ? 'image' : null);
  const hasPreview = !!resolvedPreviewUri && !!resolvedPreviewKind;
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewRotationDeg, setPreviewRotationDeg] = useState(0);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [persistingPreview, setPersistingPreview] = useState(false);
  const [pdfThumbUri, setPdfThumbUri] = useState<string | null>(null);
  const [pdfThumbLoading, setPdfThumbLoading] = useState(false);
  const [pdfIconXml, setPdfIconXml] = useState<string | null>(null);

  const minScale = 1;
  const maxScale = 4;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const containerWidth = useSharedValue(0);
  const containerHeight = useSharedValue(0);

  const openPreview = () => {
    if (!hasPreview) return;
    setPreviewVisible(true);
  };

  const normalizedRotationDeg = useMemo(
    () => ((previewRotationDeg % 360) + 360) % 360,
    [previewRotationDeg],
  );
  const normalizedExternalRotationDeg = useMemo(
    () => ((previewRotationDegrees % 360) + 360) % 360,
    [previewRotationDegrees],
  );
  const combinedPreviewRotationDeg = useMemo(
    () => normalizedExternalRotationDeg + previewRotationDeg,
    [normalizedExternalRotationDeg, previewRotationDeg],
  );
  const effectivePreviewUri = useMemo(() => {
    if (Platform.OS !== 'android') {
      return resolveDocumentUri(previewUri ?? imageUri ?? null);
    }
    const combinedVersion =
      previewVersionKey != null
        ? `${previewVersionKey}:${previewVersion}`
        : previewVersion;
    return withDocumentImageCacheBust(previewUri ?? imageUri ?? null, combinedVersion);
  }, [imageUri, previewUri, previewVersion, previewVersionKey]);

  const persistPreviewRotation = useCallback(async () => {
    if (resolvedPreviewKind !== 'image') return;
    if (!resolvedPreviewUri) return;
    if (!normalizedRotationDeg) return;
    setPersistingPreview(true);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        resolvedPreviewUri,
        [{ rotate: normalizedRotationDeg }],
        {},
      );
      if (manipulated.uri !== resolvedPreviewUri) {
        try {
          await FileSystem.deleteAsync(resolvedPreviewUri, { idempotent: true });
        } catch {
          // ignore
        }
        await FileSystem.copyAsync({ from: manipulated.uri, to: resolvedPreviewUri });
      }
      setPreviewRotationDeg(0);
      setPreviewVersion((v) => v + 1);
    } catch (error: any) {
      logger.warn('[PhotoCaptureCard] Failed to persist rotated preview', error);
      Alert.alert(
        'Unable to rotate image',
        error?.message ?? 'Something went wrong while applying the image rotation.',
      );
    } finally {
      setPersistingPreview(false);
    }
  }, [normalizedRotationDeg, resolvedPreviewKind, resolvedPreviewUri]);

  const closePreview = useCallback(async () => {
    if (persistingPreview) return;
    if (persistRotationOnPreviewClose) {
      await persistPreviewRotation();
    } else {
      setPreviewRotationDeg(0);
    }
    setPreviewVisible(false);
  }, [persistPreviewRotation, persistRotationOnPreviewClose, persistingPreview]);

  const rotatePreviewAnticlockwise = useCallback(() => {
    setPreviewRotationDeg((prev) => prev - 90);
  }, []);

  const resetZoomAnimated = useCallback(() => {
    scale.value = withTiming(1, { duration: 180 });
    translateX.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(0, { duration: 180 });
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY]);

  const clamp = (value: number, min: number, max: number) => {
    'worklet';
    return Math.max(min, Math.min(max, value));
  };

  const maxOffsetFor = (containerSize: number, nextScale: number) => {
    'worklet';
    if (containerSize <= 0 || nextScale <= 1) return 0;
    return ((containerSize * nextScale) - containerSize) / 2;
  };

  const clampTranslationX = (value: number, nextScale: number) => {
    'worklet';
    const maxOffset = maxOffsetFor(containerWidth.value, nextScale);
    return clamp(value, -maxOffset, maxOffset);
  };

  const clampTranslationY = (value: number, nextScale: number) => {
    'worklet';
    const maxOffset = maxOffsetFor(containerHeight.value, nextScale);
    return clamp(value, -maxOffset, maxOffset);
  };

  const handlePreviewImageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    containerWidth.value = width;
    containerHeight.value = height;
  }, [containerHeight, containerWidth]);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      const startScale = Math.max(savedScale.value, minScale);
      const nextScale = clamp(startScale * event.scale, minScale, maxScale);
      const scaleFactor = nextScale / startScale;
      const focalXFromCenter = event.focalX - (containerWidth.value / 2);
      const focalYFromCenter = event.focalY - (containerHeight.value / 2);

      const nextX =
        focalXFromCenter - (focalXFromCenter - savedTranslateX.value) * scaleFactor;
      const nextY =
        focalYFromCenter - (focalYFromCenter - savedTranslateY.value) * scaleFactor;

      scale.value = nextScale;
      translateX.value = clampTranslationX(nextX, nextScale);
      translateY.value = clampTranslationY(nextY, nextScale);
    })
    .onEnd(() => {
      const finalScale = clamp(scale.value, minScale, maxScale);
      if (finalScale <= 1.01) {
        scale.value = withTiming(1, { duration: 180 });
        translateX.value = withTiming(0, { duration: 180 });
        translateY.value = withTiming(0, { duration: 180 });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }
      scale.value = finalScale;
      translateX.value = clampTranslationX(translateX.value, finalScale);
      translateY.value = clampTranslationY(translateY.value, finalScale);
      savedScale.value = finalScale;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .shouldCancelWhenOutside(false);

  const panGesture = Gesture.Pan()
    .minDistance(1)
    .averageTouches(true)
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      const currentScale = scale.value;
      if (currentScale <= 1.01) {
        translateX.value = 0;
        translateY.value = 0;
        return;
      }
      const nextX = savedTranslateX.value + event.translationX;
      const nextY = savedTranslateY.value + event.translationY;
      translateX.value = clampTranslationX(nextX, currentScale);
      translateY.value = clampTranslationY(nextY, currentScale);
    })
    .onEnd(() => {
      const currentScale = scale.value;
      if (currentScale <= 1.01) {
        translateX.value = withTiming(0, { duration: 120 });
        translateY.value = withTiming(0, { duration: 120 });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .shouldCancelWhenOutside(false);

  const imageGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const zoomImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handlePressLibrary = useCallback(() => {
    if (disabled) return;
    if (!checkConnectivityBeforeLibrary) {
      onPressLibrary();
      return;
    }
    promptLibraryConnectivity({
      onProceedLibrary: onPressLibrary,
      onUseCamera: onPressCamera,
    });
  }, [checkConnectivityBeforeLibrary, disabled, onPressCamera, onPressLibrary]);

  const handlePressUpload = useCallback(() => {
    if (disabled) return;
    if (onPressUpload) {
      onPressUpload();
      return;
    }
    onPressLibrary();
  }, [disabled, onPressLibrary, onPressUpload]);

  const handleDelete = useCallback(() => {
    if (!onDelete || disabled) return;
    Alert.alert(deleteConfirmTitle, deleteConfirmMessage, [
      { text: deleteConfirmCancelLabel, style: 'cancel' },
      {
        text: deleteConfirmConfirmLabel,
        style: 'destructive',
        onPress: () => {
          setPreviewVisible(false);
          onDelete();
        },
      },
    ]);
  }, [
    deleteConfirmCancelLabel,
    deleteConfirmConfirmLabel,
    deleteConfirmMessage,
    deleteConfirmTitle,
    disabled,
    onDelete,
  ]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!resolvedPreviewUri || resolvedPreviewKind !== 'pdf') {
        setPdfThumbUri(null);
        setPdfThumbLoading(false);
        return;
      }
      if (!hasNativePdfRasterizer) {
        logger.warn('[PhotoCaptureCard] PDF thumbnail unavailable: native rasterizer not available');
        setPdfThumbUri(null);
        setPdfThumbLoading(false);
        return;
      }
      setPdfThumbLoading(true);
      try {
        const cached = await getCachedPdfThumbnail(resolvedPreviewUri);
        if (cancelled) return;
        logger.log('[PhotoCaptureCard] PDF thumbnail cache lookup', {
          hasCached: Boolean(cached),
          uri: resolvedPreviewUri,
        });
        if (cached) {
          setPdfThumbUri(cached);
          setPdfThumbLoading(false);
          return;
        }
        const generated = await generatePdfThumbnail(resolvedPreviewUri);
        if (cancelled) return;
        logger.log('[PhotoCaptureCard] PDF thumbnail generated', {
          hasGenerated: Boolean(generated),
          uri: resolvedPreviewUri,
        });
        setPdfThumbUri(generated);
      } catch {
        logger.warn('[PhotoCaptureCard] PDF thumbnail generation failed', {
          uri: resolvedPreviewUri,
        });
        if (!cancelled) setPdfThumbUri(null);
      } finally {
        if (!cancelled) setPdfThumbLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [resolvedPreviewKind, resolvedPreviewUri]);

  useEffect(() => {
    if (resolvedPreviewKind !== 'pdf') {
      setPdfIconXml(null);
      return;
    }
    let cancelled = false;
    loadPdfIconXml()
      .then((xml) => {
        if (!cancelled) setPdfIconXml(xml);
      })
      .catch(() => {
        if (!cancelled) setPdfIconXml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedPreviewKind]);

  useEffect(() => {
    if (!previewVisible) {
      setPreviewRotationDeg(0);
      resetZoomAnimated();
    }
  }, [previewVisible, resetZoomAnimated, resolvedPreviewUri]);

  return (
    <View style={[styles.card, isError && styles.cardError, style]} onLayout={onLayout}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {showRotateButton && onPressRotate ? (
          <IconRoundButton
            buttonType="rotate"
            accessibilityLabel={`Rotate ${title} anticlockwise`}
            onPress={onPressRotate}
            disabled={disabled || rotateDisabled}
            size="sm"
          />
        ) : null}
      </View>
      {required ? <Text style={styles.required}>Required</Text> : null}
      {headerContent ? <View style={styles.headerContent}>{headerContent}</View> : null}
      {hasPreview ? (
        <Pressable onPress={openPreview} accessibilityRole="button" accessibilityLabel={`Preview ${title}`}>
          <View style={[styles.preview, styles.previewFilled]}>
            {resolvedPreviewKind === 'image' ? (
              <Image
                source={{ uri: effectivePreviewUri ?? undefined }}
                style={[
                  styles.image,
                  { transform: [{ rotate: `${normalizedExternalRotationDeg}deg` }] },
                ]}
                resizeMode="cover"
              />
            ) : resolvedPreviewKind === 'pdf' && pdfThumbUri ? (
              <Image source={{ uri: pdfThumbUri }} style={styles.image} resizeMode="cover" />
            ) : resolvedPreviewKind === 'pdf' ? (
              <View style={styles.pdfBadge}>
                {pdfThumbLoading ? (
                  <ActivityIndicator size="small" color={neutral.onSurface} />
                ) : pdfIconXml ? (
                  <SvgXml xml={pdfIconXml} width={44} height={44} />
                ) : (
                  <Text style={styles.pdfBadgeLabel}>PDF</Text>
                )}
                {previewLabel ? (
                  <Text style={styles.pdfBadgeName} numberOfLines={2}>
                    {previewLabel}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.pdfBadge}>
                <Text style={styles.pdfBadgeLabel}>PDF</Text>
                {previewLabel ? (
                  <Text style={styles.pdfBadgeName} numberOfLines={2}>
                    {previewLabel}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        </Pressable>
      ) : null}
      {helpText ? <Text style={styles.help}>{helpText}</Text> : null}
      {showActionButtons ? (
        <View style={styles.actions}>
          {hasPreview && onDelete ? (
            <IconRoundButton
              buttonType="delete"
              accessibilityLabel={`Remove ${title}`}
              onPress={handleDelete}
              disabled={disabled}
              size={48}
            />
          ) : null}
          {showUploadButton ? (
            <IconRoundButton
              buttonType="upload"
              accessibilityLabel={`Upload ${title}`}
              onPress={handlePressUpload}
              disabled={disabled}
              size={48}
            />
          ) : null}
          <IconRoundButton
            buttonType="camera"
            accessibilityLabel={`Capture ${title}`}
            onPress={onPressCamera}
            disabled={disabled}
            size={48}
          />
          <IconRoundButton
            buttonType="library"
            accessibilityLabel={`Select ${title} from library`}
            onPress={handlePressLibrary}
            disabled={disabled}
            size={48}
          />
        </View>
      ) : null}
      {footerContent ? <View style={styles.footer}>{footerContent}</View> : null}
      {previewVisible ? (
        <Modal
          visible
          transparent
          animationType="slide"
          presentationStyle="fullScreen"
          statusBarTranslucent
          onRequestClose={() => {
            void closePreview();
          }}
        >
          <GestureHandlerRootView style={styles.previewGestureRoot}>
            <View style={styles.previewBackdrop}>
              <SafeAreaView style={styles.previewSafeArea} edges={['top']}>
                <Pressable
                  style={StyleSheet.absoluteFillObject}
                  onPress={() => {
                    void closePreview();
                  }}
                />
                <View style={styles.previewModalCard}>
                  <View style={styles.previewHeader}>
                    <View style={styles.previewTitleWrap}>
                      <Text style={styles.previewTitle}>{title}</Text>
                    </View>
                    <View style={styles.previewHeaderActions}>
                      {resolvedPreviewUri && resolvedPreviewKind === 'image' && showModalRotateButton ? (
                        <IconRoundButton
                          buttonType="rotate"
                          accessibilityLabel="Rotate image anticlockwise"
                          onPress={onPressRotate ?? rotatePreviewAnticlockwise}
                          disabled={persistingPreview || rotateDisabled}
                          size="sm"
                          style={styles.previewRotateButton}
                        />
                      ) : null}
                      <IconRoundButton
                        buttonType="close"
                        accessibilityLabel="Close preview"
                        onPress={() => {
                          void closePreview();
                        }}
                        disabled={persistingPreview}
                        loading={persistingPreview}
                        size="sm"
                        style={styles.previewCloseButton}
                      />
                    </View>
                  </View>
                  {resolvedPreviewUri && resolvedPreviewKind === 'image' ? (
                    <GestureDetector gesture={imageGesture}>
                      <View
                        collapsable={false}
                        style={styles.previewScrollContent}
                        onLayout={handlePreviewImageLayout}
                      >
                        <Animated.View style={[styles.previewImageWrapper, zoomImageStyle]}>
                          <Image
                            source={{ uri: effectivePreviewUri ?? undefined }}
                            style={[
                              styles.previewModalImage,
                              { transform: [{ rotate: `${combinedPreviewRotationDeg}deg` }] },
                            ]}
                            resizeMode="contain"
                          />
                        </Animated.View>
                      </View>
                    </GestureDetector>
                  ) : resolvedPreviewUri && resolvedPreviewKind === 'pdf' ? (
                    <View style={styles.previewPdfWrap}>
                      <PdfPreview uri={resolvedPreviewUri} />
                    </View>
                  ) : null}
                </View>
              </SafeAreaView>
            </View>
          </GestureHandlerRootView>
        </Modal>
      ) : null}
    </View>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    card: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      padding: 16,
      gap: 12,
    },
    cardError: {
      borderColor: tones.red.base,
      borderWidth: 1,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    title: { fontSize: 16, fontWeight: '700', color: neutral.onSurface, flex: 1 },
    required: { fontSize: 12, fontWeight: '700', color: tones.blue.base },
    headerContent: { marginTop: -4 },
    preview: {
      height: 200,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    previewFilled: {
      borderColor: tones.teal.border,
      backgroundColor: neutral.onBase,
    },
    pdfBadge: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 12,
    },
    pdfBadgeLabel: {
      fontSize: 18,
      fontWeight: '800',
      color: neutral.onSurface,
      letterSpacing: 1,
    },
    pdfBadgeName: {
      fontSize: 12,
      color: neutral.base,
      marginTop: 10,
      textAlign: 'center',
    },
    image: { width: '100%', height: '100%' },
    help: { fontSize: 13, color: neutral.base },
    actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 },
    footer: {
      marginTop: 4,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: neutral.border,
    },
    previewBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      alignItems: 'stretch',
      justifyContent: 'flex-end',
    },
    previewGestureRoot: {
      flex: 1,
    },
    previewSafeArea: {
      flex: 1,
    },
    previewModalCard: {
      width: '100%',
      flex: 1,
      marginTop: Platform.OS === 'ios' ? 32 : 16,
      backgroundColor: neutral.onBase,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 16,
      gap: 12,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingRight: 4,
      paddingLeft: 4,
    },
    previewTitleWrap: {
      flex: 1,
      minHeight: 36,
      justifyContent: 'center',
    },
    previewTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: neutral.onSurface,
      flexShrink: 1,
      textAlign: 'left',
    },
    previewHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
    },
    previewScrollContent: {
      flex: 1,
      overflow: 'hidden',
      borderRadius: 12,
      backgroundColor: neutral.surface,
    },
    previewImageWrapper: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    previewModalImage: {
      width: '100%',
      height: '100%',
      borderRadius: 12,
      backgroundColor: neutral.surface,
    },
    previewPdfWrap: { flex: 1 },
    previewCloseButton: {
      marginLeft: 8,
    },
    previewRotateButton: {
      marginLeft: 8,
    },
  });

export default PhotoCaptureCard;

let pdfIconXmlCache: string | null = null;
let pdfIconXmlPromise: Promise<string | null> | null = null;

async function loadPdfIconXml() {
  if (pdfIconXmlCache) return pdfIconXmlCache;
  if (pdfIconXmlPromise) return pdfIconXmlPromise;
  pdfIconXmlPromise = (async () => {
    try {
      const asset = Asset.fromModule(require('../../assets/icons/pdf.svg'));
      if (!asset.downloaded) {
        await asset.downloadAsync();
      }
      const uri = asset.localUri || asset.uri;
      if (!uri) return null;
      const xml = await FileSystem.readAsStringAsync(uri);
      pdfIconXmlCache = xml;
      return xml;
    } catch (error) {
      logger.warn('[PhotoCaptureCard] Failed to load PDF icon', error);
      return null;
    } finally {
      pdfIconXmlPromise = null;
    }
  })();
  return pdfIconXmlPromise;
}

const THUMB_DIR = 'pdf-thumbs';

function normalizeFileUri(uri: string) {
  if (!uri) return '';
  if (uri.startsWith('file://')) return uri;
  if (uri.startsWith('/')) return `file://${uri}`;
  return uri;
}

function hashString(input: string) {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function extFromUri(uri: string) {
  const clean = uri.split('?')[0] ?? uri;
  const idx = clean.lastIndexOf('.');
  if (idx <= 0 || idx === clean.length - 1) return 'jpg';
  return clean.slice(idx + 1).replace(/[^a-z0-9]/gi, '') || 'jpg';
}

async function getThumbDirUri() {
  const { cacheDirectory } = await getAppDirectories();
  const baseDir = cacheDirectory || null;
  if (!baseDir) return null;
  const normalizedBase = baseDir.replace(/\/+$/, '');
  const dir = `${normalizedBase}/${THUMB_DIR}`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch (e: any) {
    if (!String(e?.message ?? '').includes('exists')) {
      return null;
    }
  }
  return dir;
}

async function getCachedPdfThumbnail(sourceUri: string) {
  const normalized = normalizeFileUri(sourceUri);
  if (!normalized.startsWith('file://')) return null;
  const dir = await getThumbDirUri();
  if (!dir) return null;
  const key = hashString(normalized);
  const target = `${dir}/pdf-thumb-${key}.jpg`;
  try {
    const info = await FileSystem.getInfoAsync(target);
    return info.exists ? target : null;
  } catch {
    return null;
  }
}

async function generatePdfThumbnail(sourceUri: string) {
  const normalized = normalizeFileUri(sourceUri);
  if (!normalized.startsWith('file://')) return null;
  const dir = await getThumbDirUri();
  if (!dir) return null;
  const key = hashString(normalized);
  const rasterized = await rasterizePdf(normalized, 150);
  try {
    const first = rasterized.pages[0];
    if (!first?.uri) return null;
    const ext = extFromUri(first.uri);
    const target = `${dir}/pdf-thumb-${key}.${ext}`;
    await FileSystem.copyAsync({ from: first.uri, to: target });
    return target;
  } finally {
    await rasterized.cleanup().catch(() => {});
  }
}
