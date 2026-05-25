export type PdfProgressUpdate = {
  label: string;
  current?: number;
  total?: number;
};

export const flushPdfProgressFrame = async () => {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
      return;
    }
    setTimeout(resolve, 0);
  });
};

type PdfProgressTrackerOptions = {
  label: string;
  onProgress?: (progress: PdfProgressUpdate) => void;
};

type ProgressSegment = {
  current: number;
  total: number;
};

export function createPdfProgressTracker(options: PdfProgressTrackerOptions) {
  const segments = new Map<string, ProgressSegment>();

  const ensureSegment = (key: string) => {
    if (!segments.has(key)) {
      segments.set(key, { current: 0, total: 0 });
    }
    return segments.get(key)!;
  };

  const emit = () => {
    if (!options.onProgress) return;
    let current = 0;
    let total = 0;
    let hasKnownTotal = false;

    segments.forEach((segment) => {
      current += segment.current;
      total += segment.total;
      if (segment.total > 0) {
        hasKnownTotal = true;
      }
    });

    options.onProgress({
      label: options.label,
      ...(hasKnownTotal ? { current, total } : {}),
    });
  };

  return {
    setSegmentTotal(key: string, total: number) {
      const segment = ensureSegment(key);
      segment.total = Math.max(0, total);
      segment.current = Math.min(segment.current, segment.total);
      emit();
    },
    setSegmentCurrent(key: string, current: number) {
      const segment = ensureSegment(key);
      const nextCurrent = Math.max(0, current);
      segment.current = segment.total > 0 ? Math.min(nextCurrent, segment.total) : nextCurrent;
      emit();
    },
    completeSegment(key: string) {
      const segment = ensureSegment(key);
      segment.current = segment.total;
      emit();
    },
    emit,
  };
}
