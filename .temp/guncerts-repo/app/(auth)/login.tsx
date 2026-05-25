import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator, InteractionManager, Alert, Linking, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useLock } from '../../src/providers/LockProvider';
import { PasscodePad } from '../../src/components/PasscodePad';
import { useTones } from '../../src/theme/tones';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFirstProfile, listByType } from '../../src/data/sqlite';
import { ensureUserPrefs, persist, saveUserPrefs, touch } from '../../src/data/repo';
import {
  ApplicationIntent,
  ApplicationTypePreference,
  Application,
  CompetencyCertificate,
  Document,
  Extraction,
  Feedback,
  Firearm,
  Membership,
  Profile,
  Reminders,
  Safe,
  SupportingStatement,
} from '../../src/data/types';
import { IconRoundButton } from '../../src/components/RoundIconButton';
import * as ImagePicker from 'expo-image-picker';
import { ensureCameraPermission, ensurePhotoLibraryPermission } from '../../src/utils/permissions';
import { AuthService, BiometricAccessResult } from '../../src/services/AuthService';
import { appConfig } from '../../src/config/appConfig';
import { isDemoDatasetActive } from '../../src/demo/demoState';
import { installDemoDataset } from '../../src/demo/installDemoDataset';
import RadioPill from '../../src/components/RadioPill';

export default function Login() {
  const {
    biometricHardwareAvailable,
    biometricAvailable,
    biometricEnabled,
    failedAttempts,
    lockoutRemainingMs,
    enableBiometrics,
    unlockWithBiometrics,
    unlockWithPasscode,
    eraseAndReset,
  } = useLock();
  const [pin, setPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [demoInstalling, setDemoInstalling] = useState(false);
  const [demoDataBlocked, setDemoDataBlocked] = useState(false);
  const [demoModeActive, setDemoModeActive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const len = 6;
  const lockoutActive = lockoutRemainingMs > 0;
  const autoBioTriggeredRef = useRef(false);
  const autoBioDisabledRef = useRef(false);
  const autoBioTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setupPrefsHydratedRef = useRef(false);
  const profile = listByType<Profile>('Profile')[0];
  const userPrefs = profile ? ensureUserPrefs(profile.id) : null;
  const prefsBiometricEnabled = userPrefs?.useBiometrics;
  const showFirstTimeSetup = userPrefs?.showFirstTimeSetup === true;
  const [showSetup, setShowSetup] = useState(showFirstTimeSetup);
  const [useBiometricsPref, setUseBiometricsPref] = useState(!!prefsBiometricEnabled);
  const [applicationIntentPref, setApplicationIntentPref] = useState<ApplicationIntent | null>(
    userPrefs?.applicationIntent === 'new' ||
    userPrefs?.applicationIntent === 'renewal' ||
    userPrefs?.applicationIntent === 'both'
      ? userPrefs.applicationIntent
      : null
  );
  const [applicationTypePref, setApplicationTypePref] = useState<ApplicationTypePreference | null>(
    userPrefs?.applicationType === 'competency' ||
    userPrefs?.applicationType === 'firearm' ||
    userPrefs?.applicationType === 'both'
      ? userPrefs.applicationType
      : null
  );
  const [showIntentError, setShowIntentError] = useState(false);
  const [remindRenewalPref, setRemindRenewalPref] = useState(!!userPrefs?.remindRenewal);
  const [useCameraPref, setUseCameraPref] = useState(!!userPrefs?.useCamera);
  const [usePhotoLibraryPref, setUsePhotoLibraryPref] = useState(!!userPrefs?.usePhotoLibrary);
  const [shareFeedbackPref, setShareFeedbackPref] = useState(!!userPrefs?.shareFeedback);
  const router = useRouter();
  const navigation = useNavigation();
  const { clearSignup } = useLocalSearchParams<{ clearSignup?: string }>();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const insets = useSafeAreaInsets();
  const busy = verifying || demoInstalling;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const active = await isDemoDatasetActive();
        if (!cancelled) setDemoModeActive(active);
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  useEffect(() => {
    if (clearSignup !== '1') return;
    const sub = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
    });
    return sub;
  }, [clearSignup, navigation]);

  const normalizeProfileAddressLine2 = useCallback(() => {
    const normalizeAddress = (address?: Profile['address']) => {
      if (!address) return { next: address, changed: false };
      const line1 = (address.line1 ?? '').trim();
      const line2 = (address.line2 ?? '').trim();
      if (!line2) return { next: address, changed: false };
      const suburb = (address.suburb ?? '').trim();
      const city = (address.city ?? '').trim();
      const mergedLine1 = [line1, line2].filter(Boolean).join(', ').trim();
      const rebuiltSingleLine = [mergedLine1, suburb, city].filter(Boolean).join(', ').trim();
      return {
        next: {
          ...address,
          line1: mergedLine1 || undefined,
          line2: undefined,
          singleLine: rebuiltSingleLine || undefined,
        },
        changed: true,
      };
    };

    const profiles = listByType<Profile>('Profile');
    profiles.forEach((profileItem) => {
      const home = normalizeAddress(profileItem.address);
      const postal = normalizeAddress(profileItem.addressPostal);
      if (!home.changed && !postal.changed) return;
      const updated = touch({
        ...profileItem,
        address: home.next,
        addressPostal: postal.next,
      } as Profile);
      persist(updated);
    });
  }, []);

  const hasProfileCapturedData = useCallback(() => {
    const profiles = listByType<Profile>('Profile');
    return profiles.some((p) => {
      const hasAddress =
        !!p.address?.line1?.trim() ||
        !!p.address?.line2?.trim() ||
        !!p.address?.suburb?.trim() ||
        !!p.address?.city?.trim() ||
        !!p.address?.postCode?.trim();
      return (
        !!p.givenNames?.trim() ||
        !!p.surname?.trim() ||
        !!p.initials?.trim() ||
        !!p.idNumber?.trim() ||
        !!p.email?.trim() ||
        !!p.mobile?.trim() ||
        hasAddress ||
        p.hasPostalAddress === true
      );
    });
  }, []);

  const hasCapturedData = useCallback(() => {
    return (
      hasProfileCapturedData() ||
      listByType<Document>('Document').length > 0 ||
      listByType<Firearm>('Firearm').length > 0 ||
      listByType<CompetencyCertificate>('CompetencyCertificate').length > 0 ||
      listByType<Safe>('Safe').length > 0 ||
      listByType<Application>('Application').length > 0 ||
      listByType<Membership>('Membership').length > 0 ||
      listByType<SupportingStatement>('SupportingStatement').length > 0 ||
      listByType<Reminders>('Reminders').length > 0 ||
      listByType<Extraction>('Extraction').length > 0 ||
      listByType<Feedback>('Feedback').length > 0
    );
  }, [hasProfileCapturedData]);

  useFocusEffect(
    useCallback(() => {
      setDemoDataBlocked(hasCapturedData());
    }, [hasCapturedData]),
  );

  const enforceLoginPrefs = useCallback(() => {
    if (appConfig.features.showDevTools) return;
    if (!profile?.id) return;
    const prefs = ensureUserPrefs(profile.id);
    if (prefs.devModeEnabled === false) return;
    saveUserPrefs({
      ...prefs,
      devModeEnabled: false,
    });
  }, [profile?.id]);

  const countdown = useMemo(() => {
    if (!lockoutActive) return null;
    const totalSec = Math.ceil(lockoutRemainingMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }, [lockoutActive, lockoutRemainingMs]);

  const lockoutMessage = useMemo(() => {
    if (!lockoutActive || !countdown) return null;
    if (failedAttempts >= 5) {
      return `Too many attempts. Try again in ${countdown}. One attempt remaining before ALL data is reset.`;
    }
    if (failedAttempts >= 3) {
      return `Too many attempts. Try again in ${countdown}. You have two more tries.`;
    }
    return `Too many attempts. Try again in ${countdown}.`;
  }, [lockoutActive, countdown, failedAttempts]);

  useEffect(() => {
    if (pin.length > 0) {
      autoBioDisabledRef.current = true;
      if (autoBioTimeoutRef.current) {
        clearTimeout(autoBioTimeoutRef.current);
        autoBioTimeoutRef.current = null;
      }
    }
  }, [pin.length]);

  useEffect(() => {
    if (lockoutActive) {
      setNotice(null);
    }
  }, [lockoutActive]);

  const handleBiometricAccessFailure = useCallback((access: Extract<BiometricAccessResult, { ok: false }>) => {
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
      Alert.alert('Biometrics unavailable', 'Set up Face ID or fingerprint in your device settings, then try again.');
      return;
    }
    if (access.reason === 'no_hardware') {
      Alert.alert('Biometrics unavailable', 'This device does not support biometric authentication.');
      return;
    }
    if (access.reason === 'cancelled') {
      Alert.alert('Biometric authentication cancelled', 'Biometric authentication was cancelled.');
      return;
    }
    Alert.alert('Biometric authentication unavailable', 'Biometric authentication is unavailable right now.');
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (showSetup) return;
    if (!biometricEnabled || !biometricAvailable || lockoutActive) return;
    if (autoBioDisabledRef.current || autoBioTriggeredRef.current) return;
    autoBioTriggeredRef.current = true;
    autoBioTimeoutRef.current = setTimeout(() => {
      autoBioTimeoutRef.current = null;
      if (autoBioDisabledRef.current || lockoutActive) return;
      requestAnimationFrame(async () => {
        const res = await unlockWithBiometrics();
        if (res.ok) {
          enforceLoginPrefs();
          normalizeProfileAddressLine2();
          return;
        }
        if (!res.ok && res.reason === 'lockout') {
          setNotice(null);
        }
      });
    }, 250);
    return () => {
      if (autoBioTimeoutRef.current) {
        clearTimeout(autoBioTimeoutRef.current);
        autoBioTimeoutRef.current = null;
      }
    };
  }, [biometricAvailable, biometricEnabled, enforceLoginPrefs, lockoutActive, normalizeProfileAddressLine2, showSetup, unlockWithBiometrics]);

  useEffect(() => {
    setShowSetup(showFirstTimeSetup);
  }, [showFirstTimeSetup]);

  useEffect(() => {
    if (!showSetup) {
      setShowIntentError(false);
    }
  }, [showSetup]);

  useEffect(() => {
    if (!showSetup) {
      setupPrefsHydratedRef.current = false;
      return;
    }
    if (!showSetup || !profile?.id) return;
    if (setupPrefsHydratedRef.current) return;
    setupPrefsHydratedRef.current = true;
    let cancelled = false;
    (async () => {
      const cameraPerm = await ImagePicker.getCameraPermissionsAsync();
      const libraryPerm =
        Platform.OS === 'ios' ? await ImagePicker.getMediaLibraryPermissionsAsync() : null;
      if (cancelled) return;
      const cameraGranted = cameraPerm.granted === true;
      const libraryGranted =
        Platform.OS === 'ios' ? libraryPerm?.granted === true : !!userPrefs?.usePhotoLibrary;
      setUseBiometricsPref(!!userPrefs?.useBiometrics && biometricHardwareAvailable);
      setApplicationIntentPref(
        userPrefs?.applicationIntent === 'new' ||
        userPrefs?.applicationIntent === 'renewal' ||
        userPrefs?.applicationIntent === 'both'
          ? userPrefs.applicationIntent
          : null
      );
      setApplicationTypePref(
        userPrefs?.applicationType === 'competency' ||
        userPrefs?.applicationType === 'firearm' ||
        userPrefs?.applicationType === 'both'
          ? userPrefs.applicationType
          : null
      );
      setRemindRenewalPref(!!userPrefs?.remindRenewal);
      setUseCameraPref(cameraGranted);
      setUsePhotoLibraryPref(libraryGranted);
      setShareFeedbackPref(!!userPrefs?.shareFeedback);
      const nextPrefs = ensureUserPrefs(profile.id);
      if (nextPrefs.useCamera !== cameraGranted || nextPrefs.usePhotoLibrary !== libraryGranted) {
        saveUserPrefs({
          ...nextPrefs,
          useCamera: cameraGranted,
          usePhotoLibrary: libraryGranted,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    biometricHardwareAvailable,
    profile?.id,
    showSetup,
  ]);

  const toggleBiometrics = useCallback(async () => {
    const next = !useBiometricsPref;
    if (!next) {
      setUseBiometricsPref(false);
      return;
    }

    const access = await AuthService.ensureBiometricAccess('Enable biometric login');
    if (!access.ok) {
      setUseBiometricsPref(false);
      handleBiometricAccessFailure(access);
      return;
    }

    setUseBiometricsPref(true);
  }, [handleBiometricAccessFailure, useBiometricsPref]);

  const toggleReminders = useCallback(() => {
    setRemindRenewalPref((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(async () => {
    const next = !useCameraPref;
    if (!next) {
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
    const ok = await ensureCameraPermission();
    setUseCameraPref(ok ? next : false);
  }, [useCameraPref]);

  const togglePhotoLibrary = useCallback(async () => {
    const next = !usePhotoLibraryPref;
    if (!next) {
      if (Platform.OS === 'android') {
        setUsePhotoLibraryPref(false);
        return;
      }
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
    if (Platform.OS === 'android') {
      setUsePhotoLibraryPref(true);
      return;
    }
    const ok = await ensurePhotoLibraryPermission();
    setUsePhotoLibraryPref(ok ? next : false);
  }, [usePhotoLibraryPref]);

  const toggleShareFeedback = useCallback(() => {
    setShareFeedbackPref((prev) => !prev);
  }, []);

  const handleConfirmPreferences = useCallback(async () => {
    if (!profile?.id) return;
    if (!applicationIntentPref || !applicationTypePref) {
      setShowIntentError(true);
      Alert.alert('App use required', 'Please select both Application intent and Application type.');
      return;
    }
    setShowIntentError(false);
      const prefs = ensureUserPrefs(profile.id);
      saveUserPrefs({
        ...prefs,
        applicationIntent: applicationIntentPref ?? undefined,
        applicationType: applicationTypePref ?? undefined,
        useBiometrics: biometricHardwareAvailable ? useBiometricsPref : false,
        remindRenewal: remindRenewalPref,
        ...(remindRenewalPref === false
          ? { remindersResetRequestedAt: new Date().toISOString() }
          : {}),
      useCamera: useCameraPref,
      usePhotoLibrary: usePhotoLibraryPref,
      shareFeedback: shareFeedbackPref,
      showFirstTimeSetup: false,
    });
    await enableBiometrics(biometricHardwareAvailable ? useBiometricsPref : false);
    setShowSetup(false);
  }, [
    applicationIntentPref,
    applicationTypePref,
    enableBiometrics,
    biometricHardwareAvailable,
    profile?.id,
    remindRenewalPref,
    shareFeedbackPref,
    useBiometricsPref,
    useCameraPref,
    usePhotoLibraryPref,
  ]);

  const persistCurrentSetupPrefs = useCallback(
    (profileId: string, showFirstTimeSetupValue?: boolean) => {
      const prefs = ensureUserPrefs(profileId);
      saveUserPrefs({
        ...prefs,
        applicationIntent: applicationIntentPref ?? undefined,
        applicationType: applicationTypePref ?? undefined,
        useBiometrics: biometricHardwareAvailable ? useBiometricsPref : false,
        remindRenewal: remindRenewalPref,
        ...(remindRenewalPref === false
          ? { remindersResetRequestedAt: new Date().toISOString() }
          : {}),
        useCamera: useCameraPref,
        usePhotoLibrary: usePhotoLibraryPref,
        shareFeedback: shareFeedbackPref,
        ...(typeof showFirstTimeSetupValue === 'boolean'
          ? { showFirstTimeSetup: showFirstTimeSetupValue }
          : {}),
      });
    },
    [
      applicationIntentPref,
      applicationTypePref,
      biometricHardwareAvailable,
      remindRenewalPref,
      shareFeedbackPref,
      useBiometricsPref,
      useCameraPref,
      usePhotoLibraryPref,
    ],
  );

  const verifyNow = async (value: string) => {
    if (verifying || lockoutActive || demoInstalling) return;
    autoBioDisabledRef.current = true;
    if (autoBioTimeoutRef.current) {
      clearTimeout(autoBioTimeoutRef.current);
      autoBioTimeoutRef.current = null;
    }
    setVerifying(true);
    InteractionManager.runAfterInteractions(async () => {
      const result = await unlockWithPasscode(value);
      setVerifying(false);
      if (result.ok) {
        enforceLoginPrefs();
        normalizeProfileAddressLine2();
        return;
      }

      if (result.reason === 'invalid') {
        setNotice('Incorrect passcode. Please try again.');
        setPin('');
        return;
      }

      if (result.reason === 'lockout') {
        setNotice(null);
        setPin('');
        return;
      }

      if (result.reason === 'reset') {
        setNotice(null);
        setPin('');
      }
    });
  };

  const handleLoadDemoData = useCallback(() => {
    if (demoInstalling || verifying || !appConfig.demo.enabled || !appConfig.demo.allowResetFromLogin) return;
    Alert.alert(
      'Reset and load ASC demo data?',
      'This erases local data, resets app access, and installs the packaged demo dataset.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset and load',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setDemoInstalling(true);
                await eraseAndReset();
                const result = await installDemoDataset({ resetBeforeInstall: false, force: true });
                if (result.skipped && result.reason === 'disabled') {
                  Alert.alert('Demo mode disabled', 'Demo mode is disabled for this build.');
                  return;
                }
                const seededProfile = getFirstProfile();
                if (seededProfile?.id) {
                  // Keep any first-time setup choices the user already made before loading demo data.
                  persistCurrentSetupPrefs(seededProfile.id, false);
                }
                router.replace('/(auth)/signup?reset=1');
              } catch (error: any) {
                Alert.alert('Demo load failed', error?.message ?? 'Unable to load demo data.');
              } finally {
                setDemoInstalling(false);
              }
            })();
          },
        },
      ],
    );
  }, [demoInstalling, eraseAndReset, persistCurrentSetupPrefs, router, verifying]);

  const handleReloadDemoData = useCallback(() => {
    const reloadDemoData = () => {
      void (async () => {
        try {
          setDemoInstalling(true);
          if (profile?.id) {
            // Persist first-time setup choices before reloading demo entities.
            persistCurrentSetupPrefs(profile.id);
          }
          const result = await installDemoDataset({
            resetBeforeInstall: false,
            clearEntitiesBeforeInstall: true,
            force: true,
          });
          if (result.skipped && result.reason === 'disabled') {
            Alert.alert('Demo mode disabled', 'Demo mode is disabled for this build.');
            return;
          }
          const seededProfile = getFirstProfile();
          if (seededProfile?.id) {
            // Demo reload can replace profile entities; reapply setup prefs to the seeded profile.
            persistCurrentSetupPrefs(seededProfile.id, false);
            const refreshedPrefs = ensureUserPrefs(seededProfile.id);
            saveUserPrefs({
              ...refreshedPrefs,
              isFirstLoad: true,
            });
          }
          setDemoDataBlocked(true);
          setDemoModeActive(true);
          Alert.alert('Done', 'Demo dataset loaded. Login using your Passcode or biometric authentication if enabled.');
        } catch (error: any) {
          Alert.alert('Demo load failed', error?.message ?? 'Unable to load demo data.');
        } finally {
          setDemoInstalling(false);
        }
      })();
    };

    if (demoInstalling || verifying || lockoutActive || !appConfig.demo.enabled) return;
    if (demoDataBlocked) {
      if (demoModeActive) {
        Alert.alert(
          'Demo mode already active',
          'Choose what you want to do next.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Reload demo data',
              onPress: reloadDemoData,
            },
            {
              text: 'Reset app',
              style: 'destructive',
              onPress: () => {
                router.push('/reset');
              },
            },
          ],
        );
        return;
      }
      Alert.alert(
        'Demo mode already active',
        'It looks like you have already captured data. To use demo data, erase and reset the app first.\n\nNOTE: this action will erase all current data and cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reset app',
            style: 'destructive',
            onPress: () => {
              router.push('/reset');
            },
          },
        ],
      );
      return;
    }
    Alert.alert(
      'Load demo data?',
      'If you are new to GunCerts, this is a great way to explore its capabilities without having to upload your own data.\n\nNOTE: Once the demo dataset has loaded, use your existing passcode to unlock the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Load data',
          style: 'destructive',
          onPress: reloadDemoData,
        },
      ],
    );
  }, [demoDataBlocked, demoInstalling, demoModeActive, lockoutActive, persistCurrentSetupPrefs, profile?.id, router, verifying]);

  const onBiometricPress = async () => {
    if (verifying || lockoutActive || demoInstalling) return;
    autoBioDisabledRef.current = true;
    if (autoBioTimeoutRef.current) {
      clearTimeout(autoBioTimeoutRef.current);
      autoBioTimeoutRef.current = null;
    }
    if (!biometricEnabled || prefsBiometricEnabled === false) {
      Alert.alert(
        'Enable biometric login?',
        'Would you like to enable biometric login for faster access?',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Enable',
            onPress: async () => {
              const access = await AuthService.ensureBiometricAccess('Enable biometric login');
              if (!access.ok) {
                await enableBiometrics(false);
                handleBiometricAccessFailure(access);
                return;
              }
              await enableBiometrics(true);
              const res = await unlockWithBiometrics();
              if (res.ok) {
                enforceLoginPrefs();
                normalizeProfileAddressLine2();
                return;
              }
              if (!res.ok && res.reason === 'lockout') {
                setNotice(null);
              }
            },
          },
        ],
      );
      return;
    }
    const res = await unlockWithBiometrics();
    if (res.ok) {
      enforceLoginPrefs();
      normalizeProfileAddressLine2();
      return;
    }
    if (!res.ok) {
      if (res.reason === 'lockout') {
        setNotice(null);
        return;
      }
      const access = await AuthService.ensureBiometricAccess('Verify biometric access');
      if (!access.ok) {
        handleBiometricAccessFailure(access);
      }
    }
  };

  if (showSetup) {
    return (
      <View style={styles.screen}>
        <View style={[styles.setupHeaderFixed, { paddingTop: Math.max(insets.top, 16) }]}>
          <Text style={styles.title}>First-time setup</Text>
          <Text style={styles.body}>Choose your preferences. You can change these later in Settings.</Text>
        </View>
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.setupWrap, busy && styles.busyContent]}
          pointerEvents={busy ? 'none' : 'auto'}
          keyboardShouldPersistTaps="handled"
        >
          {/* <Text style={styles.bodyRed}>NOTE: all your information and data is encrypted and stored locally on your device giving you full control of how your data is managed.</Text> */}
          <View style={styles.card}>
            {biometricAvailable && Platform.OS !== 'web' ? (
              <View style={styles.settingRow}>
                <View style={styles.settingTextWrap}>
                  <Text style={styles.settingLabel}>Enable biometrics</Text>
                  <Text style={styles.settingHelp}>Use Face ID / Touch ID to unlock quickly.</Text>
                </View>
                <IconRoundButton
                  buttonType={useBiometricsPref ? 'confirm' : 'stop'}
                  accessibilityLabel={useBiometricsPref ? 'Disable biometrics' : 'Enable biometrics'}
                  onPress={toggleBiometrics}
                  size={36}
                  borderColor={useBiometricsPref ? tones.green.base : neutral.base}
                />
              </View>
            ) : null}
            <View style={styles.settingRow}>
              <View style={styles.settingTextWrap}>
                <Text style={styles.settingLabel}>Enable reminders</Text>
                <Text style={styles.settingHelp}>Get renewal reminders for your documents.</Text>
              </View>
              <IconRoundButton
                buttonType={remindRenewalPref ? 'confirm' : 'stop'}
                accessibilityLabel={remindRenewalPref ? 'Disable reminders' : 'Enable reminders'}
                onPress={toggleReminders}
                size={36}
                borderColor={remindRenewalPref ? tones.green.base : neutral.base}
              />
            </View>
            <View style={styles.settingRow}>
              <View style={styles.settingTextWrap}>
                <Text style={styles.settingLabel}>Allow camera use</Text>
                <Text style={styles.settingHelp}>Capture photos directly in the app.</Text>
              </View>
              <IconRoundButton
                buttonType={useCameraPref ? 'confirm' : 'stop'}
                accessibilityLabel={useCameraPref ? 'Disable camera use' : 'Allow camera use'}
                onPress={toggleCamera}
                size={36}
                borderColor={useCameraPref ? tones.green.base : neutral.base}
              />
            </View>
            <View style={styles.settingRow}>
              <View style={styles.settingTextWrap}>
                <Text style={styles.settingLabel}>Allow photo library access</Text>
                <Text style={styles.settingHelp}>Upload existing photos from your library.</Text>
              </View>
              <IconRoundButton
                buttonType={usePhotoLibraryPref ? 'confirm' : 'stop'}
                accessibilityLabel={usePhotoLibraryPref ? 'Disable photo library access' : 'Allow photo library access'}
                onPress={togglePhotoLibrary}
                size={36}
                borderColor={usePhotoLibraryPref ? tones.green.base : neutral.base}
              />
            </View>
          </View>
{/* 
          <View style={styles.intentSection}>
            <View style={styles.settingTextWrap}>
              <Text style={styles.settingLabel}>Application intent</Text>
              <Text style={styles.settingHelp}>How are you planning on using GunCerts?</Text>
            </View>
            <View style={styles.intentRow}>
              <RadioPill
                label="New applications"
                selected={applicationIntentPref === 'new'}
                error={showIntentError && !applicationIntentPref}
                onPress={() => {
                  setApplicationIntentPref('new');
                  setShowIntentError(false);
                }}
              />
              <RadioPill
                label="Renewals"
                selected={applicationIntentPref === 'renewal'}
                error={showIntentError && !applicationIntentPref}
                onPress={() => {
                  setApplicationIntentPref('renewal');
                  setShowIntentError(false);
                }}
              />
              <RadioPill
                label="Both"
                selected={applicationIntentPref === 'both'}
                error={showIntentError && !applicationIntentPref}
                onPress={() => {
                  setApplicationIntentPref('both');
                  setShowIntentError(false);
                }}
              />
            </View>

            <View style={styles.settingTextWrap}>
              <Text style={styles.settingLabel}>Application type</Text>
              <Text style={styles.settingHelp}>What type of applications are you planning on submitting?</Text>
            </View>
            <View style={styles.intentRow}>
              <RadioPill
                label="Competency"
                selected={applicationTypePref === 'competency'}
                error={showIntentError && !applicationTypePref}
                onPress={() => {
                  setApplicationTypePref('competency');
                  setShowIntentError(false);
                }}
              />
              <RadioPill
                label="Firearms"
                selected={applicationTypePref === 'firearm'}
                error={showIntentError && !applicationTypePref}
                onPress={() => {
                  setApplicationTypePref('firearm');
                  setShowIntentError(false);
                }}
              />
              <RadioPill
                label="Both"
                selected={applicationTypePref === 'both'}
                error={showIntentError && !applicationTypePref}
                onPress={() => {
                  setApplicationTypePref('both');
                  setShowIntentError(false);
                }}
              />
            </View>
          </View> */}

          <Pressable
            onPress={handleConfirmPreferences}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>Confirm preferences</Text>
          </Pressable>
          <Text style={styles.bodyRed}>NOTE: all your information and data is encrypted and stored locally on your device giving you full control of how your data is managed.</Text>
        </ScrollView>

        {busy ? (
          <View style={styles.busyOverlay} pointerEvents="auto">
            <ActivityIndicator size="large" color={tones.teal.base} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.wrap, busy && styles.busyContent]} pointerEvents={busy ? 'none' : 'auto'}>
        <Text style={styles.title}>Unlock</Text>
        <Text style={styles.body}>Enter your passcode to continue.</Text>

        {(lockoutMessage || notice) && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{lockoutMessage ?? notice}</Text>
          </View>
        )}

        <PasscodePad
          length={len}
          value={pin}
          onChange={(v) => !busy && !lockoutActive && setPin(v)}
          onComplete={verifyNow}
          disabled={busy || lockoutActive}
        />

        {verifying && (
          <View style={{ marginTop: 12, alignItems: 'center' }}>
            <ActivityIndicator />
            <Text style={styles.help}>Verifying…</Text>
          </View>
        )}

        <View style={{ alignItems: 'center', marginTop: 16 }}>
          <Link href="/reset" style={styles.resetLink} accessibilityRole="link">
            Forgot passcode? Erase & reset
          </Link>
        </View>
        <View style={styles.loginActions}>
          {appConfig.demo.enabled && appConfig.demo.allowResetFromLogin ? (
            <>
              <Pressable
                onPress={handleReloadDemoData}
                disabled={busy || lockoutActive}
                accessibilityState={{ disabled: demoDataBlocked || busy || lockoutActive }}
                style={({ pressed }) => [
                  styles.demoReloadBtn,
                  pressed && styles.demoReloadBtnPressed,
                  (demoDataBlocked || busy || lockoutActive) && styles.demoReloadBtnDisabled,
                ]}
              >
                <Text style={styles.demoReloadBtnText}>
                  {demoInstalling ? 'Loading demo data…' : demoModeActive ? 'Demo mode active' : 'Try app using demo data'}
                </Text>
              </Pressable>
            </>
          ) : null}

          {biometricAvailable && Platform.OS !== 'web' && (
            <Pressable
              style={({ pressed }) => [
                styles.bioBtn,
                pressed && styles.bioBtnPressed,
                (busy || lockoutActive) && { opacity: 0.6 },
              ]}
              onPress={onBiometricPress}
              accessibilityRole="button"
              disabled={busy || lockoutActive}
            >
              <Text style={styles.bioText}>Use Biometric login</Text>
            </Pressable>
          )}
        </View>
      </View>

      {busy ? (
        <View style={styles.busyOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color={tones.teal.base} />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    screen: { flex: 1 },
    wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
    setupHeaderFixed: {
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 8,
      gap: 12,
    },
    setupWrap: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24, gap: 12 },
    busyContent: { opacity: 0.45 },
    busyOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 22, fontWeight: '700', color: neutral.onSurface, textAlign: 'center' },
    body: { fontSize: 14, color: neutral.base, textAlign: 'center' },
    bodyRed: { fontSize: 14, color: tones.red.base, textAlign: 'center' },
    intentSection: {
      gap: 8,
      marginTop: 6,
      alignSelf: 'stretch',
      backgroundColor: neutral.onBase,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: neutral.border,
    },
    intentRow: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    card: { alignSelf: 'stretch', backgroundColor: neutral.onBase, borderRadius: 16, padding: 16, gap: 14, borderWidth: 1, borderColor: neutral.border, marginTop: 8 },
    settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    settingTextWrap: { flex: 1 },
    settingLabel: { fontSize: 14, fontWeight: '600', color: neutral.onSurface },
    settingHelp: { fontSize: 12, color: neutral.base, marginTop: 2 },
    loginActions: { alignItems: 'center', marginTop: 8, gap: 12 },
    bioBtn: { alignSelf: 'center', width: 280, backgroundColor: tones.blue.base, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: tones.blue.base },
    bioBtnPressed: { backgroundColor: tones.blue.emphasis, borderColor: tones.blue.emphasis },
    bioText: { color: tones.blue.onBase, fontWeight: '600', textAlign: 'center' },
    help: { fontSize: 12, color: neutral.base, marginTop: 6 },
    cta: {
      backgroundColor: tones.teal.base,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderRadius: 10,
      alignItems: 'center',
      alignSelf: 'stretch',
      marginTop: 8,
    },
    ctaPressed: { backgroundColor: tones.teal.emphasis, borderColor: tones.teal.emphasis },
    ctaText: { color: tones.teal.onBase, fontWeight: '700', fontSize: 16 },
    resetLink: { color: tones.teal.base, fontWeight: '600' },
    demoResetBtn: {
      alignSelf: 'center',
      width: 280,
      backgroundColor: tones.red.base,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: tones.red.base,
    },
    demoResetBtnText: {
      color: tones.red.onBase,
      fontWeight: '700',
      textAlign: 'center',
    },
    demoReloadBtn: {
      alignSelf: 'center',
      width: 280,
      backgroundColor: tones.orange.base,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: tones.orange.base,
    },
    demoReloadBtnPressed: { backgroundColor: tones.orange.emphasis, borderColor: tones.orange.emphasis },
    demoReloadBtnDisabled: { opacity: 0.6 },
    demoReloadBtnText: {
      color: tones.orange.onBase,
      fontWeight: '700',
      textAlign: 'center',
    },
    notice: { alignSelf: 'stretch', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: tones.orange.surface, borderWidth: 1, borderColor: tones.orange.base },
    noticeText: { fontSize: 12, color: neutral.onSurface, textAlign: 'center' },
  });
