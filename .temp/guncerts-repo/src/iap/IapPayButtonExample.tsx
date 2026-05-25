import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Application } from '../data/types';
import { useIapPurchase } from './useIapPurchase';
import { useTones } from '../theme/tones';

type Props = {
  application: Application;
};

const formatResultMessage = (status: string) => {
  switch (status) {
    case 'success':
    case 'already_paid':
      return 'Payment confirmed. You can now generate your PDF.';
    case 'cancelled':
      return 'Purchase cancelled.';
    case 'failed':
      return 'Purchase failed. Please try again.';
    case 'pending':
      return 'Purchase pending approval.';
    case 'in_progress':
      return 'Purchase already in progress.';
    default:
      return 'Purchase unavailable.';
  }
};

export const IapPayButtonExample = ({ application }: Props) => {
  const { purchase, lastResult } = useIapPurchase(application);
  const [inFlight, setInFlight] = useState(false);
  const tones = useTones();
  const neutral = tones.grey;
  const styles = useMemo(() => createStyles(neutral), [neutral]);

  const message = useMemo(() => {
    if (!lastResult) return null;
    return formatResultMessage(lastResult.status);
  }, [lastResult]);

  const onPress = async () => {
    if (inFlight) return;
    setInFlight(true);
    try {
      await purchase();
    } finally {
      setInFlight(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        disabled={inFlight}
        style={({ pressed }) => [
          styles.button,
          inFlight && styles.buttonDisabled,
          pressed && !inFlight ? styles.buttonPressed : null,
        ]}
      >
        {inFlight ? <ActivityIndicator color={neutral.onBase} /> : <Text style={styles.buttonText}>Pay & Unlock</Text>}
      </Pressable>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
};

const createStyles = (neutral: ReturnType<typeof useTones>['grey']) =>
  StyleSheet.create({
    container: {
      alignItems: 'flex-start',
    },
    button: {
      backgroundColor: neutral.emphasis,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 10,
    },
    buttonPressed: {
      opacity: 0.85,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: neutral.onBase,
      fontSize: 16,
      fontWeight: '600',
    },
    message: {
      marginTop: 12,
      color: neutral.base,
      fontSize: 14,
    },
  });
