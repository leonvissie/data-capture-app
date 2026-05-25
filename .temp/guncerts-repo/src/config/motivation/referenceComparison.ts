import type { ComposedMotivation } from './composer';

export interface MotivationReferenceComparison {
  referenceId: string;
  matchedAnchors: string[];
  missingAnchors: string[];
  matchedCoverage: number;
}

export function compareMotivationToReference(input: {
  referenceId: string;
  motivation: ComposedMotivation;
  anchors: string[];
}): MotivationReferenceComparison {
  const lowerText = input.motivation.text.toLowerCase();
  const matchedAnchors = input.anchors.filter((anchor) =>
    lowerText.includes(anchor.toLowerCase())
  );
  const missingAnchors = input.anchors.filter(
    (anchor) => !matchedAnchors.includes(anchor)
  );

  return {
    referenceId: input.referenceId,
    matchedAnchors,
    missingAnchors,
    matchedCoverage:
      input.anchors.length === 0 ? 1 : matchedAnchors.length / input.anchors.length,
  };
}
