import type {
  MotivationSentenceBank,
  OverlaySentenceBank,
  SectionSentenceBank,
} from './sentenceBank.types';
import { SHARED_SENTENCE_BANK } from './sentenceBank.shared';
import { S13_SENTENCE_BANK } from './sentenceBank.s13';
import { S15_SENTENCE_BANK } from './sentenceBank.s15';
import { S16_SENTENCE_BANK } from './sentenceBank.s16';
import { OVERLAY_SENTENCE_BANK } from './sentenceBank.overlays';

function mergeSections(...banks: MotivationSentenceBank[]): SectionSentenceBank[] {
  const bySection = new Map<string, SectionSentenceBank>();

  for (const bank of banks) {
    for (const section of bank.sections) {
      const existing = bySection.get(section.sectionId);
      if (!existing) {
        bySection.set(section.sectionId, {
          sectionId: section.sectionId,
          sectionKey: section.sectionKey,
          templates: [...section.templates],
        });
        continue;
      }

      existing.templates.push(...section.templates);
    }
  }

  return Array.from(bySection.values()).sort((a, b) =>
    a.sectionId.localeCompare(b.sectionId, undefined, { numeric: true })
  );
}

function mergeOverlays(...banks: MotivationSentenceBank[]): OverlaySentenceBank[] {
  const byOverlay = new Map<string, OverlaySentenceBank>();

  for (const bank of banks) {
    for (const overlay of bank.overlays ?? []) {
      const existing = byOverlay.get(overlay.overlay);
      if (!existing) {
        byOverlay.set(overlay.overlay, {
          overlay: overlay.overlay,
          templates: [...overlay.templates],
        });
        continue;
      }

      existing.templates.push(...overlay.templates);
    }
  }

  return Array.from(byOverlay.values());
}

export const SENTENCE_BANK: MotivationSentenceBank = {
  version: 'v1',
  sections: mergeSections(
    SHARED_SENTENCE_BANK,
    S13_SENTENCE_BANK,
    S15_SENTENCE_BANK,
    S16_SENTENCE_BANK,
    OVERLAY_SENTENCE_BANK
  ),
  overlays: mergeOverlays(
    SHARED_SENTENCE_BANK,
    S13_SENTENCE_BANK,
    S15_SENTENCE_BANK,
    S16_SENTENCE_BANK,
    OVERLAY_SENTENCE_BANK
  ),
};

export {
  SHARED_SENTENCE_BANK,
  S13_SENTENCE_BANK,
  S15_SENTENCE_BANK,
  S16_SENTENCE_BANK,
  OVERLAY_SENTENCE_BANK,
};
