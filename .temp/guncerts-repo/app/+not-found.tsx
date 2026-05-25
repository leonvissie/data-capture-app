import { Link, Stack } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useTones } from '../src/theme/tones';

export default function NotFoundScreen() {
  const tones = useTones();
  const styles = useMemo(() => createStyles(tones), [tones]);
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>

        <Link href="/(tabs)" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const createStyles = (tones: ReturnType<typeof useTones>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
    },
    link: {
      marginTop: 15,
      paddingVertical: 15,
    },
    linkText: {
      fontSize: 14,
      color: tones.blue.base,
    },
  });
