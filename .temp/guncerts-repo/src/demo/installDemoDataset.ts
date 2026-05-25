import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { appConfig } from '../config/appConfig';
import { ensureDevicePrefs, ensureUserPrefs, saveUserPrefs } from '../data/repo';
import {
  clearOutbox,
  deleteEntity,
  getFirstProfile,
  listByType,
  listOutbox,
} from '../data/sqlite';
import type { Document } from '../data/types';
import { AuthService } from '../services/AuthService';
import { deleteOwnedDocFile } from '../utils/docCrypto';
import { getDocumentBaseDir } from '../utils/documentPaths';
import { DEMO_DATASET_VERSION } from './demoDataset';
import { clearDemoDatasetState, getDemoDatasetState, setDemoDatasetState } from './demoState';
import { DemoFileKey, DEMO_FILE_MANIFEST } from './demoFileManifest';
import { seedDemoDataset } from './seedDemoDataset';

const DEMO_ASSET_MODULES: Record<DemoFileKey, number> = {
  id_card_front: require('../../assets/demo/id_card_front.png'),
  id_card_back: require('../../assets/demo/id_card_back.png'),
  proof_of_address: require('../../assets/demo/proof_of_address.png'),
  firearm_licence_front: require('../../assets/demo/firearm_licence_front.png'),
  firearm_licence_back: require('../../assets/demo/firearm_licence_back.png'),
  competency_cert: require('../../assets/demo/competency_cert.png'),
  prof_handgun: require('../../assets/demo/prof_handgun.png'),
  results_act: require('../../assets/demo/results_act.png'),
  results_handgun: require('../../assets/demo/results_handgun.png'),
  safe_closed: require('../../assets/demo/safe_closed.png'),
  safe_open: require('../../assets/demo/safe_open.png'),
  safe_bolts: require('../../assets/demo/safe_bolts.png'),
};

export type InstallDemoDatasetOptions = {
  resetBeforeInstall?: boolean;
  clearEntitiesBeforeInstall?: boolean;
  force?: boolean;
};

export type InstallDemoDatasetResult = {
  installed: boolean;
  skipped: boolean;
  reason?: 'disabled' | 'up_to_date';
  datasetVersion: number;
  configuredDatasetVersion: number;
  copiedFiles: number;
  created: number;
  updated: number;
  unchanged: number;
  total: number;
};

const ensureTrailingSlash = (value: string) => (value.endsWith('/') ? value : `${value}/`);

const copyBundledDemoFiles = async (): Promise<number> => {
  const base = getDocumentBaseDir();
  if (!base) {
    throw new Error('Document storage is unavailable on this device.');
  }
  const demoDir = `${ensureTrailingSlash(base)}demo/`;
  await FileSystem.makeDirectoryAsync(demoDir, { intermediates: true });

  const expectedFileNames = new Set(
    Object.values(DEMO_FILE_MANIFEST).map((entry) => entry.fileName),
  );

  try {
    const existing = await FileSystem.readDirectoryAsync(demoDir);
    await Promise.all(
      existing
        .filter((fileName) => !expectedFileNames.has(fileName))
        .map((fileName) => FileSystem.deleteAsync(`${demoDir}${fileName}`, { idempotent: true })),
    );
  } catch {
    // Ignore cleanup failures.
  }

  let copied = 0;
  const entries = Object.entries(DEMO_FILE_MANIFEST) as [DemoFileKey, (typeof DEMO_FILE_MANIFEST)[DemoFileKey]][];
  for (const [fileKey, entry] of entries) {
    const moduleRef = DEMO_ASSET_MODULES[fileKey];
    const asset = Asset.fromModule(moduleRef);
    if (!asset.localUri) {
      await asset.downloadAsync();
    }
    const source = asset.localUri ?? asset.uri;
    if (!source) {
      throw new Error(`Unable to resolve bundled demo asset for "${fileKey}".`);
    }
    const dest = `${demoDir}${entry.fileName}`;
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: source, to: dest });
    copied += 1;
  }

  return copied;
};

const DEMO_RELOAD_ENTITY_TYPES = [
  'Profile',
  'Document',
  'Firearm',
  'CompetencyCertificate',
  'Proficiency',
  'Safe',
] as const;

const clearDemoReloadEntitiesAndOwnedFiles = async () => {
  const docs = listByType<Document>('Document');
  const filePaths = new Set<string>();
  docs.forEach((doc) => {
    if (doc.filePath) filePaths.add(doc.filePath);
    if (doc.uri) filePaths.add(doc.uri);
    if (doc.thumbPath) filePaths.add(doc.thumbPath);
  });

  DEMO_RELOAD_ENTITY_TYPES.forEach((entityType) => {
    listByType<any>(entityType).forEach((entity) => deleteEntity(entity.id));
  });

  const outboxTypes = new Set<string>(DEMO_RELOAD_ENTITY_TYPES);
  listOutbox().forEach((item) => {
    if (outboxTypes.has(item.entityType)) {
      clearOutbox(item.id);
    }
  });

  await Promise.all(Array.from(filePaths).map((path) => deleteOwnedDocFile(path)));
};

export const installDemoDataset = async (
  options: InstallDemoDatasetOptions = {},
): Promise<InstallDemoDatasetResult> => {
  const configuredDatasetVersion = appConfig.demo.datasetVersion;
  const targetDatasetVersion = DEMO_DATASET_VERSION;
  if (!appConfig.demo.enabled) {
    await clearDemoDatasetState();
    return {
      installed: false,
      skipped: true,
      reason: 'disabled',
      datasetVersion: targetDatasetVersion,
      configuredDatasetVersion,
      copiedFiles: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      total: 0,
    };
  }

  const forceInstall = options.force === true;
  const existingState = await getDemoDatasetState();
  if (!forceInstall && existingState.version === targetDatasetVersion && existingState.active) {
    return {
      installed: false,
      skipped: true,
      reason: 'up_to_date',
      datasetVersion: targetDatasetVersion,
      configuredDatasetVersion,
      copiedFiles: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      total: 0,
    };
  }

  if (options.resetBeforeInstall !== false) {
    await AuthService.resetAndEraseAllData();
  } else if (options.clearEntitiesBeforeInstall) {
    await clearDemoReloadEntitiesAndOwnedFiles();
  }

  const copiedFiles = await copyBundledDemoFiles();
  const seeded = seedDemoDataset();
  const profile = getFirstProfile();
  if (profile?.id) {
    const prefs = ensureUserPrefs(profile.id);
    saveUserPrefs({
      ...prefs,
      showFirstTimeSetup: false,
      dfoCompetencyExpiryUsing: 'unknown',
      compCertCalcMethodSet: true,
      showFirearmWizardHint: false,
      showCompetencyWizardHint: false,
      showIdWizardHint: false,
      showAddressWizardHint: false,
      showSafeWizardHint: false,
      showMembershipWizardHint: false,
    });
    ensureDevicePrefs(profile.id);
  }

  await setDemoDatasetState({
    active: true,
    version: targetDatasetVersion,
  });

  return {
    installed: true,
    skipped: false,
    datasetVersion: seeded.datasetVersion,
    configuredDatasetVersion,
    copiedFiles,
    created: seeded.created,
    updated: seeded.updated,
    unchanged: seeded.unchanged,
    total: seeded.total,
  };
};
