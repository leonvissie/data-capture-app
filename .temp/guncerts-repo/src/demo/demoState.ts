import * as SecureStore from 'expo-secure-store';
import { appConfig } from '../config/appConfig';

const K_DEMO_DATASET_ACTIVE = 'demo.dataset.active';
const K_DEMO_DATASET_VERSION = 'demo.dataset.version';
const K_DEMO_DATASET_INSTALLED_AT = 'demo.dataset.installedAt';

export type DemoDatasetState = {
  active: boolean;
  version: number | null;
  installedAt?: string;
};

const parseStoredNumber = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getDemoDatasetVersion = async (): Promise<number | null> =>
  parseStoredNumber(await SecureStore.getItemAsync(K_DEMO_DATASET_VERSION));

export const isDemoDatasetActive = async (): Promise<boolean> =>
  (await SecureStore.getItemAsync(K_DEMO_DATASET_ACTIVE)) === '1';

export const setDemoDatasetActive = async (active: boolean): Promise<void> => {
  if (active) {
    await SecureStore.setItemAsync(K_DEMO_DATASET_ACTIVE, '1');
    return;
  }
  await SecureStore.deleteItemAsync(K_DEMO_DATASET_ACTIVE);
};

export const setDemoDatasetState = async (params: {
  active: boolean;
  version: number;
  installedAt?: string;
}): Promise<void> => {
  const installedAt = params.installedAt ?? new Date().toISOString();
  await Promise.all([
    setDemoDatasetActive(params.active),
    SecureStore.setItemAsync(K_DEMO_DATASET_VERSION, String(params.version)),
    SecureStore.setItemAsync(K_DEMO_DATASET_INSTALLED_AT, installedAt),
  ]);
};

export const clearDemoDatasetState = async (): Promise<void> => {
  await Promise.all([
    SecureStore.deleteItemAsync(K_DEMO_DATASET_ACTIVE),
    SecureStore.deleteItemAsync(K_DEMO_DATASET_VERSION),
    SecureStore.deleteItemAsync(K_DEMO_DATASET_INSTALLED_AT),
  ]);
};

export const getDemoDatasetState = async (): Promise<DemoDatasetState> => {
  const [active, version, installedAt] = await Promise.all([
    isDemoDatasetActive(),
    getDemoDatasetVersion(),
    SecureStore.getItemAsync(K_DEMO_DATASET_INSTALLED_AT),
  ]);
  return {
    active,
    version,
    installedAt: installedAt ?? undefined,
  };
};

export const reconcileDemoDatasetState = async (): Promise<void> => {
  if (appConfig.demo.enabled) return;
  await clearDemoDatasetState();
};
