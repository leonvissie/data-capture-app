import type { Application, Profile, ReferenceInfo } from '../data/types';
import { FORM517_LIMITS } from '../config/form517Limits';
import { normalizeSaIdNumber } from './saIdentity';

export type Form517ReadinessResult = {
  ready: boolean;
  missing: string[];
};

const hasNonEmpty = (value?: string | null) => (value ?? '').trim().length > 0;

const exceedsLimit = (value: string | undefined, limit: number) => (value ?? '').trim().length > limit;

const isSpouseOrPartner = (reference: ReferenceInfo) => {
  const relationship = `${reference.relationshipCategory ?? ''}`.trim().toLowerCase();
  const detail = `${reference.relationshipDetail ?? reference.type ?? ''}`.trim().toLowerCase();
  return relationship === 'spouse' || relationship === 'partner' || detail.includes('spouse') || detail.includes('partner');
};

const deriveAgeFromSaId = (idNumber?: string) => {
  const id = normalizeSaIdNumber(idNumber);
  if (id.length !== 13) return null;
  const yy = Number.parseInt(id.slice(0, 2), 10);
  const mm = Number.parseInt(id.slice(2, 4), 10);
  const dd = Number.parseInt(id.slice(4, 6), 10);
  if (Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd)) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const now = new Date();
  const currentTwoDigitYear = now.getFullYear() % 100;
  const fullYear = yy <= currentTwoDigitYear ? 2000 + yy : 1900 + yy;
  const birthDate = new Date(Date.UTC(fullYear, mm - 1, dd));
  if (Number.isNaN(birthDate.getTime())) return null;

  let age = now.getUTCFullYear() - fullYear;
  const monthDelta = now.getUTCMonth() - (mm - 1);
  const dayDelta = now.getUTCDate() - dd;
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) age -= 1;
  return age;
};

export function validateForm517Readiness(
  application: Application,
  profile?: Profile | null
): Form517ReadinessResult {
  if (application.form !== '517') return { ready: true, missing: [] };

  const missing: string[] = [];
  const form = application.form517;
  const sectionD = form?.sectionD;
  const sectionG = form?.sectionG;
  const sectionH = form?.sectionH;

  if (!Array.isArray(sectionD?.possessFirearmCompetencies) || sectionD!.possessFirearmCompetencies!.length === 0) {
    missing.push('D.4 competencies');
  }

  const employment = profile?.employment;
  if (!hasNonEmpty(employment?.tradeOrProfession)) missing.push('E.14 trade/profession');
  if (!hasNonEmpty(employment?.employerName)) missing.push('E.16 employer/company');
  if (!hasNonEmpty(employment?.employerAddress?.line1)) missing.push('E.17 business address');
  if (!hasNonEmpty(employment?.employerAddress?.postCode)) missing.push('E.18 business postal code');
  if (!hasNonEmpty(profile?.maritalStatus)) missing.push('E.22 marital status');
  if (profile?.maritalStatus === 'other' && !hasNonEmpty(profile.maritalStatusOther)) {
    missing.push('E.22 other marital status');
  }
  if (profile?.maritalStatus === 'married') {
    if (!Array.isArray(profile?.references) || !profile!.references!.some(isSpouseOrPartner)) {
      missing.push('E.23 spouse/partner reference');
    }
  }

  if (typeof sectionG?.passedActTest !== 'boolean') missing.push('G.1 Act test');
  if (typeof sectionG?.passedPracticalTraining !== 'boolean') missing.push('G.2 practical training');
  if (!Array.isArray(sectionG?.trainingFirearmTypes) || sectionG!.trainingFirearmTypes!.length === 0) {
    missing.push('G.3 training firearm types');
  }
  if (sectionG?.trainingFirearmTypes?.includes('Other') && !hasNonEmpty(sectionG.trainingFirearmOther)) {
    missing.push('G.3 other training firearm');
  }
  if (typeof sectionH?.h1TrainingCertificateConfirmed !== 'boolean') {
    missing.push('H.1 training certificate confirmation');
  }
  if (sectionH?.h1TrainingCertificateConfirmed === true) {
    if (!hasNonEmpty(sectionH?.h2TrainingInstitutionName)) missing.push('H.2 training institution');
    if (!hasNonEmpty(sectionH?.h3TrainingCertificateSerial)) missing.push('H.3 training certificate serial');
    if (!hasNonEmpty(sectionH?.h4TrainingCertificateDateIssued)) missing.push('H.4 date issued');
  }
  if (typeof sectionH?.h5ConvictionsConfirmed !== 'boolean') missing.push('H.5 convictions confirmation');
  if (typeof sectionH?.h6PendingCasesConfirmed !== 'boolean') missing.push('H.6 pending cases confirmation');
  if (typeof sectionH?.h7LostStolenConfirmed !== 'boolean') missing.push('H.7 lost/stolen confirmation');
  if (typeof sectionH?.h8NegligenceCaseConfirmed !== 'boolean') missing.push('H.8 negligence confirmation');
  if (typeof sectionH?.h9DeclaredUnfitConfirmed !== 'boolean') missing.push('H.9 unfit confirmation');
  if (typeof sectionH?.h10ConfiscationConfirmed !== 'boolean') missing.push('H.10 confiscation confirmation');

  const detailQuestions: Array<{ code: string; answer?: 'yes' | 'no' }> = [
    { code: 'H.11', answer: sectionH?.h11ProtectionOrderAnswer },
    { code: 'H.12', answer: sectionH?.h12DeniedLicenceAnswer },
    { code: 'H.13', answer: sectionH?.h13SuicideDepressionSubstanceAnswer },
    { code: 'H.14', answer: sectionH?.h14DiagnosedTreatedAnswer },
    { code: 'H.15', answer: sectionH?.h15DivorceSeparationViolenceAnswer },
    { code: 'H.16', answer: sectionH?.h16ForcedJobLossAnswer },
  ];

  detailQuestions.forEach((q) => {
    if (q.answer !== 'yes' && q.answer !== 'no') {
      missing.push(`${q.code} answer`);
      return;
    }
  });

  const age = deriveAgeFromSaId(profile?.idNumber);
  const isPassportUnknownAge = profile?.idType === 'PASSPORT' && age == null;
  const requiresOrShowsH17 = (age != null && age < 21) || isPassportUnknownAge;
  if (requiresOrShowsH17) {
    if (sectionH?.h17Confirmed21OrOlder !== true && sectionH?.h17Confirmed21OrOlder !== false) {
      missing.push('H.17 under-21 status');
    }
  }

  return { ready: missing.length === 0, missing };
}
