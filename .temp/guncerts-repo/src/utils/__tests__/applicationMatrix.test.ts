import { describe, expect, test } from '@jest/globals';
import { appConfig } from '../../config/appConfig';
import {
  applicationMatrixToCsv,
  evaluateApplicationMatrix,
  evaluateApplicationMatrixScenario,
} from '../../testing/applicationMatrix';
import { SAMPLE_APPLICATION_MATRIX_SCENARIOS } from '../../testing/applicationMatrixSamples';

describe('application matrix generator', () => {
  test('builds the user example as warnings without blocking payment', () => {
    const result = evaluateApplicationMatrixScenario(SAMPLE_APPLICATION_MATRIX_SCENARIOS[0]);
    const issueKeys = result.rows.map((row) => row.issueKey);

    expect(issueKeys).toEqual(
      expect.arrayContaining([
        'warning:proof_of_address_age',
        'warning:membership_submission_window',
        'warning:membership_document_window',
      ]),
    );
    expect(result.blocksFinalise).toBe(false);
    expect(result.blocksPayment).toBe(false);
  });

  test('uses policy membership requirement dynamically for section 16 518a cases', () => {
    const result = evaluateApplicationMatrixScenario(SAMPLE_APPLICATION_MATRIX_SCENARIOS[1]);

    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issueKey: 'missing:firearm_association_membership',
          blocksFinalise: true,
          blocksPayment: true,
        }),
      ]),
    );
  });

  test('blocks finalise and payment for expired membership states', () => {
    const membershipExpired = evaluateApplicationMatrixScenario(SAMPLE_APPLICATION_MATRIX_SCENARIOS[2]);
    const membershipDocumentExpired = evaluateApplicationMatrixScenario(SAMPLE_APPLICATION_MATRIX_SCENARIOS[3]);

    expect(membershipExpired.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issueKey: 'warning:membership_expired',
          blocksFinalise: true,
          blocksPayment: true,
        }),
      ]),
    );
    expect(membershipDocumentExpired.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issueKey: 'warning:membership_document_expired',
          blocksFinalise: true,
          blocksPayment: true,
        }),
      ]),
    );
  });

  test('uses configured freshness thresholds in output copy', () => {
    const result = evaluateApplicationMatrixScenario(SAMPLE_APPLICATION_MATRIX_SCENARIOS[0]);
    const membershipDocWarning = result.rows.find(
      (row) => row.issueKey === 'warning:membership_document_window',
    );

    expect(membershipDocWarning?.message).toContain(
      `more than ${appConfig.documentFreshness.associationLetter.warningAgeDays} days old`,
    );
  });

  test('emits csv rows for excel import', () => {
    const csv = applicationMatrixToCsv(evaluateApplicationMatrix(SAMPLE_APPLICATION_MATRIX_SCENARIOS));
    const lines = csv.split('\n');

    expect(lines[0]).toBe(
      'profileId,profileLabel,form,issueType,issueKey,screen,anchor,message,blocksFinalise,blocksPayment',
    );
    expect(csv).toContain('profile-01,518a optional membership warnings,518a,warning,warning:membership_submission_window');
    expect(csv).toContain('profile-06,517g clean baseline,517g,info,info:clear');
  });
});
