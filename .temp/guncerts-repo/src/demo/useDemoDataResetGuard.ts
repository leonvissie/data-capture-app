import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { isDemoDatasetActive } from './demoState';

type DemoGuardEntity = 'firearm' | 'competency certificate' | 'safe';

const formatEntityLabel = (entity: DemoGuardEntity) =>
  entity === 'firearm'
    ? 'firearms'
    : entity === 'safe'
      ? 'safes'
      : 'competency certificates';

export const useDemoDataResetGuard = () => {
  const router = useRouter();

  return useCallback(
    async (entity: DemoGuardEntity): Promise<boolean> => {
      if (!(await isDemoDatasetActive())) return false;

      Alert.alert(
        'Demo data active',
        `You cannot add or remove ${formatEntityLabel(entity)} while demo data is active. Erase demo data and reset the app to start with real data.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reset app',
            style: 'destructive',
            onPress: () => {
              router.push('/reset' as any);
            },
          },
        ],
      );
      return true;
    },
    [router],
  );
};
