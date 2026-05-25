import type { Application, Motivation, UUID } from '../data/types';
import { createMotivation } from '../data/defaults';
import { touch } from '../data/repo';
import { listByType, saveEntity } from '../data/sqlite';

const normalizeId = (value: unknown): string => String(value ?? '').trim();

export const getPrimaryApplicationFirearmId = (application?: Application | null): string => {
  if (!application) return '';
  const selected = Array.isArray(application.selectedFirearmIds)
    ? application.selectedFirearmIds.map((id) => normalizeId(id)).filter(Boolean)
    : [];
  if (selected.length) return selected[0];
  const firearms = Array.isArray(application.firearms) ? application.firearms : [];
  const firstInline = firearms
    .map((firearm) => normalizeId((firearm as any)?.id))
    .find(Boolean);
  return firstInline ?? '';
};

export const getMotivationById = (motivationId?: string | null): Motivation | null => {
  const id = normalizeId(motivationId);
  if (!id) return null;
  return listByType<Motivation>('Motivation').find((entry) => normalizeId(entry.id) === id) ?? null;
};

export const findMotivationByHolderAndFirearm = (
  holderProfileId?: string | null,
  firearmId?: string | null,
): Motivation | null => {
  const holderId = normalizeId(holderProfileId);
  const targetFirearmId = normalizeId(firearmId);
  if (!holderId || !targetFirearmId) return null;
  const candidates = listByType<Motivation>('Motivation')
    .filter(
      (entry) =>
        normalizeId(entry.holderProfileId) === holderId &&
        normalizeId(entry.firearmId) === targetFirearmId,
    )
    .sort(
      (left, right) =>
        new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime(),
    );
  return candidates[0] ?? null;
};

export const ensureMotivationForApplication = (application: Application): Motivation | null => {
  const holderProfileId = normalizeId(application.applicantProfileId);
  const firearmId = normalizeId(application.motivationFirearmId) || getPrimaryApplicationFirearmId(application);
  if (!holderProfileId || !firearmId) return null;

  const linked = getMotivationById(application.motivationId);
  if (linked && normalizeId(linked.firearmId) === firearmId) return linked;

  const existing = findMotivationByHolderAndFirearm(holderProfileId, firearmId);
  if (existing) return existing;

  const created = createMotivation(holderProfileId as UUID, firearmId as UUID);
  saveEntity(created);
  return created;
};

export const ensureMotivationForHolderAndFirearm = (
  holderProfileId?: string | null,
  firearmId?: string | null,
): Motivation | null => {
  const holderId = normalizeId(holderProfileId);
  const targetFirearmId = normalizeId(firearmId);
  if (!holderId || !targetFirearmId) return null;
  const existing = findMotivationByHolderAndFirearm(holderId, targetFirearmId);
  if (existing) return existing;
  const created = createMotivation(holderId as UUID, targetFirearmId as UUID);
  saveEntity(created);
  return created;
};

export const resolveApplicationMotivation = (application?: Application | null): Motivation | null => {
  if (!application) return null;
  const linked = getMotivationById(application.motivationId);
  if (linked) return linked;
  const holderProfileId = normalizeId(application.applicantProfileId);
  const firearmId = normalizeId(application.motivationFirearmId) || getPrimaryApplicationFirearmId(application);
  if (!holderProfileId || !firearmId) return null;
  return findMotivationByHolderAndFirearm(holderProfileId, firearmId);
};

export const buildApplicationMotivationMirrorPatch = (
  application: Application,
  motivation: Motivation | null,
): Partial<Application> => {
  if (!motivation) return {};
  return {
    motivationId: motivation.id,
    motivationFirearmId: motivation.firearmId,
    motivationProfile: motivation.profile,
    motivationText: motivation.text,
    motivationWizardStatus: motivation.wizardStatus,
  };
};

export const updateMotivation = (
  motivation: Motivation,
  patch: Partial<Motivation>,
): Motivation => touch({ ...motivation, ...patch } as Motivation);
