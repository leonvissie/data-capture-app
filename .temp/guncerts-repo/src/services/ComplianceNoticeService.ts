import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { ComplianceNoticeTrigger } from '../config/appConfig';

const K_NOTICE_ACCEPTANCE = 'compliance.notice.acceptance.v1';

type NoticeAcceptanceRecord = {
  acceptedAt: string;
  acceptedVersion?: string;
  acceptedBuild?: string;
};

type CurrentAppIdentifiers = {
  version?: string;
  build?: string;
};

const resolveVersion = (): string | undefined => {
  return (
    (Constants?.expoConfig as any)?.version ??
    (Constants as any)?.manifest?.version ??
    (Constants as any)?.nativeAppVersion ??
    undefined
  );
};

const resolveBuild = (): string | undefined => {
  const nativeBuild =
    (Constants as any)?.nativeBuildVersion ??
    (Constants as any)?.platform?.ios?.buildNumber ??
    (Constants as any)?.platform?.android?.versionCode;

  if (nativeBuild != null && nativeBuild !== '') {
    return String(nativeBuild);
  }

  if (Platform.OS === 'ios') {
    const expoBuild = (Constants?.expoConfig as any)?.ios?.buildNumber;
    return expoBuild != null && expoBuild !== '' ? String(expoBuild) : undefined;
  }

  const expoBuild = (Constants?.expoConfig as any)?.android?.versionCode;
  return expoBuild != null && expoBuild !== '' ? String(expoBuild) : undefined;
};

const parseRecord = (raw: string | null): NoticeAcceptanceRecord | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<NoticeAcceptanceRecord>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      acceptedAt: typeof parsed.acceptedAt === 'string' ? parsed.acceptedAt : new Date(0).toISOString(),
      acceptedVersion: typeof parsed.acceptedVersion === 'string' ? parsed.acceptedVersion : undefined,
      acceptedBuild: typeof parsed.acceptedBuild === 'string' ? parsed.acceptedBuild : undefined,
    };
  } catch {
    return null;
  }
};

const getCurrentIdentifiers = (): CurrentAppIdentifiers => ({
  version: resolveVersion(),
  build: resolveBuild(),
});

const shouldCompareVersion = (trigger: ComplianceNoticeTrigger): boolean =>
  trigger === 'version' || trigger === 'both';

const shouldCompareBuild = (trigger: ComplianceNoticeTrigger): boolean =>
  trigger === 'build' || trigger === 'both';

export const ComplianceNoticeService = {
  getCurrentIdentifiers,

  async getStoredAcceptance(): Promise<NoticeAcceptanceRecord | null> {
    try {
      return parseRecord(await SecureStore.getItemAsync(K_NOTICE_ACCEPTANCE));
    } catch {
      return null;
    }
  },

  async requiresAcknowledgement(trigger: ComplianceNoticeTrigger): Promise<boolean> {
    if (trigger === 'always') return true;
    try {
      const current = getCurrentIdentifiers();
      const stored = await this.getStoredAcceptance();
      if (!stored) return true;

      if (shouldCompareVersion(trigger) && current.version && stored.acceptedVersion !== current.version) {
        return true;
      }

      if (shouldCompareBuild(trigger) && current.build && stored.acceptedBuild !== current.build) {
        return true;
      }

      return false;
    } catch {
      // Fail closed for compliance: when in doubt, require acknowledgement again.
      return true;
    }
  },

  async acknowledge(): Promise<void> {
    const current = getCurrentIdentifiers();
    const next: NoticeAcceptanceRecord = {
      acceptedAt: new Date().toISOString(),
      acceptedVersion: current.version,
      acceptedBuild: current.build,
    };
    await SecureStore.setItemAsync(K_NOTICE_ACCEPTANCE, JSON.stringify(next));
  },

  async clearAcceptance(): Promise<void> {
    await SecureStore.deleteItemAsync(K_NOTICE_ACCEPTANCE);
  },
};
