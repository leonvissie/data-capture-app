export interface MotivationSignalResolverContext {
  values: Record<string, unknown>;
  evidenceKeys?: string[];
}

function hasMeaningfulText(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

export function deriveMotivationEvidenceKeys(
  context: MotivationSignalResolverContext,
): string[] {
  const keys = new Set<string>(context.evidenceKeys ?? []);

  const hasDeclaredActivityParticipation =
    context.values.activityParticipation === true ||
    hasMeaningfulText(context.values.activitySummary) ||
    hasMeaningfulText(context.values.huntingContextSummary) ||
    hasMeaningfulText(context.values.sportContextSummary);

  if (hasDeclaredActivityParticipation) {
    keys.add('activity_participation');
  }

  return Array.from(keys).sort();
}
