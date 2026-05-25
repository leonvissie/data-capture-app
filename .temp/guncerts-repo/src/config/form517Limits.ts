import policy517 from '../policy/517.json';

type CaseDetailLengthConfig = {
  policeStation?: number;
  caseNumber?: number;
  chargeOrOffence?: number;
  outcome?: number;
  circumstances?: number;
  firearmDetails?: number;
  dateFrom?: number;
  period?: number;
};

type PolicyFieldLengthConfig = {
  h2TrainingInstitutionName?: number;
  h3TrainingCertificateSerial?: number;
  h4TrainingCertificateDateIssued?: number;
  h5CaseDetails?: CaseDetailLengthConfig;
  h6CaseDetails?: CaseDetailLengthConfig;
  h7CaseDetails?: CaseDetailLengthConfig;
  h8CaseDetails?: CaseDetailLengthConfig;
  h9CaseDetails?: CaseDetailLengthConfig;
  h10CaseDetails?: CaseDetailLengthConfig;
  h11ToH16Details?: number;
};

const policyFieldLength = (policy517 as { fieldLength?: PolicyFieldLengthConfig }).fieldLength ?? {};

export const FORM517_LIMITS = {
  shortSpecify: 80,
  detailLong: 480,
  h17OtherReasonText: 40,
  h17FullDetails: 200,
  h2TrainingInstitutionName: policyFieldLength.h2TrainingInstitutionName ?? 60,
  h3TrainingCertificateSerial: policyFieldLength.h3TrainingCertificateSerial ?? 60,
  h4TrainingCertificateDateIssued: policyFieldLength.h4TrainingCertificateDateIssued ?? 60,
  h11ToH16Details: policyFieldLength.h11ToH16Details ?? 80,
  h5CaseDetails: {
    policeStation: policyFieldLength.h5CaseDetails?.policeStation ?? 30,
    caseNumber: policyFieldLength.h5CaseDetails?.caseNumber ?? 20,
    chargeOrOffence: policyFieldLength.h5CaseDetails?.chargeOrOffence ?? 60,
    outcome: policyFieldLength.h5CaseDetails?.outcome ?? 60,
  },
  h6CaseDetails: {
    policeStation: policyFieldLength.h6CaseDetails?.policeStation ?? 30,
    caseNumber: policyFieldLength.h6CaseDetails?.caseNumber ?? 20,
    chargeOrOffence: policyFieldLength.h6CaseDetails?.chargeOrOffence ?? 60,
  },
  h7CaseDetails: {
    policeStation: policyFieldLength.h7CaseDetails?.policeStation ?? 30,
    caseNumber: policyFieldLength.h7CaseDetails?.caseNumber ?? 20,
    circumstances: policyFieldLength.h7CaseDetails?.circumstances ?? 60,
    firearmDetails: policyFieldLength.h7CaseDetails?.firearmDetails ?? 60,
  },
  h8CaseDetails: {
    policeStation: policyFieldLength.h8CaseDetails?.policeStation ?? 30,
    caseNumber: policyFieldLength.h8CaseDetails?.caseNumber ?? 20,
    chargeOrOffence: policyFieldLength.h8CaseDetails?.chargeOrOffence ?? 30,
    outcome: policyFieldLength.h8CaseDetails?.outcome ?? 20,
  },
  h9CaseDetails: {
    policeStation: policyFieldLength.h9CaseDetails?.policeStation ?? 30,
    caseNumber: policyFieldLength.h9CaseDetails?.caseNumber ?? 20,
    chargeOrOffence: policyFieldLength.h9CaseDetails?.chargeOrOffence ?? 60,
    dateFrom: policyFieldLength.h9CaseDetails?.dateFrom ?? 30,
    period: policyFieldLength.h9CaseDetails?.period ?? 20,
  },
  h10CaseDetails: {
    policeStation: policyFieldLength.h10CaseDetails?.policeStation ?? 30,
    caseNumber: policyFieldLength.h10CaseDetails?.caseNumber ?? 20,
    circumstances: policyFieldLength.h10CaseDetails?.circumstances ?? 30,
    outcome: policyFieldLength.h10CaseDetails?.outcome ?? 20,
  },
} as const;
