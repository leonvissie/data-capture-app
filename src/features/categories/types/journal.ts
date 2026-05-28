import type { ValidationSeverity } from '@/foundation/validation/types';

export type JournalSectionType = 'singleSelect' | 'multiSelect' | 'scale' | 'text' | 'number';

export type JournalSectionDraft = {
  id: string;
  label: string;
  type: JournalSectionType;
  requiredSeverity: ValidationSeverity;
  options: string[];
  helpText?: string;
};

export function makeDraftSectionId() {
  return `jsec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const journalTemplateDefaults: JournalSectionDraft[] = [
  {
    id: makeDraftSectionId(),
    label: 'How I feel',
    type: 'scale',
    requiredSeverity: 'blocking',
    options: [],
    helpText: 'e.g. "How am I feeling?" (a scale of 1 to 10)',
  },
  {
    id: makeDraftSectionId(),
    label: 'Meds',
    type: 'multiSelect',
    requiredSeverity: 'warning',
    options: ['Med A', 'Med B'],
    helpText: 'e.g "Meds taken" (multiple options that can be selected)',
  },
  {
    id: makeDraftSectionId(),
    label: 'Before/After food',
    type: 'singleSelect',
    requiredSeverity: 'warning',
    options: ['Before', 'After'],
    helpText: 'e.g. "Meds before or after food?" (only one option can be selected)',
  },
  {
    id: makeDraftSectionId(),
    label: 'Notes',
    type: 'text',
    requiredSeverity: 'warning',
    options: [],
    helpText: 'e.g. "Additional notes" (free text field to capture extra info)',
  },
];
