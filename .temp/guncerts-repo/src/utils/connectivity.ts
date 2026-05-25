import * as Network from 'expo-network';
import { logger } from '@/src/utils/logger';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const isDeviceOffline = async (): Promise<boolean> => {
  try {
    const readOffline = async () => {
      const state = await Network.getNetworkStateAsync();
      return state?.isConnected === false || state?.isInternetReachable === false;
    };

    const firstReadOffline = await readOffline();
    if (!firstReadOffline) return false;

    // Reachability can lag briefly after reconnect; retry once before declaring offline.
    await delay(350);
    return await readOffline();
  } catch (error) {
    logger.warn('[connectivity] Failed to check network state', error);
    return false;
  }
};
