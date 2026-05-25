import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, Modal, Alert, Platform, Animated, Linking } from 'react-native';
import type { ScrollView as ScrollViewType } from 'react-native';
import { useTones } from '../../src/theme/tones';
import { TAB_SPACING } from '../../src/theme/spacing';
import { useLock } from '../../src/providers/LockProvider';
import { PasscodePad } from '../../src/components/PasscodePad';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { AuthService } from '../../src/services/AuthService';
import Screen from '../../src/components/Screen';
import TabScrollView from '../../src/components/TabScrollView';
import { ensureUserPrefs, ensureDevicePrefs, saveUserPrefs, saveDevicePrefs, now, persist, touch } from '../../src/data/repo';
import { listByType } from '../../src/data/sqlite';
import {
  Application,
  Profile,
  UserPrefs,
  DevicePrefs,
  CompetencyExpiryReminderPreference,
  ApplicationIntent,
  ApplicationTypePreference,
} from '../../src/data/types';
import { useCollapsedPanels } from '../../src/hooks/useCollapsedPanels';
import Button from '../../src/components/Button';
import { InputSheet } from '../../src/components/BottomSheets';
import ProcessingOverlay from '../../src/components/ProcessingOverlay';
import DevToolsSection from '../../src/components/DevToolsSection';
import CollapseToggleChip from '../../src/components/CollapseToggleChip';
import { IconRoundButton } from '../../src/components/RoundIconButton';
import HelpModal from '../../src/components/HelpModal';
import { logger } from '@/src/utils/logger';
import * as ImagePicker from 'expo-image-picker';
import { ensureCameraPermission, ensurePhotoLibraryPermission } from '../../src/utils/permissions';
import { buildSyncSnapshot, loadSyncKeyBundle } from '../../src/sync';
import { appConfig } from '../../src/config/appConfig';
import { useThemeMode } from '../../src/providers/ThemeModeProvider';
import type { ScreenModePreference } from '../../src/theme/screenMode';
import { useHelpModal } from '../../src/help';
import { removeArchivedApplications } from '../../src/utils/removeArchivedApplications';
import RadioPill from '../../src/components/RadioPill';

// const LOCK_OPTIONS = [0, 1, 5, 10, 30]; // minutes; 0 = lock immediately on resume
const SCREEN_MODE_OPTIONS: Array<{ value: ScreenModePreference; label: string }> = [
  { value: 'default', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const APPLICATION_INTENT_OPTIONS: Array<{ value: ApplicationIntent; label: string }> = [
  { value: 'new', label: 'New applications' },
  { value: 'renewal', label: 'Renewals' },
  { value: 'both', label: 'Both' },
];
const APPLICATION_TYPE_OPTIONS: Array<{ value: ApplicationTypePreference; label: string }> = [
  { value: 'competency', label: 'Competency' },
  { value: 'firearm', label: 'Firearm' },
  { value: 'both', label: 'Both' },
];
const COMPETENCY_EXPIRY_OPTIONS: Array<{
  value: CompetencyExpiryReminderPreference;
  label: string;
}> = [
  { value: 'unknown', label: "I don't know" },
  { value: 'compIssueDate', label: 'Competency issue date' },
  { value: 'firearmExpiry', label: 'Firearm expiry date' },
];


const ToggleRow: React.FC<{
  id: string;
  label: string;
  help: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  styles: ReturnType<typeof createStyles>;
}> = ({ id, label, help, value, onValueChange, disabled, styles }) => {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.help}>{help}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
    </View>
  );
};

const CollapsibleCard: React.FC<{
  title: string;
  open: boolean;
  onToggle: (next: boolean) => void;
  children: React.ReactNode;
  styles: ReturnType<typeof createStyles>;
}> = ({ title, open, onToggle, children, styles }) => {
  const [render, setRender] = useState(open);
  const bodyOpacity = useRef(new Animated.Value(open ? 1 : 0)).current;
  const tones = useTones();
  const titleColor = tones.purple.base;

  useEffect(() => {
    if (open) setRender(true);
    Animated.timing(bodyOpacity, { toValue: open ? 1 : 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !open) setRender(false);
    });
  }, [open, bodyOpacity]);

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => onToggle(!open)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.h2}>{title}</Text>
        <CollapseToggleChip
          expanded={open}
          onPress={() => onToggle(!open)}
          tone="purple"
          backgroundColor="transparent"
          borderColor={titleColor}
          textColor={titleColor}
          iconColor={titleColor}
          style={styles.sectionToggleChip}
        />
      </Pressable>
      {render ? (
        <Animated.View style={[styles.sectionCard, { opacity: bodyOpacity }]}>
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
};

export default function SettingsScreen() {
  const router = useRouter();
  const { scroll } = useLocalSearchParams<{ scroll?: 'dev' | 'shareFeedback' }>();
  const { open: openHelp, props: helpModalProps } = useHelpModal();
  const { biometricAvailable, biometricEnabled, enableBiometrics, autoLockMinutes, setAutoLockMinutes, lock } = useLock();
  const profile = listByType<Profile>('Profile')[0];
  const profileId = profile?.id ?? null;
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const [userPrefs, setUserPrefs] = useState<UserPrefs | null>(null);
  const [devicePrefs, setDevicePrefs] = useState<DevicePrefs | null>(null);
  const { setScreenMode } = useThemeMode();
  const scrollRef = useRef<ScrollViewType>(null);
  const devTop = useRef(0);
  const shareFeedbackTop = useRef(0);

  const refreshPrefs = useCallback(() => {
    const currentProfile = listByType<Profile>('Profile')[0] ?? null;
    if (!currentProfile?.id) return;
    setUserPrefs(ensureUserPrefs(currentProfile.id));
    setDevicePrefs(ensureDevicePrefs(currentProfile.id));
  }, []);
  const hasArchivedApplications = listByType<Application>('Application').some(
    (app) => app.status === 'archived',
  );

  useFocusEffect(
    useCallback(() => {
      refreshPrefs();
    }, [refreshPrefs]),
  );

  useEffect(() => {
    refreshPrefs();
  }, [refreshPrefs]);

  const handleWipeComplete = useCallback(() => {
    refreshPrefs();
  }, [refreshPrefs]);

  useEffect(() => {
    if (!scrollRef.current) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scroll === 'dev') {
          scrollRef.current?.scrollTo({ y: Math.max(devTop.current - 8, 0), animated: false });
        }
        if (scroll === 'shareFeedback') {
          scrollRef.current?.scrollTo({ y: Math.max(shareFeedbackTop.current - 8, 0), animated: false });
        }
      });
    });
  }, [scroll]);

  // Sync stored passcode timeout into lock provider minutes when settings loads.
  useEffect(() => {
    if (userPrefs?.passcodeTimeoutSec == null) return;
    const storedMinutes = Math.max(0, Math.round(userPrefs.passcodeTimeoutSec / 60));
    if (storedMinutes !== autoLockMinutes) {
      setAutoLockMinutes(storedMinutes);
    }
  }, [autoLockMinutes, setAutoLockMinutes, userPrefs?.passcodeTimeoutSec]);

    const canToggleBiometric = Platform.OS !== 'web';

  useEffect(() => {
    if (!userPrefs) return;
    let cancelled = false;
    (async () => {
      const perm = await ImagePicker.getCameraPermissionsAsync();
      if (cancelled) return;
      const shouldUse = perm.granted === true;
      if (userPrefs.useCamera !== shouldUse) {
        setUserPref('useCamera', shouldUse);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setUserPref, userPrefs]);

  useEffect(() => {
    if (!userPrefs) return;
    let cancelled = false;
    (async () => {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (cancelled) return;
      const shouldUse = perm.granted === true;
      if (userPrefs.usePhotoLibrary !== shouldUse) {
        setUserPref('usePhotoLibrary', shouldUse);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setUserPref, userPrefs]);


  function setUserPref<K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) {
    if (!userPrefs) return;
    const competencyCalcChanged =
      key === 'dfoCompetencyExpiryUsing' &&
      userPrefs.dfoCompetencyExpiryUsing !== value;
    const next = {
      ...userPrefs,
      [key]: value,
      ...(key === 'dfoCompetencyExpiryUsing'
        ? { compCertCalcMethodSet: true }
        : {}),
      ...(key === 'remindRenewal' && value === false
        ? { remindersResetRequestedAt: new Date().toISOString() }
        : {}),
      ...(competencyCalcChanged
        ? { competencyRemindersResetRequestedAt: new Date().toISOString() }
        : {}),
    } as UserPrefs;
    saveUserPrefs(next);
    setUserPrefs(next);
  }

  const handleBiometricToggle = useCallback(async (value: boolean) => {
    if (!userPrefs) return;
    if (!value) {
      setUserPref('useBiometrics', false);
      await enableBiometrics(false);
      return;
    }

    const access = await AuthService.ensureBiometricAccess('Enable biometric unlock');
    if (!access.ok) {
      setUserPref('useBiometrics', false);
      await enableBiometrics(false);
      if (access.reason === 'disabled_in_settings') {
        Alert.alert(
          'Biometric access disabled',
          'Biometric access is disabled for this app. Open device settings to enable it.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open settings', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      if (access.reason === 'not_enrolled') {
        Alert.alert(
          'Biometrics unavailable',
          'Set up Face ID or fingerprint in your device settings, then try again.'
        );
        return;
      }
      if (access.reason === 'cancelled') {
        Alert.alert('Biometric unlock not enabled', 'Biometric authentication was cancelled.');
        return;
      }
      Alert.alert('Biometric unlock not enabled', 'Biometric authentication is unavailable right now.');
      return;
    }

    setUserPref('useBiometrics', true);
    await enableBiometrics(true);
  }, [enableBiometrics, setUserPref, userPrefs]);

  const handleCameraToggle = useCallback(async (value: boolean) => {
    if (!userPrefs) return;
    if (!value) {
      setUserPref('useCamera', false);
      Alert.alert(
        'Camera access',
        'To revoke camera permission, disable it in the system settings for this app.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    const ok = await ensureCameraPermission({
      title: 'Camera access needed',
      settingsMessage: 'Camera access is disabled. Open Settings to enable it.',
    });
    if (!ok) {
      setUserPref('useCamera', false);
      return;
    }
    setUserPref('useCamera', true);
  }, [setUserPref, userPrefs]);

  const handlePhotoLibraryToggle = useCallback(async (value: boolean) => {
    if (!userPrefs) return;
    if (!value) {
      setUserPref('usePhotoLibrary', false);
      Alert.alert(
        'Photo library access',
        'To revoke photo library permission, disable it in the system settings for this app.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    const ok = await ensurePhotoLibraryPermission({
      title: 'Photo library access needed',
      settingsMessage: 'Photo library access is disabled. Open Settings to enable it.',
      showLimitedAccessAlert: userPrefs?.showPhotoLibraryAlert !== false,
      onDisableLimitedAccessAlert: () => setUserPref('showPhotoLibraryAlert', false),
    });
    if (!ok) {
      setUserPref('usePhotoLibrary', false);
      return;
    }
    setUserPref('usePhotoLibrary', true);
  }, [setUserPref, userPrefs]);

  const [syncSheetVisible, setSyncSheetVisible] = useState(false);
  const [syncPasscodeVisible, setSyncPasscodeVisible] = useState(false);
  const [syncPasscodeValue, setSyncPasscodeValue] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncProcessingLabel, setSyncProcessingLabel] = useState<string | null>(null);
  const [archivedDeleteLabel, setArchivedDeleteLabel] = useState<string | null>(null);

  const closeSyncSheet = useCallback(() => {
    setSyncSheetVisible(false);
  }, []);

  const closeSyncPasscode = useCallback(() => {
    setSyncPasscodeVisible(false);
    setSyncPasscodeValue('');
  }, []);

  const handleSyncToggle = useCallback((value: boolean) => {
    if (!userPrefs) return;
    if (value) {
      setSyncPasscodeVisible(true);
      setSyncPasscodeValue('');
      return;
    }
    Alert.alert(
      'Disable cloud sync?',
      'Your data will remain on this device, but new changes will no longer be backed up to the cloud. Existing cloud data will remain until removed manually.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () => {
            const next = { ...userPrefs, syncToCloud: false, syncLastError: undefined } as UserPrefs;
            saveUserPrefs(next);
            setUserPrefs(next);
          },
        },
      ],
    );
  }, [userPrefs]);

  const handleSyncSave = useCallback(async (passphrase: string, minLength = 8) => {
    if (!userPrefs) return;
    const trimmed = passphrase.trim();
    if (!trimmed) {
      Alert.alert('Passphrase required', 'Enter a passphrase to encrypt and sync your data.');
      return;
    }
    if (trimmed.length < minLength) {
      Alert.alert('Passphrase too short', 'Use at least 8 characters for your sync passphrase.');
      return;
    }
    setSyncBusy(true);
    setSyncProcessingLabel('Preparing data sync... This can take a minute or two.');
    try {
      const snapshot = await buildSyncSnapshot({ profileId: userPrefs.holderProfileId, passphrase: trimmed });
      const bundle = await loadSyncKeyBundle();
      const next = {
        ...userPrefs,
        syncToCloud: true,
        syncKeyId: bundle?.keyId,
        syncLastSnapshotAt: new Date().toISOString(),
        syncLastError: undefined,
      } as UserPrefs;
      saveUserPrefs(next);
      setUserPrefs(next);
      closeSyncSheet();
      closeSyncPasscode();
      Alert.alert('Cloud sync enabled', ``);
    } catch (err: any) {
      logger.warn('[settings] enable sync failed', err);
      Alert.alert(
        'Unable to enable cloud sync',
        err?.message ?? 'An unexpected error occurred while preparing sync data.'
      );
    } finally {
      setSyncBusy(false);
      setSyncProcessingLabel(null);
    }
  }, [closeSyncPasscode, closeSyncSheet, userPrefs]);

  const handleSyncPasscodeComplete = useCallback(async (value: string) => {
    if (syncBusy) return;
    const ok = await AuthService.verifyPasscode(value);
    if (!ok) {
      Alert.alert('Incorrect passcode', 'Please try again.');
      setSyncPasscodeValue('');
      return;
    }
    closeSyncPasscode();
    setSyncProcessingLabel('Preparing data sync... This can take a minute or two.');
    requestAnimationFrame(() => {
      handleSyncSave(value, 1);
    });
  }, [closeSyncPasscode, handleSyncSave, syncBusy]);

  const handleDeleteArchivedApplications = useCallback(() => {
    if (!hasArchivedApplications) {
      Alert.alert('No archived applications', 'There are no archived applications.', [
        { text: 'OK' },
      ]);
      return;
    }
    if (archivedDeleteLabel) return;
    Alert.alert(
      'Delete archived applications?',
      'This cannot be undone. Ensure you have sent yourself a backup before deleting archived applications and their generated PDF files.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setArchivedDeleteLabel('Deleting archived applications...');
              try {
                const removedCount = await removeArchivedApplications();
                if (!removedCount) {
                  Alert.alert('No archived applications', 'There are no archived applications to delete.');
                  return;
                }
                Alert.alert(
                  'Deleted',
                  `Deleted ${removedCount} archived application${removedCount === 1 ? '' : 's'} and removed generated PDF files.`,
                );
              } catch (err: any) {
                logger.warn('[settings] delete archived applications failed', err);
                Alert.alert('Delete failed', err?.message ?? 'Unable to delete archived applications.');
              } finally {
                setArchivedDeleteLabel(null);
              }
            })();
          },
        },
      ],
    );
  }, [archivedDeleteLabel, hasArchivedApplications]);

  function setDevicePref<K extends keyof DevicePrefs>(key: K, value: DevicePrefs[K]) {
    if (!devicePrefs) return;
    const next = { ...devicePrefs, [key]: value } as DevicePrefs;
    saveDevicePrefs(next);
    setDevicePrefs(next);
  }

  const [changing, setChanging] = useState(false);
  const [step, setStep] = useState<'verify' | 'new' | 'confirm'>('verify');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [pin3, setPin3] = useState('');
  const [busy, setBusy] = useState(false);
  const len = 6;
  const { collapsed, setSectionCollapsed } = useCollapsedPanels('settings', ['hints', 'appUse', 'preferences', 'device']);
  const [hintsOpen, setHintsOpen] = useState(!collapsed.hints);
  const [appUseOpen, setAppUseOpen] = useState(!collapsed.appUse);
  const [preferencesOpen, setPreferencesOpen] = useState(!collapsed.preferences);
  const [deviceOpen, setDeviceOpen] = useState(!collapsed.device);

  const startChange = () => {
    setChanging(true);
    setStep('verify');
    setPin1(''); setPin2(''); setPin3('');
    setBusy(false);
  };
  const closeModal = () => setChanging(false);

  const onVerifyComplete = async (v: string) => {
    const ok = await AuthService.verifyPasscode(v);
    if (!ok) {
      Alert.alert('Incorrect passcode', 'Please try again.');
      setPin1('');
      return;
    }
    setStep('new');
  };
  const onNewComplete = (v: string) => {
    setPin2(v);
    setStep('confirm');
  };
  const onConfirmComplete = async (v: string) => {
    if (v !== pin2) {
      Alert.alert('Passcodes do not match', 'Re-enter your new passcode.');
      setPin3('');
      setStep('new');
      return;
    }
    setBusy(true);
    const ok = await AuthService.updatePasscode(pin1, v);
    setBusy(false);
    if (!ok) {
      Alert.alert('Something went wrong', 'Please verify your current passcode and try again.');
      return;
    }
    Alert.alert('Passcode changed', 'Your passcode has been updated.');
    closeModal();
  };

  const LockOption = ({ value }: { value: number }) => {
    const selected = autoLockMinutes === value;
    const label = value === 0 ? 'On resume' : `${value} min`;
    return (
      <RadioPill
        label={label}
        selected={selected}
        onPress={() => { setAutoLockMinutes(value); setUserPref('passcodeTimeoutSec', value * 60); }}
      />
    );
  };

  const handleShareFeedback = useCallback(async () => {
    const url = 'https://www.guncerts.co.za/support.html';
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Unable to open link', 'Please try again later.');
      return;
    }
    Linking.openURL(url);
  }, []);

  const handleOpenTutorials = useCallback(async () => {
    const url = 'https://www.youtube.com/playlist?list=PLE_nK0ZpxCN1g1FRxie6jXenCBvo0pacH';
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Unable to open link', 'Please try again later.');
      return;
    }
    Linking.openURL(url);
  }, []);

  return (
    <Screen>
      <TabScrollView contentContainerStyle={styles.content} ref={scrollRef}>
        <Text style={styles.h1}>Settings</Text>
        <Button
          label="Tutorials"
          sublabel="View our tutorials on our YouTube channel"
          onPress={handleOpenTutorials}
          tone="purple"
        />

        <Button
          label="Feedback & Support"
          sublabel="Reach out via our website"
          onPress={handleShareFeedback}
          tone="purple"
        />

        <CollapsibleCard
          title="Hints"
          open={hintsOpen}
          onToggle={(next) => { setHintsOpen(next); setSectionCollapsed('hints', !next); }}
          styles={styles}
        >
          <ToggleRow
            id="hints.id"
            label="ID wizard tips"
            help="Show tips on how to capture your ID or passport."
            value={userPrefs ? userPrefs.showIdWizardHint !== false : true}
            onValueChange={(v) => setUserPref('showIdWizardHint', v)}
            styles={styles}
          />

          <View style={styles.divider} />
          <ToggleRow
            id="hints.address"
            label="Proof of address tips"
            help="Show tips on how to capture proof of address."
            value={userPrefs ? userPrefs.showAddressWizardHint !== false : true}
            onValueChange={(v) => setUserPref('showAddressWizardHint', v)}
            styles={styles}
          />

          <View style={styles.divider} />
          <ToggleRow
            id="hints.firearm"
            label="Firearm wizard tips"
            help="Show tips on how to effectively capture your firearm licence."
            value={userPrefs ? userPrefs.showFirearmWizardHint !== false : true}
            onValueChange={(v) => setUserPref('showFirearmWizardHint', v)}
            styles={styles}
          />

          <View style={styles.divider} />
          <ToggleRow
            id="hints.competency"
            label="Competency certificate tips"
            help="Show tips on how to effectively capture your competency certificate."
            value={userPrefs ? userPrefs.showCompetencyWizardHint !== false : true}
            onValueChange={(v) => setUserPref('showCompetencyWizardHint', v)}
            styles={styles}
          />

          <View style={styles.divider} />
          <ToggleRow
            id="hints.safe"
            label="Firearm storage tips"
            help="Show tips on what images of your firearm storage to include."
            value={userPrefs ? userPrefs.showSafeWizardHint !== false : true}
            onValueChange={(v) => setUserPref('showSafeWizardHint', v)}
            styles={styles}
          />

          <View style={styles.divider} />
          <ToggleRow
            id="hints.membership"
            label="Membership tips"
            help="Show tips on how to capture your membership details."
            value={userPrefs ? userPrefs.showMembershipWizardHint !== false : true}
            onValueChange={(v) => setUserPref('showMembershipWizardHint', v)}
            styles={styles}
          />
        </CollapsibleCard>

        {/* <CollapsibleCard
          title="App use"
          open={appUseOpen}
          onToggle={(next) => { setAppUseOpen(next); setSectionCollapsed('appUse', !next); }}
          styles={styles}
        >
          <View style={styles.subSection}>
            <Text style={styles.label}>Application intent</Text>
            <Text style={styles.helpSmall}>Choose the primary way you use GunCerts.</Text>
            <View style={styles.options}>
              {APPLICATION_INTENT_OPTIONS.map(({ value, label }) => {
                const selected = userPrefs?.applicationIntent === value;
                return (
                  <RadioPill
                    key={value}
                    label={label}
                    selected={selected}
                    onPress={() => setUserPref('applicationIntent', value)}
                  />
                );
              })}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.subSection}>
            <Text style={styles.label}>Application type</Text>
            <Text style={styles.helpSmall}>Choose what application categories you plan to use.</Text>
            <View style={styles.options}>
              {APPLICATION_TYPE_OPTIONS.map(({ value, label }) => {
                const selected = userPrefs?.applicationType === value;
                return (
                  <RadioPill
                    key={value}
                    label={label}
                    selected={selected}
                    onPress={() => setUserPref('applicationType', value)}
                  />
                );
              })}
            </View>
          </View>
        </CollapsibleCard>
 */}

        { }
        <CollapsibleCard
          title="Preferences"
          open={preferencesOpen}
          onToggle={(next) => { setPreferencesOpen(next); setSectionCollapsed('preferences', !next); }}
          styles={styles}
        >
          {appConfig.features.allowFeedback ? (
            <View
              onLayout={(event) => {
                shareFeedbackTop.current = event.nativeEvent.layout.y;
              }}
            >
              <ToggleRow
                id="preferences.shareFeedback"
                label="Share feedback"
                help="Allow occasional prompts so we can learn how to improve."
                value={!!userPrefs?.shareFeedback}
                onValueChange={(v) => {
                  if (!userPrefs) return;
                  const next = {
                    ...userPrefs,
                    shareFeedback: v,
                    showSendFeedbackMessage: v ? userPrefs.showSendFeedbackMessage : true,
                  } as UserPrefs;
                  saveUserPrefs(next);
                  setUserPrefs(next);
                }}
                styles={styles}
              />
            </View>
          ) : null}

          <ToggleRow
            id="preferences.remindRenewal"
            label="Renewal reminders"
            help="Get notified ahead of licence/certificate expiry dates."
            value={!!userPrefs?.remindRenewal}
            onValueChange={(v) => setUserPref('remindRenewal', v)}
            styles={styles}
          />

          <View style={styles.divider} />

          <View style={styles.subSection}>
            <View style={styles.optionHeaderRow}>
              <View style={styles.optionHeaderTextWrap}>
                <Text style={styles.label}>My DFO determines competency expiry using:</Text>
              </View>
              <IconRoundButton
                buttonType="help"
                accessibilityLabel="Help for competency expiry setting"
                onPress={() => openHelp('helpSettingsCompCertCalc')}
                size="sm"
                hitSlop={8}
              />
            </View>
            <Text style={styles.helpSmall}>
              Choose the approach your DFO follows so reminders are timely and relevant.
            </Text>
            <View style={styles.options}>
              {COMPETENCY_EXPIRY_OPTIONS.map(({ value, label }) => {
                const selected = userPrefs?.dfoCompetencyExpiryUsing === value;
                return (
                  <RadioPill
                    key={value}
                    label={label}
                    selected={selected}
                    onPress={() => setUserPref('dfoCompetencyExpiryUsing', value)}
                  />
                );
              })}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.subSection}>
            <Text style={styles.label}>Screen mode</Text>
            <Text style={styles.helpSmall}>Choose whether this app follows your system appearance or forces a mode.</Text>
            <View style={styles.options}>
              {SCREEN_MODE_OPTIONS.map(({ value, label }) => {
                const selected = (userPrefs?.screenMode ?? 'default') === value;
                return (
                  <RadioPill
                    key={value}
                    label={label}
                    selected={selected}
                    onPress={() => {
                      setUserPref('screenMode', value);
                      setScreenMode(value);
                    }}
                  />
                );
              })}
            </View>
          </View>
          {/* Analytics opt-in */}
          {/* <ToggleRow
            id="preferences.analytics"
            label="Share diagnostics"
            help="Allow anonymous analytics to help improve the app."
            value={!!userPrefs?.analyticsOptIn}
            onValueChange={(v) => setUserPref('analyticsOptIn', v)}
          /> */}
        </CollapsibleCard>

        <CollapsibleCard
          title="Device"
          open={deviceOpen}
          onToggle={(next) => { setDeviceOpen(next); setSectionCollapsed('device', !next); }}
          styles={styles}
        >
          <ToggleRow
            id="device.biometrics"
            label="Biometric unlock"
            help={`Use Face ID / Touch ID to unlock quickly${Platform.OS === 'web' ? ' (not available on web)' : ''}.`}
            value={userPrefs?.useBiometrics ?? biometricEnabled}
            disabled={!canToggleBiometric}
            onValueChange={handleBiometricToggle}
            styles={styles}
          />
          {/* {!biometricAvailable && Platform.OS !== 'web' && (
            <Text style={styles.helpSmall}>Biometrics are not available/enrolled on this device.</Text>
          )} */}

          <View style={styles.divider} />

          <ToggleRow
            id="device.camera"
            label="Use camera"
            help="Jump straight into capturing documents once the app unlocks."
            value={!!userPrefs?.useCamera}
            onValueChange={handleCameraToggle}
            styles={styles}
          />

          <View style={styles.divider} />

          <ToggleRow
            id="device.photoLibrary"
            label="Use photo library"
            help="Allow picking images from your library for document uploads."
            value={!!userPrefs?.usePhotoLibrary}
            onValueChange={handlePhotoLibraryToggle}
            styles={styles}
          />

          {/* <View style={styles.subSection}>
            <Text style={styles.label}>Auto-lock after</Text>
            <Text style={styles.helpSmall}>
              When the app returns from the background. “On resume” locks immediately.
            </Text>
            <View style={styles.options}>
              {LOCK_OPTIONS.map((m) => <LockOption key={m} value={m} />)}
            </View>
          </View> */}
        </CollapsibleCard>




        {/* Change passcode */}
        <View style={styles.buttonGroup}>
          <Pressable style={styles.btn} onPress={startChange} accessibilityRole="button">
            <Text style={styles.btnText}>Change passcode</Text>
          </Pressable>

          <Pressable style={styles.lockBtn} onPress={lock} accessibilityRole="button">
            <Text style={styles.btnText}>Lock app</Text>
          </Pressable>

          {appConfig.features.allowArchivedApplicationDeletion ? (
            <Pressable
              style={({ pressed }) => [
                styles.btnWarning,
                pressed && hasArchivedApplications && !archivedDeleteLabel && styles.btnWarningPressed,
                (!hasArchivedApplications || !!archivedDeleteLabel) && styles.btnWarningDisabled,
              ]}
              onPress={handleDeleteArchivedApplications}
              accessibilityRole="button"
              accessibilityState={{ disabled: !hasArchivedApplications || !!archivedDeleteLabel }}
            >
              <Text style={styles.btnWarningText}>Delete archived applications</Text>
            </Pressable>
          ) : null}

          {/* Erase & reset */}
          <Pressable
            style={styles.btnDanger}
            onPress={() => router.push('/reset' as any)}
            accessibilityRole="button"
          >
            <Text style={styles.btnDangerText}>Erase & reset…</Text>
          </Pressable>
        </View>

        <View
          style={styles.devToolsSection}
          onLayout={(event) => {
            devTop.current = event.nativeEvent.layout.y;
          }}
        >
          <DevToolsSection onWipeComplete={handleWipeComplete} />
        </View>

        <Modal
          visible={syncPasscodeVisible}
          animationType="slide"
          onRequestClose={closeSyncPasscode}
          presentationStyle="formSheet"
        >
          <View style={styles.modalWrap}>
            <Text style={styles.h1}>Sync passcode</Text>
            <Text style={styles.help}>Enter your app passcode to enable cloud sync</Text>
            <PasscodePad
              length={len}
              value={syncPasscodeValue}
              onChange={setSyncPasscodeValue}
              onComplete={handleSyncPasscodeComplete}
              disabled={syncBusy}
            />
            <Pressable
              onPress={() => {
                closeSyncPasscode();
                setSyncSheetVisible(true);
              }}
              style={styles.btnSecondary}
              accessibilityRole="button"
              disabled={syncBusy}
            >
              <Text style={styles.btnSecondaryText}>Use a different passphrase</Text>
            </Pressable>
            <Pressable onPress={closeSyncPasscode} style={styles.modalClose} accessibilityRole="button" disabled={syncBusy}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </Pressable>
          </View>
        </Modal>

        <InputSheet
          visible={syncSheetVisible}
          title="Sync passphrase"
          value=""
          placeholder="Enter a passphrase"
          secureTextEntry
          onCancel={closeSyncSheet}
          onSave={handleSyncSave}
        />

        <ProcessingOverlay
          visible={!!syncProcessingLabel || !!archivedDeleteLabel}
          label={syncProcessingLabel ?? archivedDeleteLabel ?? 'Processing...'}
        />
        <HelpModal {...helpModalProps} />

        {/* Modal for change passcode */}
        <Modal visible={changing} animationType="slide" onRequestClose={closeModal} presentationStyle="formSheet">
          <View style={styles.modalWrap}>
            <Text style={styles.h1}>Change passcode</Text>

            {step === 'verify' && (
              <>
                <Text style={styles.help}>Enter your current passcode</Text>
                <PasscodePad length={len} value={pin1} onChange={setPin1} onComplete={onVerifyComplete} disabled={busy} />
              </>
            )}

            {step === 'new' && (
              <>
                <Text style={styles.help}>Enter a new passcode</Text>
                <PasscodePad length={len} value={pin2} onChange={setPin2} onComplete={onNewComplete} disabled={busy} />
              </>
            )}

            {step === 'confirm' && (
              <>
                <Text style={styles.help}>Confirm your new passcode</Text>
                <PasscodePad length={len} value={pin3} onChange={setPin3} onComplete={onConfirmComplete} disabled={busy} />
              </>
            )}

            <Pressable onPress={closeModal} style={styles.modalClose} accessibilityRole="button" disabled={busy}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </Pressable>
          </View>
        </Modal>
      </TabScrollView>
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    content: { gap: TAB_SPACING },
    h1: { fontSize: 22, fontWeight: '700', color: neutral.onSurface, marginBottom: TAB_SPACING },
    h2: { fontSize: 18, fontWeight: '800', color: tones.purple.base },
    devToolsSection: { marginTop: 6 },
    section: { gap: 8 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 2,
    },
    sectionToggleChip: {},
    sectionCard: {
      backgroundColor: neutral.onBase,
      borderWidth: 1,
      borderColor: neutral.border,
      borderRadius: 14,
      paddingVertical: 0,
      paddingHorizontal: 12,
    },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
    label: { fontSize: 16, fontWeight: '600', color: neutral.onSurface },
    help: { fontSize: 13, color: neutral.base, marginTop: 6 },
    helpSmall: { fontSize: 12, color: neutral.base, marginTop: 6 },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
    subSection: { paddingVertical: 12 },
    optionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    optionHeaderTextWrap: {
      flex: 1,
      minWidth: 0,
      paddingRight: 4,
    },
    divider: { borderTopWidth: 1, borderTopColor: neutral.border },
    buttonGroup: { marginTop: 8, marginBottom: 8, gap: 12 },
    btn: { backgroundColor: tones.teal.base, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    lockBtn: { backgroundColor: tones.blue.base, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    btnText: { color: tones.teal.onBase, fontWeight: '700' },
    btnSecondary: { marginTop: 10, borderWidth: 1, borderColor: neutral.border, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    btnSecondaryText: { color: neutral.onSurface, fontWeight: '700' },
    link: { color: tones.teal.base, fontWeight: '600' },

    btnDanger: { backgroundColor: tones.red.base, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    btnDangerText: { color: tones.red.onBase, fontWeight: '700' },
    btnWarning: { backgroundColor: tones.orange.base, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    btnWarningText: { color: tones.orange.onBase, fontWeight: '700' },
    btnWarningPressed: { opacity: 0.92 },
    btnWarningDisabled: { opacity: 0.45 },

    modalWrap: { flex: 1, padding: 24, justifyContent: 'center', gap: 16, backgroundColor: neutral.onBase },
    modalClose: { alignSelf: 'center', marginTop: 16 },
    modalCloseText: { color: tones.teal.base, fontWeight: '600' },

  });
