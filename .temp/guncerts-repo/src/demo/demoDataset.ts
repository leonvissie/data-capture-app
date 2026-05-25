import type {
  Address,
  CompetencyCategory,
  SupportingStatementSlot,
  UUID,
} from '../data/types';
import type { DemoFileKey } from './demoFileManifest';

export const DEMO_DATASET_VERSION = 2;

export const DEMO_IDS = {
  profile: 'demo_profile_01' as UUID,
  firearm: 'demo_firearm_01' as UUID,
  competencyCertificate: 'demo_comp_cert_01' as UUID,
  proficiency: 'demo_proficiency_01' as UUID,
  safe: 'demo_safe_01' as UUID,
  supportingStatement: 'demo_supporting_01' as UUID,
  documents: {
    idCardFront: 'demo_doc_id_card_front_01' as UUID,
    idCardBack: 'demo_doc_id_card_back_01' as UUID,
    proofOfAddress: 'demo_doc_proof_of_address_01' as UUID,
    firearmLicenceFront: 'demo_doc_firearm_licence_front_01' as UUID,
    firearmLicenceBack: 'demo_doc_firearm_licence_back_01' as UUID,
    competencyCert: 'demo_doc_competency_cert_01' as UUID,
    proficiencyHandgun: 'demo_doc_proficiency_handgun_01' as UUID,
    resultsKnowledge: 'demo_doc_results_knowledge_01' as UUID,
    resultsHandleUse1: 'demo_doc_results_handle_use_1_01' as UUID,
    safeClosed: 'demo_doc_safe_closed_01' as UUID,
    safeOpen: 'demo_doc_safe_open_01' as UUID,
    safeBolts: 'demo_doc_safe_bolts_01' as UUID,
  },
} as const;

export type DemoProfileSeed = {
  id: UUID;
  givenNames: string;
  surname: string;
  initials: string;
  idType: 'ID_CARD';
  idNumber: string;
  email: string;
  mobile: string;
  address: Address;
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widow' | 'widower' | 'other';
  employment?: {
    tradeOrProfession?: string;
    selfEmployedDetail?: string;
    employerName?: string;
    employerAddress?: Address;
  };
  references?: Array<{
    relationshipCategory?: 'spouse';
    relationshipDetail?: string;
    type?: string;
    fullNames?: string;
    idNumber?: string;
    mobile?: string;
  }>;
  idDocFrontId: UUID;
  idDocBackId: UUID;
};

export type DemoDocumentSeed = {
  id: UUID;
  fileKey: DemoFileKey;
  name: string;
  parentType: 'Profile' | 'Firearm' | 'CompetencyCertificate' | 'Proficiency' | 'Safe';
  parentId: UUID;
};

export type DemoProficiencySeed = {
  id: UUID;
  trainingProviderName: string;
  holderProfileId: UUID;
  proficiencyDocumentIds: Array<{
    kind: 'PROFICIENCY_HANDGUN' | 'STATEMENT_OF_RESULTS_KNOWLEDGE' | 'STATEMENT_OF_RESULTS_HANDLE_USE_1';
    documentId: UUID;
    issuedAt?: string;
    serialNumber?: string;
    categories?: CompetencyCategory[];
  }>;
};

export type DemoFirearmSeed = {
  id: UUID;
  firearmType: CompetencyCategory;
  firearmAction: 'Semi-automatic' | 'Automatic' | 'Manual' | 'Other';
  make: string;
  model: string;
  calibre: string;
  firearmSerialNumber: string;
  licenseNumber: string;
  section: string;
  validFrom: string;
  validTo: string;
  firearmLicenceFrontDocId: UUID;
  firearmLicenceBackDocId: UUID;
  isDemoData: boolean;
};

export type DemoCompetencyCertificateSeed = {
  id: UUID;
  categories: CompetencyCategory[];
  licenceTypes?: string[];
  certificateNumber: string;
  trainingProvider: string;
  issuedAt: string;
  expiresAt: string;
  certificateDocumentId: UUID;
  isDemoData: boolean;
};

export type DemoSafeSeed = {
  id: UUID;
  safeName: string;
  make: string;
  notes?: string;
  photoDocumentIds: UUID[];
};


export const DEMO_PROFILE: DemoProfileSeed = {
  id: DEMO_IDS.profile,
  givenNames: 'Daniel Martin',
  surname: 'Van Rensburg',
  initials: 'DM',
  idType: 'ID_CARD',
  idNumber: '8206155678084',
  email: 'demo.reviewer@guncerts.local',
  mobile: '0812341234',
  maritalStatus: 'married',
  employment: {
    tradeOrProfession: 'Project Manager',
    selfEmployedDetail: 'Not applicable',
    employerName: 'Aurora Digital Solutions',
    employerAddress: {
      singleLine: '28 Protea Office Park, Block B, Suite 14, Centurion',
      postCode: '0157',
      line1: '28 Protea Office Park',
      line2: 'Block B, Suite 14',
      suburb: '',
      city: 'Centurion',
      province: '',
      homeType: undefined,
      securityMeasures: [],
    },
  },
  references: [
    {
      relationshipCategory: 'spouse',
      relationshipDetail: 'Wife',
      type: 'Wife',
      fullNames: 'Naledi Maria van der Merwe',
      idNumber: '9002151234082',
      mobile: '0824567890',
    },
  ],
  address: {
    singleLine: 'Flat 56 FlatNumber, 123 Streetwise Lane, RandomSuburb, SomeCity',
    postCode: '0088',
    line1: 'Flat 56 FlatNumber',
    line2: '123 Streetwise Lane',
    suburb: 'RandomSuburb',
    city: 'SomeCity',
    province: '',
    homeType: undefined,
    securityMeasures: [],
  },
  idDocFrontId: DEMO_IDS.documents.idCardFront,
  idDocBackId: DEMO_IDS.documents.idCardBack,
};

export const DEMO_DOCUMENTS: DemoDocumentSeed[] = [
  {
    id: DEMO_IDS.documents.idCardFront,
    fileKey: 'id_card_front',
    name: 'ID Front',
    parentType: 'Profile',
    parentId: DEMO_IDS.profile,
  },
  {
    id: DEMO_IDS.documents.idCardBack,
    fileKey: 'id_card_back',
    name: 'ID Back',
    parentType: 'Profile',
    parentId: DEMO_IDS.profile,
  },
  {
    id: DEMO_IDS.documents.proofOfAddress,
    fileKey: 'proof_of_address',
    name: 'Proof of residential address',
    parentType: 'Profile',
    parentId: DEMO_IDS.profile,
  },
  {
    id: DEMO_IDS.documents.firearmLicenceFront,
    fileKey: 'firearm_licence_front',
    name: 'Firearm licence (front)',
    parentType: 'Firearm',
    parentId: DEMO_IDS.firearm,
  },
  {
    id: DEMO_IDS.documents.firearmLicenceBack,
    fileKey: 'firearm_licence_back',
    name: 'Firearm licence (back)',
    parentType: 'Firearm',
    parentId: DEMO_IDS.firearm,
  },
  {
    id: DEMO_IDS.documents.competencyCert,
    fileKey: 'competency_cert',
    name: 'Competency certificate',
    parentType: 'CompetencyCertificate',
    parentId: DEMO_IDS.competencyCertificate,
  },
  {
    id: DEMO_IDS.documents.proficiencyHandgun,
    fileKey: 'prof_handgun',
    name: 'Proficiency - Handgun',
    parentType: 'Proficiency',
    parentId: DEMO_IDS.proficiency,
  },
  {
    id: DEMO_IDS.documents.resultsKnowledge,
    fileKey: 'results_act',
    name: 'Statement of Results - Knowledge of Act',
    parentType: 'Proficiency',
    parentId: DEMO_IDS.proficiency,
  },
  {
    id: DEMO_IDS.documents.resultsHandleUse1,
    fileKey: 'results_handgun',
    name: 'Statement of Results - Handle and use 1',
    parentType: 'Proficiency',
    parentId: DEMO_IDS.proficiency,
  },
  {
    id: DEMO_IDS.documents.safeClosed,
    fileKey: 'safe_closed',
    name: 'Safe photo - closed',
    parentType: 'Safe',
    parentId: DEMO_IDS.safe,
  },
  {
    id: DEMO_IDS.documents.safeOpen,
    fileKey: 'safe_open',
    name: 'Safe photo - open',
    parentType: 'Safe',
    parentId: DEMO_IDS.safe,
  },
  {
    id: DEMO_IDS.documents.safeBolts,
    fileKey: 'safe_bolts',
    name: 'Safe photo - bolts',
    parentType: 'Safe',
    parentId: DEMO_IDS.safe,
  },
];

export const DEMO_FIREARM: DemoFirearmSeed = {
  id: DEMO_IDS.firearm,
  firearmType: 'Handgun',
  firearmAction: 'Semi-automatic',
  make: 'GLOCK',
  model: '17',
  calibre: '9MM PAR (9X19MM)',
  firearmSerialNumber: 'ABC123',
  licenseNumber: 'L123456789',
  section: 'Section 13',
  validFrom: '2022-03-01',
  validTo: '2027-03-01',
  firearmLicenceFrontDocId: DEMO_IDS.documents.firearmLicenceFront,
  firearmLicenceBackDocId: DEMO_IDS.documents.firearmLicenceBack,
  isDemoData: true,
};

export const DEMO_COMPETENCY_CERTIFICATE: DemoCompetencyCertificateSeed = {
  id: DEMO_IDS.competencyCertificate,
  categories: ['Handgun', 'Shotgun', 'Rifle'],
  licenceTypes: ['1.1'],
  certificateNumber: 'T123456789',
  trainingProvider: '',
  issuedAt: '2022-01-01',
  expiresAt: '2027-01-01',
  certificateDocumentId: DEMO_IDS.documents.competencyCert,
  isDemoData: true,
};

export const DEMO_PROFICIENCY: DemoProficiencySeed = {
  id: DEMO_IDS.proficiency,
  trainingProviderName: 'Demo Training Inc',
  holderProfileId: DEMO_IDS.profile,
  proficiencyDocumentIds: [
    {
      kind: 'PROFICIENCY_HANDGUN',
      documentId: DEMO_IDS.documents.proficiencyHandgun,
      issuedAt: (() => {
        const d = new Date();
        d.setMonth(d.getMonth());
        d.setDate(15);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })(),
      serialNumber: 'PROF-HG-001',
    },
    {
      kind: 'STATEMENT_OF_RESULTS_KNOWLEDGE',
      documentId: DEMO_IDS.documents.resultsKnowledge,
      issuedAt: (() => {
        const d = new Date();
        d.setMonth(d.getMonth());
        d.setDate(16);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })(),
      serialNumber: 'SOR-KNOW-001',
    },
    {
      kind: 'STATEMENT_OF_RESULTS_HANDLE_USE_1',
      documentId: DEMO_IDS.documents.resultsHandleUse1,
      issuedAt: (() => {
        const d = new Date();
        d.setMonth(d.getMonth());
        d.setDate(17);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })(),
      serialNumber: 'SOR-HU1-001',
      categories: ['Handgun'],
    },
  ],
};

export const DEMO_SAFE: DemoSafeSeed = {
  id: DEMO_IDS.safe,
  safeName: 'Main bedroom safe',
  make: 'SABS Safe Co.',
  notes: 'Roll bolt floor-mounted safe for demo review.',
  photoDocumentIds: [
    DEMO_IDS.documents.safeClosed,
    DEMO_IDS.documents.safeOpen,
    DEMO_IDS.documents.safeBolts,
  ],
};
