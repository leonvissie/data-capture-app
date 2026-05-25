import { File as FSFile } from 'expo-file-system/next';
import * as FileSystem from 'expo-file-system/legacy';
import policy517 from '../../policy/517.json';
import { ApplicationPdfContext, ApplicationPdfGenerator, ApplicationPdfResult } from './types';
import { resolveFieldMapAsset, resolvePdfAssetModule } from './assets';
import { FieldMap, renderTemplatePdf } from '../templates';
import { ensurePdfWorkspace, pdfPathFor } from '../storage';
import { ensureRepeatedWatermark } from '../watermark';
import { Application, CompellingReason, CompetencyType, Profile, TrainingType } from '../../data/types';
import {
  applyAddressWithPostalFallback,
  applyProfileDefaults,
  collectStoredFormData,
  deriveCommonFields,
  hasAnyMeaningfulData,
  normalizeWhitespace,
  splitAddressLines,
} from './common';

type PolicyJson = {
  pdf?: string | null;
  pdfFieldMap?: string | null;
  addressLength?: { line1Split?: number; maxLength?: number };
};

const policy = policy517 as PolicyJson;

const COMPETENCY_MAP: Record<CompetencyType, string> = {
  Handgun: 'd4Handgun',
  Rifle: 'd4Rifle',
  Shotgun: 'd4Shotgun',
  HandMachineCarbine: 'd4HandMachineCarbine',
};

const TRAINING_TYPE_MAP: Record<TrainingType, string> = {
  Pistol: 'g3Pistol',
  Revolver: 'g3Revolver',
  Rifle: 'g3Rifle',
  Shotgun: 'g3Shotgun',
  Other: 'g3Other',
};

const MARITAL_STATUS_MAP: Record<string, string> = {
  single: 'e22Single',
  married: 'e22Married',
  divorced: 'e22Divorced',
  widow: 'e22Widow',
  widower: 'e22Widower',
  other: 'e22Other',
};

const COMPELLING_REASON_MAP: Record<CompellingReason, string> = {
  ConductBusiness: 'h17ConductBusiness',
  GainfullyEmployed: 'h17GainfullyEmployed',
  DedicatedHunter: 'h17DedicatedHunter',
  DedicatedSportPerson: 'h17DedicatedSportPerson',
  PrivateCollector: 'h17PrivateCollector',
  PublicCollector: 'h17PublicCollector',
  Other: 'h17Other',
};

function toX(value: unknown): string {
  return value ? 'X' : '';
}

function normalizeDateIso(value?: string): string {
  const text = normalizeWhitespace(value);
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const digits = text.replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return '';
}

function normalizeDateList(value?: string): string {
  const text = normalizeWhitespace(value);
  if (!text) return '';
  const parts = text
    .split(',')
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
  if (!parts.length) return '';
  return Array.from(new Set(parts)).join(', ');
}

function deriveBirthDateParts(profile: Profile | null): { year: string; month: string; day: string } {
  const idDigits = String(profile?.idNumber ?? '').replace(/\D/g, '');
  if (idDigits.length === 13 && (profile?.idType === 'ID_CARD' || profile?.idType === 'ID_BOOK')) {
    const yy = Number.parseInt(idDigits.slice(0, 2), 10);
    const mm = idDigits.slice(2, 4);
    const dd = idDigits.slice(4, 6);
    const currentYY = new Date().getFullYear() % 100;
    const year = yy <= currentYY ? 2000 + yy : 1900 + yy;
    return { year: String(year), month: mm, day: dd };
  }
  // TODO: When profile captures DOB directly, map passport users here as fallback.
  return { year: '', month: '', day: '' };
}

function firstCaseDetail(sectionH: any, key: string): Record<string, string> {
  const details = Array.isArray(sectionH?.[key]) ? sectionH[key][0] : undefined;
  if (!details || typeof details !== 'object') {
    return {
      policeStation: '',
      caseNumber: '',
      chargeOrOffence: '',
      outcome: '',
      dateFrom: '',
      period: '',
      circumstances: '',
      firearmDetails: '',
    };
  }
  return {
    policeStation: normalizeWhitespace(details.policeStation),
    caseNumber: normalizeWhitespace(details.caseNumber),
    chargeOrOffence: normalizeWhitespace(details.chargeOrOffence),
    outcome: normalizeWhitespace(details.outcome),
    dateFrom: normalizeDateIso(details.dateFrom),
    period: normalizeWhitespace(details.period),
    circumstances: normalizeWhitespace(details.circumstances),
    firearmDetails: normalizeWhitespace(details.firearmDetails),
  };
}

function inferReferenceIdType(idNumber?: string): 'id' | 'passport' | null {
  const value = normalizeWhitespace(idNumber);
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 13 && digits === value) {
    return 'id';
  }
  return 'passport';
}

function build517FieldValues(
  context: ApplicationPdfContext,
  diagnostics: string[],
  fieldMap?: FieldMap | null
): Record<string, string | number> {
  const { application, profile } = context;
  const data = collectStoredFormData(application);
  const hadStoredFormData = Object.keys(data).length > 0;

  applyProfileDefaults(data, profile);
  const derived = deriveCommonFields(data);
  const addressCfg = policy.addressLength ?? {};
  applyAddressWithPostalFallback(
    data,
    profile,
    addressCfg,
    fieldMap?.meta?.postalAddressFallbackText
  );

  if (!hadStoredFormData && !hasAnyMeaningfulData(data)) {
    diagnostics.push('No stored base form data found for SAPS 517 application.');
  }

  const form = application.form517 ?? {};
  const sectionD = form.sectionD ?? {};
  const sectionG = form.sectionG ?? {};
  const sectionH: any = form.sectionH ?? {};
  const employerAddressParts = [
    profile?.employment?.employerAddress?.line1,
    profile?.employment?.employerAddress?.line2,
    profile?.employment?.employerAddress?.suburb,
    profile?.employment?.employerAddress?.city,
  ]
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
  const employerAddressCombined = employerAddressParts.join(' ');
  const employerSplit = splitAddressLines(employerAddressCombined, addressCfg);

  const dob = deriveBirthDateParts(profile);
  const marital = String(profile?.maritalStatus ?? '').toLowerCase();
  const spouseRef = (profile?.references ?? []).find((ref) => {
    const cat = String(ref.relationshipCategory ?? '').toLowerCase();
    const detail = String(ref.relationshipDetail ?? ref.type ?? '').toLowerCase();
    return cat === 'spouse' || cat === 'partner' || detail.includes('spouse') || detail.includes('partner');
  });
  const spouseIdType = inferReferenceIdType(spouseRef?.idNumber);
  const spouseIdValue = normalizeWhitespace(spouseRef?.idNumber);
  const spouseIdDigits = spouseIdValue.replace(/\D/g, '');

  const values: Record<string, string | number> = {
    ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value ?? ''])),
    ...derived,

    birthYear: dob.year,
    birthMonth: dob.month,
    birthDay: dob.day,

    e14TradeOrProfession: normalizeWhitespace(profile?.employment?.tradeOrProfession),
    e15SelfEmployedDetail: normalizeWhitespace(profile?.employment?.selfEmployedDetail),
    e16EmployerName: normalizeWhitespace(profile?.employment?.employerName),
    e17EmployerAddress1: employerSplit.line1,
    e17EmployerAddress2: employerSplit.line2,
    e17EmployerCity: normalizeWhitespace(profile?.employment?.employerAddress?.city),
    e18EmployerPostalCode: normalizeWhitespace(profile?.employment?.employerAddress?.postCode),

    e23SpouseTypeId: toX(spouseIdType === 'id'),
    e23SpouseTypePassport: toX(spouseIdType === 'passport'),
    e23SpouseSaId1: spouseIdType === 'id' ? spouseIdDigits.slice(0, 6) : '',
    e23SpouseSaId2: spouseIdType === 'id' ? spouseIdDigits.slice(6, 10) : '',
    e23SpouseSaId3: spouseIdType === 'id' ? spouseIdDigits.slice(10, 12) : '',
    e23SpouseSaId4: spouseIdType === 'id' ? spouseIdDigits.slice(12, 13) : '',
    e23SpousePassport: spouseIdType === 'passport' ? spouseIdValue : '',
  };

  Object.entries(COMPETENCY_MAP).forEach(([category, key]) => {
    const selected = Array.isArray(sectionD.possessFirearmCompetencies)
      ? sectionD.possessFirearmCompetencies.includes(category as CompetencyType)
      : false;
    values[key] = toX(selected);
  });

  Object.entries(MARITAL_STATUS_MAP).forEach(([status, key]) => {
    values[key] = toX(marital === status);
  });
  values.e22OtherText = marital === 'other' ? normalizeWhitespace(profile?.maritalStatusOther) : '';

  values.g1Yes = toX(sectionG.passedActTest === true);
  values.g1No = toX(sectionG.passedActTest === false);
  values.g2Yes = toX(sectionG.passedPracticalTraining === true);
  values.g2No = toX(sectionG.passedPracticalTraining === false);
  Object.entries(TRAINING_TYPE_MAP).forEach(([type, key]) => {
    const selected = Array.isArray(sectionG.trainingFirearmTypes)
      ? sectionG.trainingFirearmTypes.includes(type as TrainingType)
      : false;
    values[key] = toX(selected);
  });
  values.g3OtherText = normalizeWhitespace(sectionG.trainingFirearmOther);

  values.h1Yes = toX(sectionH.h1TrainingCertificateConfirmed === true);
  values.h1No = toX(sectionH.h1TrainingCertificateConfirmed === false);
  values.h2TrainingInstitutionName = normalizeWhitespace(sectionH.h2TrainingInstitutionName);
  values.h3TrainingCertificateNumber = normalizeWhitespace(sectionH.h3TrainingCertificateSerial);
  values.h4DateIssued = normalizeDateList(sectionH.h4TrainingCertificateDateIssued);

  const yesNoFields: Array<{ base: string; value?: boolean }> = [
    { base: 'h5', value: sectionH.h5ConvictionsConfirmed },
    { base: 'h6', value: sectionH.h6PendingCasesConfirmed },
    { base: 'h7', value: sectionH.h7LostStolenConfirmed },
    { base: 'h8', value: sectionH.h8NegligenceCaseConfirmed },
    { base: 'h9', value: sectionH.h9DeclaredUnfitConfirmed },
    { base: 'h10', value: sectionH.h10ConfiscationConfirmed },
  ];
  yesNoFields.forEach(({ base, value }) => {
    values[`${base}Yes`] = toX(value === true);
    values[`${base}No`] = toX(value === false);
  });
  const h5Yes = sectionH.h5ConvictionsConfirmed === true;
  const h6Yes = sectionH.h6PendingCasesConfirmed === true;
  const h7Yes = sectionH.h7LostStolenConfirmed === true;
  const h8Yes = sectionH.h8NegligenceCaseConfirmed === true;
  const h9Yes = sectionH.h9DeclaredUnfitConfirmed === true;
  const h10Yes = sectionH.h10ConfiscationConfirmed === true;

  const h5 = firstCaseDetail(sectionH, 'h5CaseDetails');
  const h6 = firstCaseDetail(sectionH, 'h6CaseDetails');
  const h7 = firstCaseDetail(sectionH, 'h7CaseDetails');
  const h8 = firstCaseDetail(sectionH, 'h8CaseDetails');
  const h9 = firstCaseDetail(sectionH, 'h9CaseDetails');
  const h10 = firstCaseDetail(sectionH, 'h10CaseDetails');

  values.h5Details = '';
  values.h5Station1 = h5Yes ? h5.policeStation : '';
  values.h5CaseNumber1 = h5Yes ? h5.caseNumber : '';
  values.h5Charge1 = h5Yes ? h5.chargeOrOffence : '';
  values.h5Outcome1 = h5Yes ? h5.outcome : '';

  values.h6Details = '';
  values.h6Station1 = h6Yes ? h6.policeStation : '';
  values.h6CaseNumber1 = h6Yes ? h6.caseNumber : '';
  values.h6Charge1 = h6Yes ? h6.chargeOrOffence : '';

  values.h7Details = '';
  values.h7Station = h7Yes ? h7.policeStation : '';
  values.h7CaseNumber = h7Yes ? h7.caseNumber : '';
  values.h7Circumstances = h7Yes ? h7.circumstances : '';
  values.h7FirearmDetails = h7Yes ? h7.firearmDetails : '';

  values.h8Details = '';
  values.h8Station1 = h8Yes ? h8.policeStation : '';
  values.h8CaseNumber1 = h8Yes ? h8.caseNumber : '';
  values.h8Charge1 = h8Yes ? h8.chargeOrOffence : '';
  values.h8Outcome1 = h8Yes ? h8.outcome : '';

  values.h9Details = '';
  values.h9Station1 = h9Yes ? h9.policeStation : '';
  values.h9CaseNumber1 = h9Yes ? h9.caseNumber : '';
  values.h9Charge1 = h9Yes ? h9.chargeOrOffence : '';
  values.h9Date1 = h9Yes ? h9.dateFrom : '';
  values.h9Period1 = h9Yes ? h9.period : '';

  values.h10Details = '';
  values.h10Station1 = h10Yes ? h10.policeStation : '';
  values.h10CaseNumber1 = h10Yes ? h10.caseNumber : '';
  values.h10Circumstances1 = h10Yes ? h10.circumstances : '';
  values.h10Outcome1 = h10Yes ? h10.outcome : '';

  const h11to16: Array<{ base: string; answer?: string; details?: string }> = [
    { base: 'h11', answer: sectionH.h11ProtectionOrderAnswer, details: sectionH.h11Details },
    { base: 'h12', answer: sectionH.h12DeniedLicenceAnswer, details: sectionH.h12Details },
    { base: 'h13', answer: sectionH.h13SuicideDepressionSubstanceAnswer, details: sectionH.h13Details },
    { base: 'h14', answer: sectionH.h14DiagnosedTreatedAnswer, details: sectionH.h14Details },
    { base: 'h15', answer: sectionH.h15DivorceSeparationViolenceAnswer, details: sectionH.h15Details },
    { base: 'h16', answer: sectionH.h16ForcedJobLossAnswer, details: sectionH.h16Details },
  ];
  h11to16.forEach(({ base, answer, details }) => {
    values[`${base}Yes`] = toX(String(answer).toLowerCase() === 'yes');
    values[`${base}No`] = toX(String(answer).toLowerCase() === 'no');
    values[`${base}Details`] = String(answer).toLowerCase() === 'yes' ? normalizeWhitespace(details) : '';
  });

  values.h17Confirmed21OrOlder = toX(sectionH.h17Confirmed21OrOlder === true);
  const h17Reasons = new Set(
    Array.isArray(sectionH.h17Under21CompellingReasons) ? sectionH.h17Under21CompellingReasons : []
  );
  Object.entries(COMPELLING_REASON_MAP).forEach(([reason, key]) => {
    values[key] = toX(h17Reasons.has(reason as CompellingReason));
  });
  values.h17OtherReasonText = normalizeWhitespace(sectionH.h17OtherReasonText);
  values.h17FullDetails = normalizeWhitespace(sectionH.h17FullDetails);

  return values;
}

async function renderAndStorePdf(
  context: ApplicationPdfContext,
  diagnostics: string[]
): Promise<ApplicationPdfResult> {
  const { application } = context;
  const pdfModule = resolvePdfAssetModule(policy.pdf) ?? resolvePdfAssetModule('../../assets/pdf/517.pdf');
  if (!pdfModule) {
    throw new Error('Unable to resolve SAPS 517 PDF template. Check policy pdf path.');
  }

  const fieldMap =
    resolveFieldMapAsset(policy.pdfFieldMap) ?? resolveFieldMapAsset('../../assets/fieldmap/517.json');
  if (!fieldMap) {
    throw new Error('Unable to resolve SAPS 517 field map. Check policy pdfFieldMap path.');
  }

  const values = build517FieldValues(context, diagnostics, fieldMap);
  const pdf = await renderTemplatePdf({
    assetModule: pdfModule,
    fieldMap,
    data: values,
  });

  if (application.paymentReceived !== true) {
    await ensureRepeatedWatermark(pdf, {});
  }

  const pdfBytes = await pdf.save();
  await ensurePdfWorkspace();
  const target = await pdfPathFor(application.id, 'SAPS-517');
  if (!target) {
    throw new Error('Unable to resolve output path for SAPS 517 PDF.');
  }
  await FileSystem.deleteAsync(target.absolute, { idempotent: true }).catch(() => {});
  const output = new FSFile(target.absolute);
  await output.write(pdfBytes);

  return {
    uri: target.uri,
    absolutePath: target.absolute,
    pageCount: pdf.getPageCount(),
    policyPdfPath: policy.pdf ?? null,
    policyFieldMapPath: policy.pdfFieldMap ?? null,
    generated: true,
    diagnostics,
  };
}

export const saps517Generator: ApplicationPdfGenerator = {
  form: '517',
  async generate(context: ApplicationPdfContext): Promise<ApplicationPdfResult> {
    const diagnostics: string[] = [];
    return renderAndStorePdf(context, diagnostics);
  },
};
