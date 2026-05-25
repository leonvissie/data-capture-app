import { AnyEntity, OutboxItem, UUID, Application, UserPrefs, DevicePrefs } from './types';
import { createApplication, createDevicePrefs, createUserPrefs } from './defaults';
import { saveEntity, saveEntityAsync, enqueueOutbox, enqueueOutboxAsync, listByType, deleteEntity, getById } from './sqlite';
import { CURRENT_ENTITY_SCHEMA_VERSION } from './migrations';

export const now = () => new Date().toISOString();

export function withMeta<E extends AnyEntity>(
  draft: Omit<E, 'createdAt'|'updatedAt'|'version'|'schemaVersion'>
): E {
  const t = now();
  return {
    ...(draft as any),
    createdAt: t,
    updatedAt: t,
    version: 1,
    schemaVersion: CURRENT_ENTITY_SCHEMA_VERSION
  } as E;
}

export function touch<E extends AnyEntity>(e: E): E {
  return { ...e, updatedAt: now(), version: (e.version ?? 0) + 1 };
}

function pruneDuplicates<T extends AnyEntity>(items: T[]): T {
  const [primary, ...dups] = items;
  dups.forEach(dup => deleteEntity(dup.id));
  return primary;
}

export function persist<E extends AnyEntity>(e: E, enqueue = true) {
  saveEntity(e);
  if (enqueue) {
    const out: OutboxItem = {
      id: (globalThis.crypto?.randomUUID?.() ?? `out_${Math.random().toString(36).slice(2)}`) as UUID,
      entityType: e.type,
      entityId: e.id,
      op: 'UPSERT',
      payload: e,
      createdAt: now()
    };
    enqueueOutbox(out);
  }
}

export async function persistAsync<E extends AnyEntity>(e: E, enqueue = true) {
  await saveEntityAsync(e);
  if (enqueue) {
    const out: OutboxItem = {
      id: (globalThis.crypto?.randomUUID?.() ?? `out_${Math.random().toString(36).slice(2)}`) as UUID,
      entityType: e.type,
      entityId: e.id,
      op: 'UPSERT',
      payload: e,
      createdAt: now()
    };
    await enqueueOutboxAsync(out);
  }
}

// -------------------------------------------------
// Preferences helpers (account-level and device-level)
// -------------------------------------------------
const normalizeUserPrefs = (prefs: UserPrefs): UserPrefs => {
  const dfoCompetencyExpiryUsing =
    prefs.dfoCompetencyExpiryUsing === 'compIssueDate' ||
    prefs.dfoCompetencyExpiryUsing === 'firearmExpiry' ||
    prefs.dfoCompetencyExpiryUsing === 'unknown'
      ? prefs.dfoCompetencyExpiryUsing
      : 'unknown';
  const compCertCalcMethodSet =
    prefs.compCertCalcMethodSet ??
    (dfoCompetencyExpiryUsing !== undefined && dfoCompetencyExpiryUsing !== 'unknown');
  const competencyRemindersResetRequestedAt = prefs.competencyRemindersResetRequestedAt;
  const applicationIntent =
    prefs.applicationIntent === 'new' ||
    prefs.applicationIntent === 'renewal' ||
    prefs.applicationIntent === 'both'
      ? prefs.applicationIntent
      : 'both';
  const applicationType =
    prefs.applicationType === 'competency' ||
    prefs.applicationType === 'firearm' ||
    prefs.applicationType === 'both'
      ? prefs.applicationType
      : 'both';
  const welcomeFlow =
    prefs.welcomeFlow === 'new_competency_517' ||
    prefs.welcomeFlow === 'new_firearm_271' ||
    prefs.welcomeFlow === 'renew_competency_517g' ||
    prefs.welcomeFlow === 'renew_firearm_518a'
      ? prefs.welcomeFlow
      : undefined;
  if (
    prefs.dfoCompetencyExpiryUsing === dfoCompetencyExpiryUsing &&
    prefs.compCertCalcMethodSet === compCertCalcMethodSet &&
    prefs.competencyRemindersResetRequestedAt === competencyRemindersResetRequestedAt &&
    prefs.applicationIntent === applicationIntent &&
    prefs.applicationType === applicationType &&
    prefs.welcomeFlow === welcomeFlow
  ) {
    return prefs;
  }
  const next = {
    ...prefs,
    applicationIntent,
    applicationType,
    welcomeFlow,
    dfoCompetencyExpiryUsing,
    compCertCalcMethodSet,
    competencyRemindersResetRequestedAt,
  } as UserPrefs;
  persist(touch(next));
  return next;
};

export function getUserPrefs(profileId: UUID): UserPrefs | undefined {
  const matches = listByType<UserPrefs>('UserPrefs').filter(p => p.holderProfileId === profileId);
  if (!matches.length) return undefined;
  const resolved = matches.length === 1 ? matches[0] : pruneDuplicates(matches);
  return normalizeUserPrefs(resolved);
}

export function ensureUserPrefs(profileId: UUID): UserPrefs {
  const existing = getUserPrefs(profileId);
  if (existing) return existing;
  const profileExists = !!getById(profileId);
  if (!profileExists) {
    throw new Error(`Cannot create user prefs for missing profile ${profileId}`);
  }
  const created = createUserPrefs(profileId);
  persist(created);
  return created;
}

export function saveUserPrefs(next: UserPrefs) {
  persist(touch(next));
}

export function getDevicePrefs(profileId?: UUID, deviceId?: string): DevicePrefs | undefined {
  const all = listByType<DevicePrefs>('DevicePrefs');
  if (deviceId) {
    const matches = all.filter(p => p.deviceId === deviceId);
    if (matches.length) return matches.length === 1 ? matches[0] : pruneDuplicates(matches);
  }
  if (profileId) {
    const matches = all.filter(p => p.holderProfileId === profileId);
    if (matches.length) return matches.length === 1 ? matches[0] : pruneDuplicates(matches);
  }
  return undefined;
}

export function ensureDevicePrefs(profileId?: UUID, deviceId?: string): DevicePrefs {
  const existing = getDevicePrefs(profileId, deviceId);
  if (existing) return existing;
  if (profileId) {
    const profileExists = !!getById(profileId);
    if (!profileExists) {
      throw new Error(`Cannot create device prefs for missing profile ${profileId}`);
    }
  }
  const created = createDevicePrefs(
    {
      holderProfileId: profileId,
      deviceId: deviceId || 'local-device',
    },
    deviceId || 'local-device',
  );
  persist(created);
  return created;
}

export function saveDevicePrefs(next: DevicePrefs) {
  persist(touch(next));
}

export function createApplicationDraft(form: '517g'|'518a', seed?: Partial<Application>) {
  const app = createApplication(form, {
    status: 'draft',
    ...seed,
  });
  // Preserve any legacy extras that may still be passed through seed (e.g. annexures).
  const withExtras = form === '518a' && (seed as any)?.annexures === undefined
    ? ({ ...app, annexures: [] } as Application)
    : ({ ...app, ...(seed as any) } as Application);
  persist(withExtras);
  return withExtras;
}
