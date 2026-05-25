import React, { useMemo } from 'react';
import { Alert, Linking, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTones } from '../theme/tones';
import { useThemeMode } from '../providers/ThemeModeProvider';
import { getScrimColor } from '../theme/effects';
import Button from './Button';
import { IconRoundButton } from './RoundIconButton';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { resolveWizardRoute } from '../navigation/helpers';
import { useDevMode } from '../providers/DevModeProvider';
import { useDemoDataResetGuard } from '../demo/useDemoDataResetGuard';
import type { ApplicationIntent, ApplicationTypePreference, WelcomeFlowPreference } from '../data/types';
import HelpModal from './HelpModal';
import { getWelcomeHelpTopicKey } from '../help/helpContent';

const CHECKLIST_ROUTE_MAP: Record<string, string> = {
  profile: '/profile/edit',
  id: '/id/wizard',
  address: '/address/wizard',
  competency: '/competency/wizard',
  proficiency: '/proficiency/wizard',
  safe: '/safe/wizard',
  firearm: '/firearms/wizard',
  membership: '/membership/wizard',
  competencyReadiness: '/competency/wizard',
  safeReadiness: '/safe/wizard',
};

const BUTTON_LABEL_MAP: Record<string, string> = {
  profile: 'Next: Complete profile',
  id: 'Next: Add proof of ID',
  address: 'Next: Add proof of address',
  competency: 'Next: Add competency cert',
  proficiency: 'Next: Add training/proficiency docs',
  safe: 'Next: Add safe photos',
  firearm: 'Next: Add firearm',
  membership: 'Next: Add membership',
  competencyReadiness: 'Next: Add competency cert',
  safeReadiness: 'Next: Add safe photos',
};

export type WelcomeChecklistStatus = {
  profileComplete?: boolean;
  hasIdProof?: boolean;
  hasAddressProof?: boolean;
  hasCompetency?: boolean;
  hasProficiency?: boolean;
  hasFirearm?: boolean;
  hasSafe?: boolean;
  hasMembership?: boolean;
  requiresMembership?: boolean;
  debugProfile?: {
    id?: string;
    email?: string;
    mobile?: string;
  };
};

export type WelcomeMode = 'demo' | 'new' | 'renewal' | 'unknown';
type WelcomeItem = {
  key: string;
  label: string;
  done: boolean;
  comingSoon?: boolean;
};
type WelcomeFlowOption = {
  key: WelcomeFlowPreference;
  label: string;
  comingSoon?: boolean;
};

const WELCOME_FLOW_OPTIONS: WelcomeFlowOption[] = [
  { key: 'new_competency_517', label: 'New competency (517)' },
  // { key: 'new_firearm_271', label: 'New firearm (271)', comingSoon: true },
  { key: 'renew_competency_517g', label: 'Renew competency (517g)' },
  { key: 'renew_firearm_518a', label: 'Renew firearm (518a)' },
];

type WelcomeModalProps = {
  visible: boolean;
  onClose: () => void;
  checklist?: WelcomeChecklistStatus;
  mode: WelcomeMode;
  applicationIntent?: ApplicationIntent;
  applicationType?: ApplicationTypePreference;
  welcomeFlow?: WelcomeFlowPreference;
  onWelcomeFlowChange?: (flow: WelcomeFlowPreference) => void;
  isFirstLoad?: boolean;
};

const WelcomeModal: React.FC<WelcomeModalProps> = ({
  visible,
  onClose,
  checklist,
  mode,
  applicationIntent,
  applicationType,
  welcomeFlow,
  onWelcomeFlowChange,
  isFirstLoad,
}) => {
  const router = useRouter();
  const { devModeEnabled } = useDevMode();
  const guardDemoReset = useDemoDataResetGuard();
  const demoModeActive = mode === 'demo';
  const tones = useTones();
  const neutral = tones.grey;
  const { effectiveMode } = useThemeMode();
  const styles = useMemo(
    () => createStyles(neutral, tones, getScrimColor(effectiveMode, 0.45)),
    [effectiveMode, neutral, tones],
  );
  const requiresMembership = !!checklist?.requiresMembership;
  const resolveInitialFlow = React.useCallback((): WelcomeFlowPreference => {
    if (welcomeFlow) return welcomeFlow;
    if (mode === 'new' && applicationType === 'competency') return 'new_competency_517';
    if (mode === 'new' && applicationType === 'firearm') return 'new_firearm_271';
    if (mode === 'renewal' && applicationType === 'competency') return 'renew_competency_517g';
    if (mode === 'renewal') return 'renew_firearm_518a';
    if (applicationIntent === 'new' && applicationType === 'competency') return 'new_competency_517';
    if (applicationIntent === 'new' && applicationType === 'firearm') return 'new_firearm_271';
    if (applicationIntent === 'renewal' && applicationType === 'competency') return 'renew_competency_517g';
    if (applicationIntent === 'renewal') return 'renew_firearm_518a';
    return 'renew_firearm_518a';
  }, [applicationIntent, applicationType, mode, welcomeFlow]);
  const [selectedFlow, setSelectedFlow] = React.useState<WelcomeFlowPreference | null>(
    isFirstLoad ? null : resolveInitialFlow()
  );
  const [firstLoadSelectionMade, setFirstLoadSelectionMade] = React.useState(false);
  React.useEffect(() => {
    if (!visible) return;
    if (isFirstLoad) {
      setSelectedFlow(null);
      setFirstLoadSelectionMade(false);
    }
  }, [isFirstLoad, visible]);
  React.useEffect(() => {
    if (!visible) return;
    if (isFirstLoad) {
      // On first-load we intentionally start with no selection.
      // Once a flow is chosen, do not clear it again while first-load remains true.
      if (firstLoadSelectionMade) return;
      setSelectedFlow(null);
      return;
    }
    setSelectedFlow(resolveInitialFlow());
  }, [firstLoadSelectionMade, isFirstLoad, resolveInitialFlow, visible]);

  const items = useMemo(() => {
    if (!selectedFlow) return [] as WelcomeItem[];
    const baseItems: WelcomeItem[] = [
      { key: '', label: 'Create a PIN', done: true },
      { key: 'profile', label: 'Complete your profile details.', done: !!checklist?.profileComplete },
      { key: 'id', label: 'Upload a proof of ID.', done: !!checklist?.hasIdProof },
      { key: 'address', label: 'Upload a proof of address.', done: !!checklist?.hasAddressProof },
    ];
    if (selectedFlow === 'new_competency_517') {
      return [
        ...baseItems,
        { key: 'proficiency', label: 'Capture training/proficiency docs.', done: !!checklist?.hasProficiency },
        { key: 'competencyReadiness', label: 'Complete SAPS 517 wizard.', done: false },
      ];
    }
    if (selectedFlow === 'new_firearm_271') {
      return [
        ...baseItems,
        { key: 'competencyReadiness', label: 'Add a competency certificate.', done: !!checklist?.hasCompetency },
        { key: 'safeReadiness', label: 'Upload images of your firearm storage.', done: !!checklist?.hasSafe },
        { key: 'currentOwnerInfo', label: 'Current owner information (coming soon).', done: false, comingSoon: true },
        { key: 'newFirearmDetails', label: 'New firearm details (coming soon).', done: false, comingSoon: true },
      ];
    }
    const renewalItems: WelcomeItem[] = [
      ...baseItems,
      { key: 'competency', label: 'Add a competency certificate.', done: !!checklist?.hasCompetency },
    ];
    if (selectedFlow === 'renew_competency_517g') {
      return renewalItems;
    }
    return [
      ...renewalItems,
      { key: 'safe', label: 'Upload images of your firearm storage.', done: !!checklist?.hasSafe },
      { key: 'firearm', label: 'Add a firearm using your licence card.', done: !!checklist?.hasFirearm },
      ...(requiresMembership
        ? [{ key: 'membership', label: 'Add association membership.', done: !!checklist?.hasMembership }]
        : []),
    ];
  }, [checklist, requiresMembership, selectedFlow]);
  const actionableItems = useMemo(() => items.filter((item) => !item.comingSoon), [items]);
  const hasIncompleteItems = actionableItems.some(item => !item.done);
  const completedCount = actionableItems.filter(item => item.done).length;
  const showFlowSelectionHeading = isFirstLoad === true && !selectedFlow;

  const nextIncomplete = useMemo(
    () => actionableItems.find(item => !item.done && CHECKLIST_ROUTE_MAP[item.key]),
    [actionableItems]
  );
  const nextComingSoon = useMemo(
    () => items.find((item) => !item.done && item.comingSoon),
    [items]
  );

  const buttonLabel = hasIncompleteItems
    ? BUTTON_LABEL_MAP[nextIncomplete?.key as keyof typeof BUTTON_LABEL_MAP] ?? "Let's go!"
    : nextComingSoon
      ? `Next: ${nextComingSoon.label}`
      : 'Next: Create Application';

  const nextRoute = useMemo(
    () => (nextIncomplete ? CHECKLIST_ROUTE_MAP[nextIncomplete.key] : null),
    [nextIncomplete]
  );

  const introFlag = '1';
  const [helpVisible, setHelpVisible] = React.useState(false);
  const helpTopicKey = useMemo(
    () => getWelcomeHelpTopicKey({ mode, applicationIntent, applicationType, welcomeFlow: selectedFlow ?? undefined }),
    [applicationIntent, applicationType, mode, selectedFlow]
  );

  const handlePrimaryPress = () => {
    void (async () => {
      if (!hasIncompleteItems && nextComingSoon) {
        Alert.alert(
          'Coming soon',
          `${nextComingSoon.label.replace(' (coming soon).', '').replace(' (coming soon)', '')} is currently being developed. We'll enable this step in a future release.`
        );
        return;
      }
      if (nextIncomplete?.key === 'firearm' && (await guardDemoReset('firearm'))) return;
      if (nextIncomplete?.key === 'competency' && (await guardDemoReset('competency certificate'))) return;
      if (nextIncomplete?.key === 'safe' && (await guardDemoReset('safe'))) return;

      onClose();
      if (hasIncompleteItems && nextIncomplete) {
        const resolved = resolveWizardRoute(nextIncomplete.key, 'welcomeModal');
        if (resolved) {
          router.replace({
            pathname: resolved.routeTo,
            params: {
              nav: JSON.stringify({
                routeBack: resolved.routeBack,
                clearRouteBackHistory: resolved.clearRouteBackHistory,
                origin: '/(tabs)',
              }),
              intro: introFlag,
            },
          } as any);
          return;
        }
        if (nextRoute) {
          const returnTo = nextIncomplete?.key === 'profile' ? '/(tabs)' : undefined;
          router.replace({
            pathname: nextRoute,
            params: { intro: introFlag, returnTo },
          } as any);
          return;
        }
      }
      router.push('/new-application' as any);
    })();
  };

  const handleTutorialsPress = async () => {
    const url = 'https://www.youtube.com/playlist?list=PLE_nK0ZpxCN1g1FRxie6jXenCBvo0pacH';
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) return;
    Linking.openURL(url);
  };

  const renderStatusIcon = (done: boolean) => {
    const color = done ? tones.green.base : tones.red.base;
    const name = done ? 'checkmark-circle' : 'close-circle';
    return <Ionicons name={name} size={18} color={color} />;
  };
  const renderFlowStatusIcon = (item: WelcomeItem) => {
    if (item.comingSoon) return <Ionicons name="information-circle" size={18} color={neutral.base} />;
    return renderStatusIcon(item.done);
  };

  const handleCreateSampleApplication = () => {
    onClose();
    router.push('/new-application' as any);
  };

  const handleBrowseDemoProfile = () => {
    onClose();
    router.replace('/(tabs)/profile' as any);
  };

  const handleBrowseDemoVault = () => {
    onClose();
    router.replace('/(tabs)/firearms' as any);
  };

  const handleResetApp = () => {
    onClose();
    router.push('/reset' as any);
  };
  const handleHelpPress = () => setHelpVisible(true);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>
              {demoModeActive
                ? "You're using Demo mode"
                : !selectedFlow
                  ? 'Welcome!'
                  : hasIncompleteItems
                    ? 'Welcome!'
                    : 'Congratulations!'}
            </Text>
            <View style={styles.titleActions}>
              {selectedFlow ? (
                <IconRoundButton
                  buttonType="help"
                  accessibilityLabel="Open welcome help"
                  onPress={handleHelpPress}
                  size="sm"
                />
              ) : null}
              <IconRoundButton
                buttonType="close"
                accessibilityLabel="Close welcome modal"
                onPress={onClose}
                size="sm"
              />
            </View>
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {demoModeActive ? (
              <>
                <Text style={styles.lead}>
                  Sample data has been loaded so you can explore GunCerts before adding your own information.
                </Text>
                <View style={styles.demoInfoCard}>
                  <Text style={styles.body}>
                    Browse the demo profile and vault, or create a sample application to walk through the application workflow.
                  </Text>
                  <Text style={styles.body}>
                    Applications can be created, reviewed and finalised. You will not be charged for application finalisation in demo mode.
                  </Text>
                  <Text style={styles.body}>
                    To start with your own information, erase and reset the app.
                  </Text>
                  <Text style={styles.body}>
                    Tap the "Get started" button from the Home tab to get back to this screen.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.flowPills}>
                  {showFlowSelectionHeading ? (
                    <>
                    <Text style={styles.subtitle}>
                      The easiest way to get started with GunCerts is by selecting the application type you're looking to submit to SAPS.
                    </Text>
                    <Text style={styles.subtitle}>
                      This will initiate the wizard process to guide you through the application workflow.
                    </Text>
                    <Text style={styles.subtitle}>
                      Don't worry: you can change the workflow at any time and once you're comfortable with how GunCerts work, you can use the app without the wizard.
                    </Text>
                    </>
                  ) : null}
                  {WELCOME_FLOW_OPTIONS.map((flow) => {
                    const selected = selectedFlow === flow.key;
                    return (
                      <Button
                        key={flow.key}
                        label={flow.comingSoon ? `${flow.label} (coming soon)` : flow.label}
                        onPress={() => {
                          setSelectedFlow(flow.key);
                          setFirstLoadSelectionMade(true);
                          onWelcomeFlowChange?.(flow.key);
                        }}
                        tone={selected ? 'teal' : 'grey'}
                        style={styles.flowPillBtn}
                        labelStyle={styles.flowPillLabel}
                        centerText
                        centerContent
                        contentStyle={{ justifyContent: 'center' }}
                      />
                    );
                  })}
                </View>
                {selectedFlow ? (
                  <>
                    <Text style={styles.lead}>
                      {hasIncompleteItems
                        ? 'The easiest way to get started with GunCerts is by completing and adding the items below.'
                        : "You've captured all required documents! Tap the Create Application button below to create an application."}
                    </Text>
                    <View style={styles.list}>
                      {items.map(item => (
                        <View key={item.key} style={styles.listRow}>
                          {renderFlowStatusIcon(item)}
                          <Text style={[styles.body, item.done && !item.comingSoon && styles.done]}>{item.label}</Text>
                        </View>
                      ))}
                      <Text></Text>
                      {completedCount <= 1 && (
                        <Text style={styles.lead}>NOTE: Items status will change as they are completed:</Text>
                      )}
                    </View>
                  </>
                ) : null}
              </>
            )}
            {devModeEnabled ? (
              <View style={styles.debugCard}>
                <Text style={styles.debugTitle}>Debug</Text>
                <Text style={styles.debugText}>
                  {`profileComplete: ${checklist?.profileComplete ? 'true' : 'false'}`}
                </Text>
                <Text style={styles.debugText}>
                  {`hasIdProof: ${checklist?.hasIdProof ? 'true' : 'false'}`}
                </Text>
                <Text style={styles.debugText}>
                  {`hasAddressProof: ${checklist?.hasAddressProof ? 'true' : 'false'}`}
                </Text>
                <Text style={styles.debugText}>
                  {`hasCompetency: ${checklist?.hasCompetency ? 'true' : 'false'}`}
                </Text>
                <Text style={styles.debugText}>
                  {`hasProficiency: ${checklist?.hasProficiency ? 'true' : 'false'}`}
                </Text>
                <Text style={styles.debugText}>
                  {`hasSafe: ${checklist?.hasSafe ? 'true' : 'false'}`}
                </Text>
                <Text style={styles.debugText}>
                  {`hasFirearm: ${checklist?.hasFirearm ? 'true' : 'false'}`}
                </Text>
                <Text style={styles.debugText}>
                  {`hasMembership: ${checklist?.hasMembership ? 'true' : 'false'}`}
                </Text>
                <Text style={styles.debugText}>
                  {`requiresMembership: ${checklist?.requiresMembership ? 'true' : 'false'}`}
                </Text>
                <Text style={styles.debugText}>
                  {`profile.id: ${checklist?.debugProfile?.id ?? '—'}`}
                </Text>
                <Text style={styles.debugText}>
                  {`profile.email: ${checklist?.debugProfile?.email ?? '—'}`}
                </Text>
                <Text style={styles.debugText}>
                  {`profile.mobile: ${checklist?.debugProfile?.mobile ?? '—'}`}
                </Text>
              </View>
            ) : null}

            {demoModeActive ? (
              <>
                <Button
                  label="Create sample application"
                  onPress={handleCreateSampleApplication}
                  style={styles.inlineCtaBtn}
                  labelStyle={styles.inlineCtaLabel}
                  centerText
                  centerContent
                  contentStyle={{ justifyContent: 'center' }}
                  tone="blue"
                />
                <Button
                  label="Explore demo profile"
                  onPress={handleBrowseDemoProfile}
                  style={styles.inlineCtaBtn}
                  labelStyle={styles.inlineCtaLabel}
                  centerText
                  centerContent
                  contentStyle={{ justifyContent: 'center' }}
                  tone="teal"
                />
                <Button
                  label="Explore demo vault"
                  onPress={handleBrowseDemoVault}
                  style={styles.inlineCtaBtn}
                  labelStyle={styles.inlineCtaLabel}
                  centerText
                  centerContent
                  contentStyle={{ justifyContent: 'center' }}
                  tone="teal"
                />
                <Button
                  label="Erase & reset app"
                  onPress={handleResetApp}
                  style={styles.inlineCtaBtn}
                  labelStyle={styles.inlineCtaLabel}
                  centerText
                  centerContent
                  contentStyle={{ justifyContent: 'center' }}
                  tone="red"
                />
              </>
            ) : selectedFlow ? (
              <>
                <Button
                  label={buttonLabel}
                  onPress={handlePrimaryPress}
                  style={styles.inlineCtaBtn}
                  labelStyle={styles.inlineCtaLabel}
                  centerText
                  centerContent
                  contentStyle={{ justifyContent: 'center' }}
                  tone={hasIncompleteItems ? 'teal' : nextComingSoon ? 'grey' : 'blue'}
                />

                <Button
                  label="View YouTube tutorials"
                  onPress={handleTutorialsPress}
                  style={styles.inlineCtaBtn}
                  labelStyle={styles.inlineCtaLabel}
                  centerText
                  centerContent
                  contentStyle={{ justifyContent: 'center' }}
                  tone="purple"
                />

                <Text style={styles.subtitle}>App buttons and what they do:</Text>
                <View style={styles.buttons}>
                  <View style={styles.buttonRow}>
                    <IconRoundButton
                      buttonType="add"
                      accessibilityLabel="Add new item"
                      size="sm"
                    />
                    <Text style={styles.buttonLabel}>Add new items</Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <IconRoundButton
                      buttonType="edit"
                      accessibilityLabel="Edit item"
                      size="sm"
                    />
                    <Text style={styles.buttonLabel}>Edit an item</Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <IconRoundButton
                      buttonType="save"
                      accessibilityLabel="Save"
                      size="sm"
                    />
                    <Text style={styles.buttonLabel}>Save changes</Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <IconRoundButton
                      buttonType="delete"
                      accessibilityLabel="Delete item"
                      size="sm"
                    />
                    <Text style={styles.buttonLabel}>Delete an item</Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <IconRoundButton
                      buttonType="upload"
                      accessibilityLabel="Upload"
                      size="sm"
                    />
                    <Text style={styles.buttonLabel}>Upload document from device</Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <IconRoundButton
                      buttonType="preview"
                      accessibilityLabel="Preview"
                      size="sm"
                    />
                    <Text style={styles.buttonLabel}>Preview uploaded documents</Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <IconRoundButton
                      buttonType="camera"
                      accessibilityLabel="Camera"
                      size="sm"
                    />
                    <Text style={styles.buttonLabel}>Capture document with camera</Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <IconRoundButton
                      buttonType="library"
                      accessibilityLabel="Photo gallery"
                      size="sm"
                    />
                    <Text style={styles.buttonLabel}>Pick image from photo gallery</Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <IconRoundButton
                      buttonType="rotate"
                      accessibilityLabel="Rotate image anticlockwise"
                      size="sm"
                    />
                    <Text style={styles.buttonLabel}>Rotate image anti-clockwise:</Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <IconRoundButton
                      buttonType="share"
                      accessibilityLabel="Share"
                      size="sm"
                    />
                    <Text style={styles.buttonLabel}>Send/share an application</Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <IconRoundButton
                      buttonType="archive"
                      accessibilityLabel="Archive"
                      size="sm"
                    />
                    <Text style={styles.buttonLabel}>Archive an application</Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <IconRoundButton
                      buttonType="help"
                      accessibilityLabel="Help"
                      size="sm"
                    />
                    <Text style={styles.buttonLabel}>View help content</Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <IconRoundButton
                      buttonType="home"
                      accessibilityLabel="Home"
                      size="sm"
                    />
                    <Text style={styles.buttonLabel}>Return to Home tab</Text>
                  </View>
                </View>
              </>
            ) : null}

          </ScrollView>
          <Button
            label={buttonLabel}
            onPress={handlePrimaryPress}
            style={styles.closeBtn}
            centerText
            centerContent
            contentStyle={{ justifyContent: 'center' }}
            tone={hasIncompleteItems ? 'teal' : 'blue'}
          /> 
        </View>
      </View>
      <HelpModal visible={helpVisible} topicKey={helpTopicKey} onClose={() => setHelpVisible(false)} />
    </Modal>
  );
};

const createStyles = (
  neutral: ReturnType<typeof useTones>['grey'],
  tones: ReturnType<typeof useTones>,
  scrimColor: string,
) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: scrimColor,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 14,
    },
    card: {
      width: '100%',
      maxHeight: '90%',
      backgroundColor: neutral.onBase,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: neutral.border,
      gap: 12,
    },
    content: { paddingBottom: 12, gap: 12 },
    flowPills: { gap: 8 },
    flowPillBtn: { borderRadius: 999, paddingVertical: 10 },
    flowPillLabel: { fontSize: 14, fontWeight: '700' },
    title: { fontSize: 18, fontWeight: '800', color: neutral.onSurface },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    titleActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    subtitle: { fontSize: 14, fontWeight: '600', color: neutral.onSurface, marginTop: 4 },
    body: { color: neutral.base, lineHeight: 20 },
    done: { color: tones.green.onSurface },
    list: { gap: 4, paddingBottom: 8 },
    listRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    lead: { color: neutral.onSurface, fontWeight: '600' },
    debugCard: {
      marginTop: 8,
      marginBottom: 6,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.surface,
      gap: 4,
    },
    debugTitle: { fontSize: 14, fontWeight: '700', color: neutral.onSurface },
    debugText: { fontSize: 12, color: neutral.base },
    demoInfoCard: {
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.surface,
      gap: 8,
    },
    buttons: { gap: 8 },
    buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    buttonLabel: { color: neutral.base, fontSize: 13 },
    inlineCtaBtn: {
      borderRadius: 10,
      paddingVertical: 12,
    },
    inlineCtaLabel: {
      fontSize: 16,
    },
    closeBtn: { marginTop: 4, alignSelf: 'center', minWidth: '70%' },
  });

export default WelcomeModal;
