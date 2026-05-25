import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { applicationMatrixToCsv, evaluateApplicationMatrix } from '../../testing/applicationMatrix';
import { SAMPLE_APPLICATION_MATRIX_SCENARIOS } from '../../testing/applicationMatrixSamples';

describe('application matrix csv export', () => {
  test('writes the sample application matrix csv to .temp', () => {
    const csv = applicationMatrixToCsv(evaluateApplicationMatrix(SAMPLE_APPLICATION_MATRIX_SCENARIOS));
    const outputDir = path.resolve(__dirname, '../../../../../.temp/testing');
    const outputFile = path.join(outputDir, 'application-matrix.csv');

    mkdirSync(outputDir, { recursive: true });
    writeFileSync(outputFile, csv, 'utf8');

    expect(csv.startsWith('profileId,profileLabel,form,issueType,issueKey')).toBe(true);
  });
});
