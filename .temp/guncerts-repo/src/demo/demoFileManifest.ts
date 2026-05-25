import type { DocumentKind, IdentityDocumentSide, SafePhotoCategory } from '../data/types';

export type DemoFileKey =
  | 'id_card_front'
  | 'id_card_back'
  | 'proof_of_address'
  | 'firearm_licence_front'
  | 'firearm_licence_back'
  | 'competency_cert'
  | 'prof_handgun'
  | 'results_act'
  | 'results_handgun'
  | 'safe_closed'
  | 'safe_open'
  | 'safe_bolts';

export type DemoFileManifestEntry = {
  fileName: string;
  kind: DocumentKind;
  mime: string;
  pages: number;
  identityDocumentSide?: IdentityDocumentSide;
  safeCategory?: SafePhotoCategory;
};

export const DEMO_FILE_MANIFEST: Record<DemoFileKey, DemoFileManifestEntry> = {
  id_card_front: {
    fileName: 'id_card_front.png',
    kind: 'ID_CARD',
    mime: 'image/png',
    pages: 1,
    identityDocumentSide: 'front',
  },
  id_card_back: {
    fileName: 'id_card_back.png',
    kind: 'ID_CARD',
    mime: 'image/png',
    pages: 1,
    identityDocumentSide: 'back',
  },
  proof_of_address: {
    fileName: 'proof_of_address.png',
    kind: 'PROOF_OF_ADDRESS',
    mime: 'image/png',
    pages: 1,
  },
  firearm_licence_front: {
    fileName: 'firearm_licence_front.png',
    kind: 'FIREARM_LICENCE',
    mime: 'image/png',
    pages: 1,
  },
  firearm_licence_back: {
    fileName: 'firearm_licence_back.png',
    kind: 'FIREARM_LICENCE',
    mime: 'image/png',
    pages: 1,
  },
  competency_cert: {
    fileName: 'competency_cert.png',
    kind: 'COMPETENCY_CERT',
    mime: 'image/png',
    pages: 1,
  },
  prof_handgun: {
    fileName: 'prof_handgun.png',
    kind: 'PROFICIENCY_HANDGUN',
    mime: 'image/png',
    pages: 1,
  },
  results_act: {
    fileName: 'results_act.png',
    kind: 'STATEMENT_OF_RESULTS_KNOWLEDGE',
    mime: 'image/png',
    pages: 1,
  },
  results_handgun: {
    fileName: 'results_handgun.png',
    kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_1',
    mime: 'image/png',
    pages: 1,
  },
  safe_closed: {
    fileName: 'safe_closed.png',
    kind: 'SAFE',
    mime: 'image/png',
    pages: 1,
    safeCategory: 'CLOSED',
  },
  safe_open: {
    fileName: 'safe_open.png',
    kind: 'SAFE',
    mime: 'image/png',
    pages: 1,
    safeCategory: 'OPEN',
  },
  safe_bolts: {
    fileName: 'safe_bolts.png',
    kind: 'SAFE',
    mime: 'image/png',
    pages: 1,
    safeCategory: 'BOLTS',
  },
};

export const DEMO_FILE_KEYS = Object.keys(DEMO_FILE_MANIFEST) as DemoFileKey[];
