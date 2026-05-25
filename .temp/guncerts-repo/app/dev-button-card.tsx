import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Screen from '../src/components/Screen';
import PageHeader from '../src/components/PageHeader';
import TabScrollView from '../src/components/TabScrollView';
import { useTones } from '../src/theme/tones';
import ButtonCard, { ButtonCardAction } from '../src/components/ButtonCard';

const returnPath = '/dev-button-card';
const encodedReturnPath = encodeURIComponent(returnPath);

export default function DevButtonCardScreen() {
  const router = useRouter();
  const [pressCount, setPressCount] = useState(0);
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);

  const primaryButtons: ButtonCardAction[] = useMemo(
    () => [
      {
        id: 'increment',
        label: 'Increase counter',
        sublabel: `Pressed ${pressCount} ${pressCount === 1 ? 'time' : 'times'}`,
        tone: 'teal',
        onPress: () => setPressCount((c) => c + 1),
      },
      {
        id: 'launch-wizard',
        label: 'Open competency wizard',
        sublabel: 'Launch the capture flow and return here',
        tone: 'blue',
        variant: 'outline',
        onPress: () =>
          router.push({
            pathname: '/competency/wizard',
            params: { returnTo: encodedReturnPath, completeReturnTo: encodedReturnPath },
          } as any),
      },
      {
        id: 'back-home',
        label: 'Back to dev tools',
        variant: 'ghost',
        tone: 'grey',
        onPress: () => router.replace('/(tabs)/settings?scroll=dev' as any),
      },
    ],
    [pressCount, router]
  );

  const secondaryButtons: ButtonCardAction[] = useMemo(
    () => [
      {
        id: 'reset',
        label: 'Reset counter',
        sublabel: 'Clear the counter above',
        tone: 'orange',
        variant: 'outline',
        disabled: pressCount === 0,
        onPress: () => setPressCount(0),
      },
      {
        id: 'show-alert',
        label: 'Show alert',
        sublabel: 'Quick check that buttons fire actions',
        tone: 'red',
        variant: 'ghost',
        onPress: () => Alert.alert('ButtonCard', 'Example action triggered from the ButtonCard.'),
      },
    ],
    [pressCount]
  );

  return (
    <Screen>
      <View style={styles.container}>
        <PageHeader
          title="Button card preview"
          onBack={() => router.back()}
          onClose={() => router.replace('/(tabs)')}
          style={styles.header}
        />
        <TabScrollView contentContainerStyle={styles.content}>
          <Text style={styles.lede}>
            ButtonCard wraps the document-style container used on the documents page, but swaps the
            floating icon actions for full-width buttons you can configure per screen.
          </Text>

          <ButtonCard
            title="Primary actions"
            status={`${primaryButtons.length} actions`}
            statusColor={tones.blue.base}
            buttons={primaryButtons}
          >
            <Text style={styles.helper}>
              Use this card to showcase multiple call-to-actions together. Counter: {pressCount}
            </Text>
          </ButtonCard>

          <ButtonCard
            title="Secondary actions"
            subtitle="Optional follow-up tasks"
            buttons={secondaryButtons}
          />
        </TabScrollView>
      </View>
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    container: { flex: 1, paddingTop: 12 },
    header: { paddingHorizontal: 20 },
    content: { paddingHorizontal: 20, paddingVertical: 12, gap: 16 },
    lede: { color: neutral.base, fontSize: 14, lineHeight: 20 },
    helper: { color: neutral.onSurface, fontSize: 14, lineHeight: 20 },
  });
