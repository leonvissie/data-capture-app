import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { PasscodePad } from '../../src/components/PasscodePad';
import { useLock } from '../../src/providers/LockProvider';
import { useTones } from '../../src/theme/tones';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { ensureUserPrefs } from '../../src/data/repo';
import { getFirstProfile, saveEntity } from '../../src/data/sqlite';
import { createProfile } from '../../src/data/defaults';
import { appConfig } from '../../src/config/appConfig';
import { installDemoDataset } from '../../src/demo/installDemoDataset';

export default function Signup() {
  const { createPasscode, resetNotice, clearResetNotice, eraseAndReset } = useLock();
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral, tones), [neutral, tones]);
  const [step, setStep] = useState<'pass'|'confirm'>('pass');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [saving, setSaving] = useState(false);
  const [demoInstalling, setDemoInstalling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const len = 6;
  const busy = saving || demoInstalling;
  const router = useRouter();
  const navigation = useNavigation();
  const { reset } = useLocalSearchParams<{ reset?: string }>();
  const fromReset = reset === '1' || reset === 'true';
  const allowExitRef = useRef(false);
  const waitForNextFrame = useCallback(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    [],
  );

  useEffect(() => {
    if (resetNotice) {
      setNotice(resetNotice);
      clearResetNotice();
    }
  }, [resetNotice, clearResetNotice]);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !fromReset });
  }, [fromReset, navigation]);

  useEffect(() => {
    if (!fromReset) return;
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (!allowExitRef.current) {
        e.preventDefault();
      }
    });
    return sub;
  }, [fromReset, navigation]);

  const onCompleteA = (val: string) => {
    setA(val);
    setStep('confirm');
    setB(''); // clear confirm buffer
  };

  const onCompleteB = async (val: string) => {
    setB(val);
    if (a !== val) {
      Alert.alert('Passcodes do not match', 'Please re-enter.');
      setA(''); setB('');
      setStep('pass');
      return;
    }
    try {
      setSaving(true);
      // Let the disabled keypad + spinner paint before passcode creation work starts.
      await waitForNextFrame();
      await createPasscode(val);
      let profile = getFirstProfile() ?? (() => {
        const created = createProfile();
        saveEntity(created);
        return created;
      })();
      ensureUserPrefs(profile.id);
      allowExitRef.current = true;
      await waitForNextFrame();
      router.push({ pathname: '/(auth)/login', params: { clearSignup: '1' } } as any);
    } catch (e) {
      Alert.alert('Error', 'Could not save your passcode. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadDemoData = useCallback(() => {
    if (demoInstalling || saving || !appConfig.demo.enabled) return;
    Alert.alert(
      'Load ASC demo data?',
      'This clears local data and installs the packaged demo dataset for review.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Load demo',
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
                setNotice('ASC demo data loaded. Continue by creating a passcode.');
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
  }, [demoInstalling, eraseAndReset, saving]);

  return (
    <View style={styles.screen}>
      <View style={[styles.wrap, busy && styles.busyContent]} pointerEvents={busy ? 'none' : 'auto'}>
        {notice && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        {step === 'pass' && (
          <>
            <Text style={styles.title}>Create a passcode</Text>
            <Text style={styles.body}>
              Your documents are stored on this device. If you forget this passcode, the only recovery is to erase local data and reset.
            </Text>
            <PasscodePad length={len} value={a} onChange={setA} onComplete={onCompleteA} disabled={busy} />
            {/* {appConfig.demo.enabled ? (
              <Pressable
                onPress={handleLoadDemoData}
                style={({ pressed }) => [styles.ctaSecondary, pressed && styles.ctaPressed]}
                accessibilityRole="button"
                disabled={busy}
              >
                <Text style={styles.ctaSecondaryText}>
                  {demoInstalling ? 'Loading ASC demo data…' : 'Load ASC demo data'}
                </Text>
              </Pressable>
            ) : null} */}
          </>
        )}

        {step === 'confirm' && (
          <>
            <Text style={styles.title}>Confirm your passcode</Text>
            <PasscodePad length={len} value={b} onChange={setB} onComplete={onCompleteB} disabled={busy} />
            {saving && (
              <View style={{ marginTop: 16, alignItems: 'center' }}>
                <ActivityIndicator />
                <Text style={styles.help}>Saving…</Text>
              </View>
            )}
          </>
        )}
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
    wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
    busyContent: { opacity: 0.45 },
    busyOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 22, fontWeight: '700', color: neutral.onSurface, textAlign: 'center' },
    body: { fontSize: 14, color: neutral.base, textAlign: 'center' },
    bodyRed: { fontSize: 14, color: tones.red.base, textAlign: 'center' },
    help: { fontSize: 12, color: neutral.base, marginTop: 6 },
    cta: { backgroundColor: tones.teal.base, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, minWidth: 120, alignItems: 'center' },
    ctaPressed: { backgroundColor: tones.teal.emphasis, borderColor: tones.teal.emphasis },
    ctaText: { color: tones.teal.onBase, fontWeight: '600' },
    ctaSecondary: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: neutral.border, minWidth: 120, alignItems: 'center' },
    ctaSecondaryText: { color: neutral.onSurface, fontWeight: '600' },
    notice: { alignSelf: 'stretch', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: tones.orange.surface, borderWidth: 1, borderColor: tones.orange.base },
    noticeText: { fontSize: 12, color: neutral.onSurface, textAlign: 'left' },
  });
