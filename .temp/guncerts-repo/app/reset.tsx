import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useTones } from '../src/theme/tones';
import Screen from '../src/components/Screen';
import PageHeader from '../src/components/PageHeader';
import { useRouter } from 'expo-router';
import { useLock } from '../src/providers/LockProvider';
import { Ionicons } from '@expo/vector-icons';

export default function ResetScreen() {
  const router = useRouter();
  const { eraseAndReset } = useLock();
  const tones = useTones();
  const neutral = tones.grey;
  const danger = tones.red;
  const styles = useMemo(() => createStyles(neutral, danger), [danger, neutral]);

  const onErase = async () => {
    Alert.alert(
      'Erase all local data?',
      'This will remove your passcode and all locally stored applications/documents on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase',
          style: 'destructive',
          onPress: async () => {
            await eraseAndReset();
            router.replace({ pathname: '/(auth)/signup', params: { reset: '1' } } as any);
          }
        }
      ]
    );
  };

  return (
    <Screen>
      <View style={styles.wrap}>
        <PageHeader title="Erase & Reset" onClose={() => router.back()} />
        <View style={styles.card}>
          <Text style={styles.body}>
            This removes your passcode and deletes all locally stored data. You cannot undo this action.
          </Text>

          <View style={styles.warningRow}>
            <Ionicons name="warning-outline" size={16} color={danger.onSurface} />
            <Text style={styles.warningText}>Destructive action. Recovery is not possible after erase.</Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.btnDanger, pressed && styles.btnDangerPressed]}
            onPress={onErase}
            accessibilityRole="button"
            accessibilityLabel="Erase all local data"
            accessibilityHint="Removes passcode and deletes all locally stored data"
          >
            <Text style={styles.btnDangerText}>Erase all local data</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const createStyles = (neutral: ReturnType<typeof useTones>['grey'], danger: ReturnType<typeof useTones>['red']) =>
  StyleSheet.create({
    wrap: { flex: 1, padding: 20, gap: 14 },
    card: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: neutral.border,
      backgroundColor: neutral.onBase,
      padding: 16,
      gap: 14,
    },
    body: { fontSize: 16, lineHeight: 24, color: neutral.onSurface },
    warningRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: danger.border,
      backgroundColor: danger.surface,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    warningText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: danger.onSurface,
    },
    btnDanger: {
      backgroundColor: danger.base,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: danger.border,
    },
    btnDangerPressed: { backgroundColor: danger.emphasis, borderColor: danger.emphasis },
    btnDangerText: { color: danger.onBase, fontWeight: '800', fontSize: 18 },
  });
