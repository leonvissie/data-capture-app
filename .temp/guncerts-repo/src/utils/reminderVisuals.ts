import { REMINDER_CONFIG, type ReminderConfig } from '../config/reminders';
import { CompetencyCertificate, CompetencyExpiryReminderPreference } from '../data/types';
import { getCompetencyReminderExpiryDate } from './competencyExpiry';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

type ReminderVisualTarget = 'competency' | 'firearm' | 'membership';
type ReminderVisualColor = ReminderConfig['color'] | 'info';

export type ReminderVisualState = {
  config: ReminderConfig;
  label: string;
  color: ReminderVisualColor;
  daysUntil: number;
};

const parseIsoDate = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

export const getDaysUntil = (value?: string | null) => {
  const date = parseIsoDate(value);
  if (!date) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((date.getTime() - todayUtc) / MS_PER_DAY);
};

const reminderConfigs = Object.values(REMINDER_CONFIG);
const competencyConfigs = reminderConfigs.filter((config) => config.code.startsWith('CompCert'));
const firearmConfigs = reminderConfigs.filter((config) => config.code.startsWith('Firearm'));
const membershipConfigs = reminderConfigs.filter((config) => config.code.startsWith('Membership'));

export const pickTriggeredReminder = (daysUntil: number | null, configs: ReminderConfig[]) => {
  if (daysUntil === null) return null;
  let selected: ReminderConfig | null = null;
  for (const config of configs) {
    if (daysUntil <= config.daysToExpiry) {
      if (!selected || config.daysToExpiry < selected.daysToExpiry) {
        selected = config;
      }
    }
  }
  return selected;
};

export const getReminderVisualState = (
  target: ReminderVisualTarget,
  expiryDate?: string | null,
): ReminderVisualState | null => {
  const daysUntil = getDaysUntil(expiryDate);
  if (target === 'membership' && daysUntil === 0) {
    const sameDayConfig = membershipConfigs
      .filter((config) => config.daysToExpiry >= 0 && config.daysToExpiry !== 0)
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry)[0];
    const sameDayLabel = sameDayConfig?.cardPillLabel?.trim() ?? '';
    if (sameDayConfig && sameDayLabel) {
      return {
        config: sameDayConfig,
        label: sameDayLabel,
        color: sameDayConfig.color,
        daysUntil,
      };
    }
  }
  const configs =
    target === 'competency'
      ? competencyConfigs
      : target === 'firearm'
        ? firearmConfigs
        : membershipConfigs;
  const config = pickTriggeredReminder(daysUntil, configs);
  const label = config?.cardPillLabel?.trim() ?? '';
  if (!config || !label || daysUntil === null) return null;
  return {
    config,
    label,
    color: config.color,
    daysUntil,
  };
};

const pickSoonestIsoDate = (values: Array<string | null | undefined>): string | undefined => {
  let chosen: Date | null = null;
  values.forEach((value) => {
    const parsed = parseIsoDate(value ?? undefined);
    if (!parsed) return;
    if (!chosen || parsed.getTime() < chosen.getTime()) {
      chosen = parsed;
    }
  });
  if (!chosen) return undefined;
  const finalChosen: Date = chosen;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${finalChosen.getUTCFullYear()}-${pad(finalChosen.getUTCMonth() + 1)}-${pad(finalChosen.getUTCDate())}`;
};

export const getCompetencyReminderVisualState = (
  certificate: CompetencyCertificate,
  preference: CompetencyExpiryReminderPreference = 'unknown',
): ReminderVisualState | null => {
  if (preference === 'compIssueDate' || preference === 'firearmExpiry') {
    return getReminderVisualState('competency', getCompetencyReminderExpiryDate(certificate, preference));
  }
  const compCalcDate = certificate.expiresAtCompCertCalc?.trim() || '';
  const firearmCalcDate = certificate.expiresAtFirearmCalc?.trim() || '';
  const compConfig = pickTriggeredReminder(getDaysUntil(compCalcDate), competencyConfigs);
  const firearmConfig = pickTriggeredReminder(getDaysUntil(firearmCalcDate), competencyConfigs);
  const reminderExpiryDate = getCompetencyReminderExpiryDate(certificate, 'unknown') ?? pickSoonestIsoDate([
    certificate.expiresAtCompCertCalc,
    certificate.expiresAtFirearmCalc,
    certificate.expiresAt,
  ]);
  const reminderDaysUntil = getDaysUntil(reminderExpiryDate);
  const reminderConfig = pickTriggeredReminder(reminderDaysUntil, competencyConfigs);

  if (
    compCalcDate &&
    firearmCalcDate &&
    (compConfig?.code ?? null) !== (firearmConfig?.code ?? null) &&
    reminderConfig &&
    reminderDaysUntil !== null
  ) {
    return {
      config: reminderConfig,
      label: 'Expiry differs',
      color: 'info',
      daysUntil: reminderDaysUntil,
    };
  }

  return getReminderVisualState('competency', reminderExpiryDate);
};
