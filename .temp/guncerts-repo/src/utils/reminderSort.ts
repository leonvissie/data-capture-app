import type {
  CompetencyCertificate,
  CompetencyExpiryReminderPreference,
  Firearm,
} from '../data/types';
import { getCompetencyReminderExpiryDate } from './competencyExpiry';
import { getCompetencyReminderVisualState, getDaysUntil, getReminderVisualState } from './reminderVisuals';

type ActionableColor = 'red' | 'orange' | 'info';

const ACTIONABLE_COLORS = new Set<ActionableColor>(['red', 'orange', 'info']);

const reminderPriorityForVisual = (visual?: { color?: string | null; daysUntil?: number | null } | null) => {
  const color = `${visual?.color ?? ''}` as ActionableColor;
  if (!ACTIONABLE_COLORS.has(color)) {
    return {
      actionable: 1,
      daysUntil: Number.MAX_SAFE_INTEGER,
    };
  }
  return {
    actionable: 0,
    daysUntil: typeof visual?.daysUntil === 'number' ? visual.daysUntil : Number.MAX_SAFE_INTEGER,
  };
};

export const compareCompetenciesByReminderPriority = (
  a: CompetencyCertificate,
  b: CompetencyCertificate,
  options: {
    preference?: CompetencyExpiryReminderPreference;
    terminalIds?: Set<string>;
    compareBase: (left: CompetencyCertificate, right: CompetencyCertificate) => number;
  },
) => {
  const terminalIds = options.terminalIds ?? new Set<string>();
  const visualA = terminalIds.has(String(a.id))
    ? { color: 'green', daysUntil: getDaysUntil(getCompetencyReminderExpiryDate(a, options.preference)) ?? null }
    : getCompetencyReminderVisualState(a, options.preference);
  const visualB = terminalIds.has(String(b.id))
    ? { color: 'green', daysUntil: getDaysUntil(getCompetencyReminderExpiryDate(b, options.preference)) ?? null }
    : getCompetencyReminderVisualState(b, options.preference);

  const priorityA = reminderPriorityForVisual(visualA);
  const priorityB = reminderPriorityForVisual(visualB);
  if (priorityA.actionable !== priorityB.actionable) {
    return priorityA.actionable - priorityB.actionable;
  }
  if (priorityA.daysUntil !== priorityB.daysUntil) {
    return priorityA.daysUntil - priorityB.daysUntil;
  }
  return options.compareBase(a, b);
};

export const compareFirearmsByReminderPriority = (
  a: Firearm,
  b: Firearm,
  options: {
    terminalIds?: Set<string>;
    compareBase: (left: Firearm, right: Firearm) => number;
  },
) => {
  const terminalIds = options.terminalIds ?? new Set<string>();
  const visualA = terminalIds.has(String(a.id))
    ? { color: 'green', daysUntil: getDaysUntil(a.validTo) ?? null }
    : getReminderVisualState('firearm', a.validTo);
  const visualB = terminalIds.has(String(b.id))
    ? { color: 'green', daysUntil: getDaysUntil(b.validTo) ?? null }
    : getReminderVisualState('firearm', b.validTo);

  const priorityA = reminderPriorityForVisual(visualA);
  const priorityB = reminderPriorityForVisual(visualB);
  if (priorityA.actionable !== priorityB.actionable) {
    return priorityA.actionable - priorityB.actionable;
  }
  if (priorityA.daysUntil !== priorityB.daysUntil) {
    return priorityA.daysUntil - priorityB.daysUntil;
  }
  return options.compareBase(a, b);
};

