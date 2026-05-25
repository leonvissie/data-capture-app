export type TourStepPlacement = 'auto' | 'top' | 'bottom';

export type TourStep = {
  id: string;
  title: string;
  body: string;
  targetId?: string;
  placement?: TourStepPlacement;
};

export type TourTargetLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TourPrefs = {
  isFirstLoad: boolean;
  hasCompleted: boolean;
  savedStepIndex: number;
};
