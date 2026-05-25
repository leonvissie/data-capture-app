import { StyleSheet } from 'react-native';

import EditScreenInfo from '@/components/EditScreenInfo';
import { Text, View } from '@/components/Themed';
import { useTones } from '../theme/tones';
import AppStatusBar from './AppStatusBar';

export default function ModalScreen() {
  const tones = useTones();
  const neutral = tones.grey;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Modal</Text>
      <View style={styles.separator} lightColor={neutral.border} darkColor={neutral.surface} />
      <EditScreenInfo path="src/components/ModalScreen.tsx" />

      <AppStatusBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
});
