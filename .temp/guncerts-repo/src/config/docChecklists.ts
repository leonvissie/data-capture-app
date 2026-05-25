import { Application, Document, Profile } from '../data/types';

export type DocRequirement = {
  key: string;                                     // stable id
  label: string;                                   // UI label
  kind: Document['kind'];                          // Document.kind
  help: string;                                    // help popup text
  required: boolean | ((p: Profile | null, a: Partial<Application>) => boolean);
  multiple?: boolean;
};

export const checklistByForm: Record<Application['form'], DocRequirement[]> = {
  '517': [
    {
      key: 'ID_DOC',
      label: 'Identity document (ID or passport)',
      kind: 'ID_CARD',
      help: 'Photos of both sides of your South African ID card.',
      required: true,
    },
    {
      key: 'ID_DOC',
      label: 'South African ID Book',
      kind: 'ID_BOOK',
      help: 'Photo of the South African ID book picture page containing your ID number.',
      required: true,
    },
    {
      key: 'ID_DOC',
      label: 'A valid passport',
      kind: 'PASSPORT',
      help: 'Photo of your passport page showing your picture and passport number.',
      required: true,
    },
    {
      key: 'PROOF_ADDRESS',
      label: 'Proof of address',
      kind: 'PROOF_OF_ADDRESS',
      help: 'Utility bill, bank statement, or SARS/municipal letter (within the last 3 months).',
      required: true,
    },
    {
      key: 'COMP_CERT',
      label: 'Training certificate',
      kind: 'COMPETENCY_CERT',
      help: 'Upload your accredited training certificate details for SAPS 517.',
      required: true,
    },
  ],
  '517g': [
    // {
    //   key: 'ID_DOC',
    //   label: 'Identity document (ID or passport)',
    //   kind: 'ID',
    //   help: 'Photo of your South African ID card/book, or passport if you applied with a passport.',
    //   required: true,
    // },
    {
      key: 'ID_DOC',
      label: 'Identity document (ID or passport)',
      kind: 'ID_CARD',
      help: 'Photos of both sides of your South African ID card.',
      required: true,
    },
    {
      key: 'ID_DOC',
      label: 'South African ID Book',
      kind: 'ID_BOOK',
      help: 'Photo of the South African ID book picture page containing your ID number.',
      required: true,
    },
    {
      key: 'ID_DOC',
      label: 'A valid passport',
      kind: 'PASSPORT',
      help: 'Photo of your passport page showing your picture and passport number.',
      required: true,
    },
    {
      key: 'PROOF_ADDRESS',
      label: 'Proof of address',
      kind: 'PROOF_OF_ADDRESS',
      help: 'Utility bill, bank statement, or SARS/municipal letter (within the last 3 months).',
      required: true,
    },
    {
      key: 'COMP_CERT',
      label: 'Competency certificate',
      kind: 'COMPETENCY_CERT',
      help: 'Your SAPS competency certificate used for this renewal.',
      required: true,
    },
  ],

  '518a': [
    // {
    //   key: 'ID_DOC',
    //   label: 'Identity document (ID or passport)',
    //   kind: 'ID',
    //   help: 'Photo of your South African ID card/book, or passport if you applied with a passport.',
    //   required: true,
    // },
    {
      key: 'ID_DOC',
      label: 'Identity document (ID or passport)',
      kind: 'ID_CARD',
      help: 'Photos of both sides of your South African ID card.',
      required: true,
    },
    {
      key: 'ID_DOC',
      label: 'South African ID Book',
      kind: 'ID_BOOK',
      help: 'Photo of the South African ID book picture page containing your ID number.',
      required: true,
    },
    {
      key: 'ID_DOC',
      label: 'A valid passport',
      kind: 'PASSPORT',
      help: 'Photo of your passport page showing your picture and passport number.',
      required: true,
    },
    {
      key: 'PROOF_ADDRESS',
      label: 'Proof of address',
      kind: 'PROOF_OF_ADDRESS',
      help: 'Utility bill, bank statement, or SARS/municipal letter (within the last 3 months).',
      required: true,
    },
    {
      key: 'FIREARM_LICENCE',
      label: 'Existing firearm licence(s)',
      kind: 'FIREARM_LICENCE',
      help: 'Photo/scan of each current firearm licence you are renewing.',
      required: true,
      multiple: true,
    },
  ],
};
