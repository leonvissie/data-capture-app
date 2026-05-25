import { describe, expect, test } from '@jest/globals';

import type { Application, ApplicationDocState } from '../../../data/types';
import {
  resolveEvidence,
  resolveEvidenceFromApplication,
  resolveEvidenceFromDocState,
} from '../evidenceResolver';

function makeDocState(): ApplicationDocState {
  return {
    applicationId: 'app-1',
    policy: {
      form: '518a',
      version: 'test',
    },
    requirements: [
      {
        code: 'COMPETENCY_CERT',
        required: true,
        requireUpload: true,
        isSupportingDocument: true,
        isChecklistItem: true,
        documentKinds: [{ kind: 'COMPETENCY_CERT', numberOfSides: 1 }],
      },
      {
        code: 'ASSOCIATION_LETTER',
        required: true,
        requireUpload: true,
        isSupportingDocument: true,
        isChecklistItem: true,
        documentKinds: [{ kind: 'ASSOCIATION_LETTER', numberOfSides: 1 }],
      },
      {
        code: 'DEDICATED_SPORT_CERT',
        required: true,
        requireUpload: true,
        isSupportingDocument: true,
        isChecklistItem: true,
        documentKinds: [{ kind: 'DEDICATED_SPORT_CERT', numberOfSides: 1 }],
      },
      {
        code: 'FIREARM_ENDORSEMENT',
        required: false,
        requireUpload: false,
        isSupportingDocument: true,
        isChecklistItem: true,
        documentKinds: [{ kind: 'FIREARM_ENDORSEMENT', numberOfSides: 1 }],
      },
      {
        code: 'SAFES',
        required: true,
        requireUpload: true,
        isSupportingDocument: true,
        isChecklistItem: true,
        documentKinds: [{ kind: 'SAFE', numberOfSides: 1 }],
      },
    ],
    documents: [
      {
        requirementCode: 'COMPETENCY_CERT',
        kind: 'COMPETENCY_CERT',
        documentId: 'doc-competency',
        source: { type: 'Application' },
      },
      {
        requirementCode: 'ASSOCIATION_LETTER',
        kind: 'ASSOCIATION_LETTER',
        documentId: 'doc-membership',
        source: { type: 'Membership', id: 'membership-1' },
      },
      {
        requirementCode: 'DEDICATED_SPORT_CERT',
        kind: 'DEDICATED_SPORT_CERT',
        documentId: 'doc-dedicated',
        source: { type: 'Membership', id: 'membership-1' },
      },
      {
        requirementCode: 'FIREARM_ENDORSEMENT',
        kind: 'FIREARM_ENDORSEMENT',
        documentId: 'doc-endorsement',
        source: { type: 'Membership', id: 'membership-1' },
      },
      {
        requirementCode: 'SAFES',
        kind: 'SAFE',
        documentId: 'doc-safe',
        source: { type: 'Safe', id: 'safe-1' },
      },
    ],
  };
}

describe('evidenceResolver', () => {
  test('derives motivation evidence keys from doc-state requirements and documents', () => {
    const result = resolveEvidenceFromDocState(makeDocState());

    expect(result.evidenceKeys).toEqual(
      expect.arrayContaining([
        'association_membership',
        'competency_certificate',
        'dedicated_status',
        'firearm_endorsement',
        'safe_photos',
      ]),
    );
    expect(result.evidenceKeys).not.toContain('activity_report');
    expect(result.satisfiedRequirementCodes).toEqual(
      expect.arrayContaining([
        'ASSOCIATION_LETTER',
        'COMPETENCY_CERT',
        'DEDICATED_SPORT_CERT',
        'FIREARM_ENDORSEMENT',
        'SAFES',
      ]),
    );
    expect(result.matchedDocumentsByRequirement.SAFES).toEqual(['doc-safe']);
    expect(result.missingRequiredRequirementCodes).toEqual([]);
  });

  test('uses application policy requirements when resolving a real application', () => {
    const application: Application = {
      id: 'app-518a',
      type: 'Application',
      form: '518a',
      status: 'draft',
      applicantProfileId: 'profile-1',
      createdAt: '2026-04-09T00:00:00.000Z',
      updatedAt: '2026-04-09T00:00:00.000Z',
      schemaVersion: 1,
      version: 1,
      docs: {
        applicationId: 'app-518a',
        policy: { form: '518a', version: 'test' },
        requirements: [],
        documents: [
          {
            requirementCode: 'COMPETENCY_CERT',
            kind: 'COMPETENCY_CERT',
            documentId: 'doc-1',
            source: { type: 'Application' },
          },
          {
            requirementCode: 'FIREARM_LICENCE',
            kind: 'FIREARM_LICENCE',
            documentId: 'doc-2',
            source: { type: 'Firearm', id: 'firearm-1' },
          },
          {
            requirementCode: 'SAFES',
            kind: 'SAFE',
            documentId: 'doc-3',
            source: { type: 'Safe', id: 'safe-1' },
          },
        ],
      },
    };

    const result = resolveEvidenceFromApplication(application);

    expect(result.evidenceKeys).toEqual(
      expect.arrayContaining([
        'competency_certificate',
        'existing_licence_copy',
        'safe_photos',
      ]),
    );
    expect(result.missingRequiredRequirementCodes).toEqual(
      expect.arrayContaining(['ID_DOC', 'PROOF_ADDRESS']),
    );
  });

  test('supports the generic resolver entrypoint', () => {
    const docState = makeDocState();
    const result = resolveEvidence({ docState });

    expect(result.matchedDocumentKindsByRequirement.ASSOCIATION_LETTER).toEqual([
      'ASSOCIATION_LETTER',
    ]);
  });
});
