import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, Platform, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Screen from '../../../src/components/Screen';
import PageHeader from '../../../src/components/PageHeader';
import PageScrollView from '../../../src/components/PageScrollView';
import Button from '../../../src/components/Button';
import ProcessingOverlay from '../../../src/components/ProcessingOverlay';
import { useTones } from '../../../src/theme/tones';
import { getById, listByType } from '../../../src/data/sqlite';
import { Application, Membership, Profile, SupportingStatement } from '../../../src/data/types';
import { finaliseApplication } from '../../../src/utils/finaliseApplication';
import { formatCountText, formatCurrency, resolvePricingForApplication } from '../../../src/utils/pricing';
import { appConfig } from '../../../src/config/appConfig';
import { resolveApplicationCompetencyCertificates, resolveApplicationFirearms } from '../../../src/pdf/context';
import {
  buildExpiredSelectionWarningCopy,
  buildSubmittedApplicationWarningCopy,
  buildSubmittedApplicationWarningIssues,
} from '../../../src/utils/documentIssues';
import { logger } from '@/src/utils/logger';
import { PdfPageProgress } from '../../../src/pdf/supporting';
import { useIapPurchase } from '../../../src/iap/useIapPurchase';
import { clearIapDebugLog, getIapDebugLog } from '../../../src/iap/storage';
import { useDevMode } from '../../../src/providers/DevModeProvider';
import { getProofOfAddressFreshness } from '../../../src/utils/proofOfAddressFreshness';
import { buildMembershipSubmissionWarningCopy, getMembershipSubmissionValidity } from '../../../src/utils/membershipSubmissionValidity';
import { buildMembershipDocumentFreshnessCopy, getMembershipDocumentFreshness } from '../../../src/utils/membershipDocumentFreshness';
import { isDemoDatasetActive } from '../../../src/demo/demoState';
import { useLock } from '../../../src/providers/LockProvider';
import { isDeviceOffline } from '../../../src/utils/connectivity';
import {
  buildSupportingStatementFreshnessCopy,
  getSupportingStatementFreshness,
  resolveSupportingStatementsForApplication,
} from '../../../src/utils/supportingStatementFreshness';

type PaymentStatus = 'idle' | 'success' | 'failure';

export default function ApplicationPaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const { devModeEnabled, testPaymentEnabled } = useDevMode();
  const { eraseAndReset } = useLock();
  const [processingLabel, setProcessingLabel] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<PdfPageProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [iapDebug, setIapDebug] = useState<string[]>([]);
  const [lastIapError, setLastIapError] = useState<string | null>(null);
  const [iapStorageLog, setIapStorageLog] = useState<string[]>([]);
  const [demoDatasetActive, setDemoDatasetActive] = useState(false);

  const id = useMemo(() => {
    const raw = params.id;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value ? String(value) : '';
  }, [params.id]);

  useEffect(() => {
    setIapDebug([]);
    setLastIapError(null);
    setIapStorageLog([]);
    clearIapDebugLog();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const active = await isDemoDatasetActive();
      if (!cancelled) setDemoDatasetActive(active);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showDemoDataBlockedAlert = useCallback(() => {
    Alert.alert(
      'Demo data active',
      'You must erase demo data and reset the app before paying or finalising this application.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset app',
          style: 'destructive',
          onPress: () => {
            router.push('/reset' as any);
          },
        },
      ],
    );
  }, [router]);

  const application = useMemo(
    () => (id ? getById<Application>(id) : undefined),
    [id],
  );
  const applicantProfile = useMemo(
    () =>
      application?.applicantProfileId
        ? getById<Profile>(String(application.applicantProfileId)) ?? undefined
        : undefined,
    [application?.applicantProfileId],
  );

  const pricing = useMemo(() => {
    if (!application) return null;
    return resolvePricingForApplication(application);
  }, [application]);

  const effectivePaymentBehaviour = testPaymentEnabled ? 'test' : appConfig.features.paymentBehaviour;
  const isIap = effectivePaymentBehaviour === 'iap';
  const isIapPlatform = Platform.OS === 'ios' || Platform.OS === 'android';
  const pushIapDebug = useCallback((message: string, data?: Record<string, unknown>) => {
    const payload = data ? ` ${JSON.stringify(data)}` : '';
    setIapDebug((prev) => [...prev.slice(-5), `${message}${payload}`]);
    const dataMessage = typeof data?.message === 'string' ? data.message : null;
    const hasErrorSignal = message.toLowerCase().includes('error') || message.toLowerCase().includes('failed');
    if (dataMessage || hasErrorSignal) {
      setLastIapError(dataMessage ?? message);
    }
  }, []);
  const handleIapPhaseChange = useCallback((phase: 'finalising_application_bundle') => {
    if (phase === 'finalising_application_bundle') {
      setProcessingLabel('Finalising application bundle...');
      setProcessingProgress(null);
    }
  }, []);
  const handleIapProgressChange = useCallback((progress: PdfPageProgress) => {
    setProcessingLabel(progress.label || 'Finalising application bundle...');
    setProcessingProgress(progress);
  }, []);
  const { selectedProduct, purchase, storePriceLabel, priceLoading } = useIapPurchase(
    application ?? undefined,
    pushIapDebug,
    handleIapPhaseChange,
    handleIapProgressChange,
  );

  useEffect(() => {
    if (!devModeEnabled || !isIap || !isIapPlatform) return;
    const tick = () => setIapStorageLog(getIapDebugLog());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [devModeEnabled, isIap, isIapPlatform]);

  const amountLabel = pricing?.product?.formText ?? 'Amount due';
  const amountValue = isIap
    ? (storePriceLabel ?? '—')
    : pricing?.amount !== null && pricing?.amount !== undefined
      ? formatCurrency(pricing.amount, pricing.currency)
      : '—';
  const countText = pricing?.product?.countText
    ? formatCountText(pricing.product.countText, pricing.count)
    : null;
  const countTextWithValue = countText ? `${countText} (${pricing?.count ?? 0})` : null;
  const invoiceText = isIap && selectedProduct
    ? selectedProduct.refName
    : pricing?.product?.invoiceText ?? null;
  const selectedFirearms = useMemo(
    () => (application ? resolveApplicationFirearms(application) : []),
    [application]
  );
  const selectedCertificates = useMemo(
    () => (application ? resolveApplicationCompetencyCertificates(application) : []),
    [application]
  );
  const selectedMemberships = useMemo(() => {
    if (!application) return [] as Membership[];
    const ids = new Set(
      (Array.isArray(application.membershipIds) ? application.membershipIds : [])
        .filter(Boolean)
        .map(String)
    );
    if (!ids.size) return [] as Membership[];
    return listByType<Membership>('Membership').filter((membership) => membership?.id && ids.has(String(membership.id)));
  }, [application]);
  const selectedSupportingStatements = useMemo(() => {
    if (!application) return [] as SupportingStatement[];
    return resolveSupportingStatementsForApplication(
      application,
      listByType<SupportingStatement>('SupportingStatement'),
    );
  }, [application]);
  const submittedWarningState = useMemo(
    () =>
      buildSubmittedApplicationWarningIssues({
        form: application?.form ?? (application as any)?.type,
        selectedFirearms,
        selectedCertificates,
      }),
    [selectedCertificates, selectedFirearms]
  );
  const hasExpiredFirearm =
    !submittedWarningState.hasSubmittedFirearm &&
    (application?.includesExpiredLicences ?? []).length > 0;
  const hasExpiredCompetency =
    !submittedWarningState.hasSubmittedCompetency &&
    (application?.includesExpiredCompetencies ?? []).length > 0;
  const submittedCopy = buildSubmittedApplicationWarningCopy({
    hasSubmittedFirearm: submittedWarningState.hasSubmittedFirearm,
    hasSubmittedCompetency: submittedWarningState.hasSubmittedCompetency,
  });
  const expiredCopy = buildExpiredSelectionWarningCopy({
    hasExpiredFirearm,
    hasExpiredCompetency,
  });
  const proofOfAddressFreshness = useMemo(
    () => getProofOfAddressFreshness(applicantProfile?.proofOfAddressDate),
    [applicantProfile?.proofOfAddressDate],
  );
  const proofOfAddressWarningCopy =
    proofOfAddressFreshness.status === 'warning'
      ? `Your proof of address date is more than ${appConfig.documentFreshness.proofOfAddress.warningAgeDays} days old. Upload a newer document before it reaches ${appConfig.documentFreshness.proofOfAddress.expiryAgeDays} days.`
      : null;
  const membershipSubmissionValidity = useMemo(
    () => getMembershipSubmissionValidity(selectedMemberships),
    [selectedMemberships],
  );
  const membershipDocumentFreshness = useMemo(
    () => getMembershipDocumentFreshness(selectedMemberships),
    [selectedMemberships],
  );
  const membershipWarningCopy = buildMembershipSubmissionWarningCopy(membershipSubmissionValidity);
  const hasExpiredMembershipForSubmission = membershipSubmissionValidity.status === 'expired';
  const membershipDocumentWarningCopy = buildMembershipDocumentFreshnessCopy(membershipDocumentFreshness);
  const hasExpiredMembershipDocumentForSubmission = membershipDocumentFreshness.status === 'expired';
  const supportingStatementFreshness = useMemo(
    () => getSupportingStatementFreshness(selectedSupportingStatements),
    [selectedSupportingStatements],
  );
  const supportingStatementWarningCopy = buildSupportingStatementFreshnessCopy(supportingStatementFreshness);
  const hasExpiredSupportingStatementForSubmission = supportingStatementFreshness.status === 'expired';
  const paymentOfflineMessage = 'Your device appears to be offline. Internet access is required to complete payment.';
  const paymentWarningParagraphs = [
    submittedCopy,
    expiredCopy,
    proofOfAddressWarningCopy,
    membershipWarningCopy,
    membershipDocumentWarningCopy,
    supportingStatementWarningCopy,
  ].filter(Boolean) as string[];
  const hasPaymentWarnings = paymentWarningParagraphs.length > 0;
  const paymentWarningTail = [
    expiredCopy ? 'This might affect the outcome of the application.' : null,
    'Note that once payment has been submitted it cannot be refunded. Are you sure you want to continue?',
  ]
    .filter(Boolean)
    .join('\n\n');
  const paymentWarningCopy = hasPaymentWarnings
    ? `${paymentWarningParagraphs.join('\n\n')}\n\n${paymentWarningTail}`
    : undefined;

  const buildBlockedPaymentWarningCopy = useCallback(
    (extraWarnings: string[]) => {
      const combined = [...paymentWarningParagraphs, ...extraWarnings].filter(Boolean);
      return combined.join('\n\n');
    },
    [paymentWarningParagraphs],
  );

  const handleBack = useCallback(() => {
    if (id) {
      router.replace({ pathname: '/application/[id]/ready-actions', params: { id } } as any);
      return;
    }
    router.replace('/application/ready' as any);
  }, [id, router]);

  const handlePayNow = useCallback(async () => {
    if (!application) return;
    if (demoDatasetActive) {
      showDemoDataBlockedAlert();
      return;
    }
    const offline = await isDeviceOffline();
    const proceed = async () => {
      if (hasExpiredMembershipForSubmission || hasExpiredMembershipDocumentForSubmission || hasExpiredSupportingStatementForSubmission) {
        Alert.alert(
          hasExpiredMembershipForSubmission
            ? 'Membership expired'
            : hasExpiredMembershipDocumentForSubmission
              ? 'Membership document issue date expired'
              : 'Character reference expired',
          membershipWarningCopy ?? membershipDocumentWarningCopy ?? supportingStatementWarningCopy ?? 'A selected character reference is out of date.',
        );
        return;
      }
      if (isIap) {
        setProcessingLabel('Processing payment...');
        setLoading(true);
        const result = await purchase();
        if (result.status === 'success' || result.status === 'already_paid') {
          await new Promise((resolve) => setTimeout(resolve, 300));
        } else {
          setLoading(false);
          setProcessingLabel(null);
          if (result.status === 'cancelled') {
            setPaymentStatus('idle');
            return;
          }
          const message = 'message' in result ? result.message : 'Payment could not be completed.';
          setLastIapError(message);
          if (!/IAP native module unavailable/i.test(message)) {
            Alert.alert('Payment not available', message);
          }
          setPaymentStatus('failure');
          return;
        }
      }
      setPaymentStatus('success');
      if (isIap) {
        setLoading(false);
        setProcessingLabel(null);
      }
    };
    if (offline) {
      Alert.alert('Warning!', buildBlockedPaymentWarningCopy([paymentOfflineMessage]));
      return;
    }
    if (paymentWarningCopy) {
      Alert.alert(
        'Warning!',
        paymentWarningCopy,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', style: 'destructive', onPress: proceed },
        ],
      );
      return;
    }
    await proceed();
  }, [application, buildBlockedPaymentWarningCopy, demoDatasetActive, hasExpiredMembershipDocumentForSubmission, hasExpiredMembershipForSubmission, hasExpiredSupportingStatementForSubmission, isIap, membershipDocumentWarningCopy, membershipWarningCopy, paymentOfflineMessage, paymentWarningCopy, purchase, showDemoDataBlockedAlert, supportingStatementWarningCopy]);

  const handlePayFail = useCallback(() => {
    if (!application) return;
    if (demoDatasetActive) {
      showDemoDataBlockedAlert();
      return;
    }
    if (hasExpiredMembershipForSubmission || hasExpiredMembershipDocumentForSubmission || hasExpiredSupportingStatementForSubmission) {
      Alert.alert(
        hasExpiredMembershipForSubmission
          ? 'Membership expired'
          : hasExpiredMembershipDocumentForSubmission
            ? 'Membership document issue date expired'
            : 'Character reference expired',
        membershipWarningCopy ?? membershipDocumentWarningCopy ?? supportingStatementWarningCopy ?? 'A selected character reference is out of date.',
      );
      return;
    }
    const proceed = () => setPaymentStatus('failure');
    if (paymentWarningCopy) {
      Alert.alert(
        'Warning!',
        paymentWarningCopy,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', style: 'destructive', onPress: proceed },
        ],
      );
      return;
    }
    proceed();
  }, [application, demoDatasetActive, hasExpiredMembershipDocumentForSubmission, hasExpiredMembershipForSubmission, hasExpiredSupportingStatementForSubmission, membershipDocumentWarningCopy, membershipWarningCopy, paymentWarningCopy, showDemoDataBlockedAlert, supportingStatementWarningCopy]);

  const handlePayTest = useCallback(() => {
    if (!application) return;
    if (demoDatasetActive) {
      showDemoDataBlockedAlert();
      return;
    }
    if (hasExpiredMembershipForSubmission || hasExpiredMembershipDocumentForSubmission || hasExpiredSupportingStatementForSubmission) {
      Alert.alert(
        hasExpiredMembershipForSubmission
          ? 'Membership expired'
          : hasExpiredMembershipDocumentForSubmission
            ? 'Membership document issue date expired'
            : 'Character reference expired',
        membershipWarningCopy ?? membershipDocumentWarningCopy ?? supportingStatementWarningCopy ?? 'A selected character reference is out of date.',
      );
      return;
    }
    const proceed = () => setPaymentStatus('success');
    if (paymentWarningCopy) {
      Alert.alert(
        'Warning!',
        paymentWarningCopy,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', style: 'destructive', onPress: proceed },
        ],
      );
      return;
    }
    proceed();
  }, [application, demoDatasetActive, hasExpiredMembershipDocumentForSubmission, hasExpiredMembershipForSubmission, hasExpiredSupportingStatementForSubmission, membershipDocumentWarningCopy, membershipWarningCopy, paymentWarningCopy, showDemoDataBlockedAlert, supportingStatementWarningCopy]);

  const handleContinue = useCallback(async () => {
    if (!application) return;
    if (demoDatasetActive) {
      showDemoDataBlockedAlert();
      return;
    }
    const latest = getById<Application>(application.id) ?? application;
    if (latest.status === 'submitted') {
      handleBack();
      return;
    }
    setProcessingLabel('Finalising application...');
    setProcessingProgress(null);
    setLoading(true);
    try {
      await finaliseApplication(latest, {
        onProgress: (progress) => {
          setProcessingLabel(progress.label || 'Finalising application bundle...');
          setProcessingProgress(progress);
        },
      });
      handleBack();
    } catch (err: any) {
      logger.warn('payment finalise error', err);
      setPaymentStatus('failure');
      Alert.alert('Payment failed', err?.message ?? 'An unexpected error occurred while finalising your application.');
    } finally {
      setLoading(false);
      setProcessingLabel(null);
      setProcessingProgress(null);
    }
  }, [application, demoDatasetActive, handleBack, showDemoDataBlockedAlert]);

  const handleRetry = useCallback(async () => {
    if (!demoDatasetActive && (await isDeviceOffline())) {
      Alert.alert('Warning!', buildBlockedPaymentWarningCopy([paymentOfflineMessage]));
      return;
    }
    setPaymentStatus('idle');
  }, [buildBlockedPaymentWarningCopy, demoDatasetActive, paymentOfflineMessage]);

  const handleSupportPress = useCallback(async () => {
    const url = 'https://www.guncerts.co.za/support.html';
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Unable to open link', 'Please try again later.');
      return;
    }
    Linking.openURL(url);
  }, []);

  const isSuccess = paymentStatus === 'success';
  const isFailure = paymentStatus === 'failure';
  const showAmount = paymentStatus === 'idle';
  const titleText = isSuccess ? 'Payment successful' : isFailure ? 'Payment unsuccessful' : 'Complete payment';
  const titleColor = isSuccess
    ? tones.green.base
    : isFailure
      ? tones.red.base
      : tones.blue.emphasis;
  const statusIcon = isSuccess ? 'checkmark-circle' : 'close-circle';
  const statusColor = isSuccess ? tones.green.base : tones.red.base;

  const payDisabled =
    !application ||
    application.status !== 'ready' ||
    loading ||
    isSuccess ||
    demoDatasetActive ||
    (isIap && isIapPlatform && (!selectedProduct || priceLoading));
  const showTestButtons = effectivePaymentBehaviour === 'test';
  const showFailureButton = showTestButtons;
  const showIapWarning = isIap && isIapPlatform && !selectedProduct;

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader title={showFailureButton ? 'Payment (testing)' : 'Payment'} />

        <PageScrollView contentContainerStyle={styles.body}>
          {hasPaymentWarnings || showIapWarning ? null : (
            <>
              <Text style={[styles.title, { color: titleColor }]}>{titleText}</Text>
            </>
          )}

          {hasPaymentWarnings || showIapWarning || paymentStatus !== 'idle' ? null : (
            <>
              <Text style={styles.copy}>
                Confirm the amount and proceed to finalise your application.
              </Text>
            </>
          )}
          
          {hasPaymentWarnings ? (
            <View style={styles.expiredCard}>
              <View style={styles.expiredPill}>
                <Text style={styles.expiredPillText}>Warning!</Text>
              </View>
              <View style={styles.warningList}>
                {paymentWarningParagraphs.map((item, index) => (
                  <View key={`${item}-${index}`} style={styles.warningListItem}>
                    <Text style={styles.warningBullet}>{'\u2022'}</Text>
                    <Text style={styles.warningText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {showAmount ? (
            <View style={[styles.amountCard, hasPaymentWarnings || showIapWarning ? styles.amountCardExpired : null]}>
              <Text style={[styles.amountValue, hasPaymentWarnings || showIapWarning ? styles.amountValueExpired : null]}>
                {amountLabel}
              </Text>
              {countTextWithValue && !showIapWarning ? (
                <Text style={[
                  styles.amountHint,
                  styles.amountHintBold,
                  hasPaymentWarnings ? styles.amountHintExpired : null,
                ]}>
                  {countTextWithValue}
                </Text>
              ) : null}
              {invoiceText && !showIapWarning ? (
                <Text style={[styles.amountHint, hasPaymentWarnings ? styles.amountHintExpired : null]}>
                  <Text style={[styles.amountHintBold, hasPaymentWarnings ? styles.amountHintExpired : null]}>
                    Product:{' '}
                  </Text>
                  {invoiceText}
                </Text>
              ) : null}
              {!pricing?.product ? (
                <Text style={[styles.amountHint, hasPaymentWarnings ? styles.amountHintExpired : null]}>
                  Pricing unavailable.
                </Text>
              ) : null}
              {showIapWarning ? (
                <View style={styles.iapWarning}>
                  <Pressable
                    onPress={handleSupportPress}
                    accessibilityRole="button"
                    style={({ pressed }: { pressed: boolean }) => pressed && { opacity: 0.85 }}
                  >
                    <Text style={[styles.iapWarningText, hasPaymentWarnings ? styles.amountHintExpired : null]}>
                      In-App Purchases product not configured for this application. Please tap this box to get in touch with support.
                    </Text>
                  </Pressable>
                </View>
              ) : (
                isIap && isIapPlatform && priceLoading ? (
                <View style={styles.priceLoadingRow}>
                    <ActivityIndicator size="small" color={hasPaymentWarnings ? tones.red.base : tones.blue.emphasis} />
                    <Text style={[styles.amountHint, hasPaymentWarnings ? styles.amountHintExpired : null]}>
                      Fetching price…
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.amountValueRight, hasPaymentWarnings ? styles.amountValueExpired : null]}>
                    {`Total: ${amountValue}`}
                  </Text>
                )
              )}
            </View>
          ) : (
            <View style={[styles.statusCard, isFailure ? styles.statusCardFailure : null, { borderColor: statusColor }]}>
              <View style={styles.statusRow}>
                <Ionicons name={statusIcon} size={22} color={statusColor} />
              </View>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {isSuccess ? 'Done!' : 'Payment failed'}
              </Text>
            </View>
          )}
          {devModeEnabled && isIap && isIapPlatform ? (
            <View style={styles.iapDebug}>
              <Text style={styles.iapDebugTitle}>IAP Debug</Text>
              <Text style={styles.iapDebugText}>{`platform=${Platform.OS}`}</Text>
              <Text style={styles.iapDebugText}>{`sku=${selectedProduct
                ? Platform.OS === 'ios'
                  ? selectedProduct.platform.apple.productId
                  : selectedProduct.platform.google.productId
                : 'n/a'}`}</Text>
              <Text style={styles.iapDebugText}>{`product=${selectedProduct?.internalId ?? 'n/a'}`}</Text>
              <Text style={styles.iapDebugText}>{`lastError=${lastIapError ?? 'none'}`}</Text>
              {iapStorageLog.length > 0 ? iapStorageLog.map((line, index) => (
                <Text key={`iap-storage-${index}`} style={styles.iapDebugText}>
                  {line}
                </Text>
              )) : (
                <Text style={styles.iapDebugText}>iap storage: no entries yet</Text>
              )}
              {iapDebug.length > 0 ? iapDebug.map((line, index) => (
                <Text key={`${line}-${index}`} style={styles.iapDebugText}>
                  {line}
                </Text>
              )) : (
                <Text style={styles.iapDebugText}>no events yet</Text>
              )}
            </View>
          ) : null}

          {!application ? (
            <Text style={styles.warning}>Application not found.</Text>
          ) : application.status !== 'ready' ? (
            <Text style={styles.warning}>This application is not ready for payment.</Text>
          ) : null}

          <View style={styles.actions}>
            {paymentStatus === 'idle' ? (
              <>
                {isIap && isIapPlatform ? (
                  <>
                    <Button
                      label="Complete payment"
                      onPress={handlePayNow}
                      tone="teal"
                      disabled={payDisabled}
                      centerText
                      centerContent
                      align="center"
                    />
                  </>
                ) : (
                  <>
                    {/* <Button
                      label="Pay now"
                      onPress={handlePayNow}
                      tone="teal"
                      disabled={payDisabled}
                      centerText
                      centerContent
                      align="center"
                    /> */}
                    {showTestButtons ? (
                      <Button
                        label="Pay now (test: success)"
                        onPress={handlePayTest}
                        tone="teal"
                        disabled={loading || isSuccess}
                        centerText
                        centerContent
                        align="center"
                      />
                    ) : null}
                    {showTestButtons ? (
                      <Button
                        label="Pay now (test: fail)"
                        onPress={handlePayFail}
                        tone="orange"
                        disabled={loading || isSuccess}
                        centerText
                        centerContent
                        align="center"
                      />
                    ) : null}
                  </>
                )}
                <Button
                  label="Cancel"
                  onPress={handleBack}
                  tone="grey"
                  variant="solid"
                  backgroundColor={tones.grey.base}
                  textColor={neutral.onBase}
                  centerText
                  centerContent
                  align="center"
                />
              </>
            ) : isFailure ? (
              <>
                <Button
                  label="Retry payment"
                  onPress={handleRetry}
                  tone="teal"
                  centerText
                  centerContent
                  align="center"
                />
                <Button
                  label="Contact support"
                  onPress={handleSupportPress}
                  tone="purple"
                  centerText
                  centerContent
                  align="center"
                />
                <Button
                  label="Cancel"
                  onPress={handleBack}
                  tone="grey"
                  variant="solid"
                  backgroundColor={tones.grey.base}
                  textColor={neutral.onBase}
                  centerText
                  centerContent
                  align="center"
                />
              </>
            ) : (
              <Button
                label="Continue"
                onPress={handleContinue}
                tone="green"
                centerText
                centerContent
                align="center"
              />
            )}
          </View>
        </PageScrollView>
      </View>

      <ProcessingOverlay
        visible={!!processingLabel}
        label={processingLabel ?? 'Processing payment...'}
        progressCurrent={processingProgress?.current}
        progressTotal={processingProgress?.total}
        progressDelayMs={1000}
      />
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    container: { flex: 1, paddingBottom: 20 },
    body: { gap: 16, paddingTop: 12, paddingBottom: 20 },
    title: { fontSize: 20, fontWeight: '700', color: neutral.onSurface },
    copy: { fontSize: 14, color: neutral.base, lineHeight: 20 },
    amountCard: {
      backgroundColor: neutral.onBase,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tones.blue.emphasis,
      padding: 16,
      gap: 8,
    },
    amountValue: { fontSize: 24, fontWeight: '700', color: tones.blue.emphasis, paddingBottom: 8 },
    amountValueRight: { fontSize: 24, fontWeight: '700', color: tones.blue.emphasis, textAlign: 'right', paddingTop: 8 },
    amountHint: { fontSize: 14, color: tones.blue.base },
    iapWarning: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: tones.red.border,
      padding: 10,
    },
    iapWarningText: { fontSize: 14, color: tones.red.base },
    amountHintBold: { fontWeight: '700' },
    warning: { fontSize: 13, color: tones.red.base },
    iapDebug: {
      marginTop: 8,
      gap: 4,
      padding: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: tones.grey.border,
      backgroundColor: tones.grey.surface,
    },
    iapDebugTitle: { fontSize: 12, fontWeight: '700', color: tones.grey.onSurface },
    iapDebugText: { fontSize: 11, color: tones.grey.onSurface },
    statusCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      alignItems: 'center',
      gap: 8,
    },
    statusCardFailure: {
      backgroundColor: tones.red.surface,
    },
    expiredCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tones.red.border,
      backgroundColor: tones.red.surface,
      padding: 16,
      gap: 10,
    },
    expiredPill: {
      width: '100%',
      backgroundColor: tones.red.base,
      borderRadius: 10,
      paddingVertical: 6,
      paddingHorizontal: 10,
      marginBottom: 10,
    },
    expiredPillText: {
      color: neutral.onBase,
      fontWeight: '700',
      textAlign: 'center',
    },
    expiredCardText: {
      color: tones.red.base,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
    },
    warningList: {
      gap: 10,
    },
    warningListItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    warningBullet: {
      color: tones.red.base,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '700',
    },
    warningText: {
      flex: 1,
      color: tones.red.base,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
    },
    statusRow: { alignItems: 'center', justifyContent: 'center' },
    statusText: { fontSize: 18, fontWeight: '700' },
    actions: { gap: 12, marginTop: 8 },
    amountCardExpired: {
      borderColor: tones.red.border,
    },
    amountValueExpired: {
      color: tones.red.base,
    },
    amountHintExpired: {
      color: tones.red.base,
    },
    priceLoadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      justifyContent: 'flex-end',
      minHeight: 32,
    },
  });
