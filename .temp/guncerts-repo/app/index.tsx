import { Redirect } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLock } from '../src/providers/LockProvider';
import { appConfig } from '../src/config/appConfig';
import { ComplianceNoticeService } from '../src/services/ComplianceNoticeService';
import { Button } from '../src/components/Button';
import { Bullet, LinkText, P } from '../src/components/InfoText';
import { useTones } from '../src/theme/tones';

type NoticeState = 'checking' | 'required' | 'accepted';

export default function StartupGate() {
  const { state } = useLock();
  const [noticeState, setNoticeState] = useState<NoticeState>('checking');
  const [ackBusy, setAckBusy] = useState(false);
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const required = await ComplianceNoticeService.requiresAcknowledgement(appConfig.complianceNotice.trigger);
      if (cancelled) return;
      setNoticeState(required ? 'required' : 'accepted');
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (noticeState !== 'required') return;
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => backSub.remove();
  }, [noticeState]);

  const acknowledge = async () => {
    if (ackBusy) return;
    setAckBusy(true);
    try {
      await ComplianceNoticeService.acknowledge();
      setNoticeState('accepted');
    } finally {
      setAckBusy(false);
    }
  };

  if (state === 'checking' || noticeState === 'checking') {
    return (
      <View style={styles.splash}>
        <Image
          source={require('../assets/images/splash-icon.png')}
          style={styles.splashImage}
          resizeMode="contain"
        />
      </View>
    );
  }

  if (noticeState === 'required') {
    return (
      <View style={styles.noticeContainer}>
        <ScrollView
          style={styles.noticeScroll}
          contentContainerStyle={styles.noticeScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={require('../assets/images/splash-icon.png')}
            style={styles.noticeLogo}
            resizeMode="contain"
          />
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Important Notice</Text>
            <P baseStyle={styles.noticeBody}>
              GunCerts is a private, independent application that helps users prepare firearm-related applications.
            </P>
            <P baseStyle={styles.noticeBody}>
              GunCerts is intended for South African citizens, or foreign nationals with permanent residency in South
              Africa, who are 21 years of age or older and are lawful firearm owners.
            </P>
            <P baseStyle={styles.noticeBody}>
              GunCerts is NOT affiliated with, endorsed by, or operated by the South African Police Service (SAPS) or any
              government body.
            </P>
            <P baseStyle={styles.noticeBody}>
              Submission, approval, and processing of applications are handled solely by SAPS. Use of this app does not
              guarantee approval.
            </P>
            <Bullet containerStyle={styles.noticeBulletRow} dotStyle={styles.noticeBulletDot} textStyle={styles.noticeBulletText}>
              {' '}
              <LinkText href="https://www.guncerts.co.za/terms.html" style={styles.noticeLink}>
                Terms and conditions
              </LinkText>
            </Bullet>
            <Bullet containerStyle={styles.noticeBulletRow} dotStyle={styles.noticeBulletDot} textStyle={styles.noticeBulletText}>
              {' '}
              <LinkText href="https://www.guncerts.co.za/privacy.html" style={styles.noticeLink}>
                Privacy policy
              </LinkText>
            </Bullet>
            <Button
              label="I understand (continue)"
              onPress={acknowledge}
              loading={ackBusy}
              disabled={ackBusy}
              fullWidth
              centerText
              centerContent
              style={styles.noticeButton}
              tone="blue"
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (state === 'needsSetup') {
    return <Redirect href="/(auth)/signup" />;
  }

  if (state === 'locked') {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href="/(tabs)" />;
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    splash: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: neutral.onBase,
    },
    splashImage: {
      width: 140,
      height: 140,
    },
    noticeContainer: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    noticeScroll: {
      flex: 1,
      width: '100%',
    },
    noticeScrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    noticeLogo: {
      width: 104,
      height: 104,
      marginBottom: 16,
      borderRadius: 18,
    },
    noticeCard: {
      backgroundColor: neutral.surface,
      borderColor: neutral.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 16,
      padding: 20,
      gap: 14,
      width: '100%',
    },
    noticeTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: neutral.onSurface,
      lineHeight: 30,
    },
    noticeBody: {
      fontSize: 16,
      lineHeight: 24,
      color: neutral.onSurface,
    },
    noticeLink: {
      textDecorationLine: 'underline',
      color: neutral.onSurface,
      fontWeight: '700',
    },
    noticeBulletRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 0,
    },
    noticeBulletDot: {
      color: neutral.onSurface,
      marginTop: 2,
    },
    noticeBulletText: {
      flex: 1,
      color: neutral.onSurface,
      lineHeight: 24,
      fontSize: 16,
    },
    noticeButton: {
      marginTop: 12,
    },
  });
