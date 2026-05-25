import type { Application, ApplicationStatus } from '../data/types';
import { listByType } from '../data/sqlite';
import {
  resolveEffectiveCompetencyCertificateIds,
  resolveEffectiveFirearmIds,
} from '../pdf/context';

export type ReminderRenewalItemType = 'competency' | 'firearm';

export type ReminderApplicationResolution =
  | {
      kind: 'none';
      form: '517g' | '518a';
      itemType: ReminderRenewalItemType;
      itemId: string;
      applications: [];
    }
  | {
      kind: 'single';
      form: '517g' | '518a';
      itemType: ReminderRenewalItemType;
      itemId: string;
      applications: [Application];
    }
  | {
      kind: 'multiple';
      form: '517g' | '518a';
      itemType: ReminderRenewalItemType;
      itemId: string;
      applications: Application[];
    };

const ACTIVE_STATUSES: ApplicationStatus[] = ['draft', 'ready'];
const TERMINAL_STATUSES: ApplicationStatus[] = ['submitted', 'archived'];

const normalizeForm = (value?: string | null) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^e/, '');
  if (normalized === '517g' || normalized === '518a') return normalized as '517g' | '518a';
  return null;
};

const targetFormForItemType = (itemType: ReminderRenewalItemType): '517g' | '518a' =>
  itemType === 'competency' ? '517g' : '518a';

const applicationIncludesItem = (
  application: Application,
  itemType: ReminderRenewalItemType,
  itemId: string
) => {
  const targetId = String(itemId);
  if (itemType === 'competency') {
    return resolveEffectiveCompetencyCertificateIds(application).includes(targetId);
  }
  return resolveEffectiveFirearmIds(application).includes(targetId);
};

const compareApplicationsNewestFirst = (a: Application, b: Application) => {
  const updatedA = Date.parse(a.updatedAt || '');
  const updatedB = Date.parse(b.updatedAt || '');
  const createdA = Date.parse(a.createdAt || '');
  const createdB = Date.parse(b.createdAt || '');
  const updatedDiff = (Number.isNaN(updatedB) ? 0 : updatedB) - (Number.isNaN(updatedA) ? 0 : updatedA);
  if (updatedDiff !== 0) return updatedDiff;
  return (Number.isNaN(createdB) ? 0 : createdB) - (Number.isNaN(createdA) ? 0 : createdA);
};

const resolveMatchingApplications = (
  itemType: ReminderRenewalItemType,
  itemId: string,
  statuses: ApplicationStatus[]
): ReminderApplicationResolution => {
  const form = targetFormForItemType(itemType);
  const applications = listByType<Application>('Application')
    .filter((application) => {
      const normalizedForm = normalizeForm(application.form ?? (application as any).type);
      if (normalizedForm !== form) return false;
      if (!statuses.includes(application.status)) return false;
      return applicationIncludesItem(application, itemType, itemId);
    })
    .sort(compareApplicationsNewestFirst);

  if (!applications.length) {
    return { kind: 'none', form, itemType, itemId, applications: [] };
  }
  if (applications.length === 1) {
    return { kind: 'single', form, itemType, itemId, applications: [applications[0]] };
  }
  return { kind: 'multiple', form, itemType, itemId, applications };
};

export const resolveActiveReminderApplications = (
  itemType: ReminderRenewalItemType,
  itemId: string
): ReminderApplicationResolution =>
  resolveMatchingApplications(itemType, itemId, ACTIVE_STATUSES);

export const resolveTerminalReminderApplications = (
  itemType: ReminderRenewalItemType,
  itemId: string
): ReminderApplicationResolution =>
  resolveMatchingApplications(itemType, itemId, TERMINAL_STATUSES);

