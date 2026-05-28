import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/foundation/components';
import { spacing } from '@/foundation/theme';

type DurationTimerDisplayProps = {
  startedAtIso: string;
};

function toDurationText(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function DurationTimerDisplay({ startedAtIso }: DurationTimerDisplayProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const durationText = useMemo(() => {
    const startedAtMs = new Date(startedAtIso).getTime();
    return toDurationText(nowMs - startedAtMs);
  }, [nowMs, startedAtIso]);

  return (
    <Card>
      <View style={styles.wrap}>
        <AppText variant="bodySmall">Duration</AppText>
        <AppText style={styles.value}>{durationText}</AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  value: {
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: 1,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
  },
});
