import {
  ActivityEvidence,
  Application,
  Firearm,
  Profile,
  CompetencyCertificate,
  Safe,
  Membership,
  Proficiency,
} from '../data/types';
import { getById, getFirstProfile, listByType } from '../data/sqlite';
import policy517g from '../policy/517g.json';
import policy518a from '../policy/518a.json';
import policy517 from '../policy/517.json';

function canonicalForm(form?: string) {
  const key = (form || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^e/, '');
  if (key === '517' || key === '517g' || key === '518a') return key as '517' | '517g' | '518a';
  return form as any;
}

function policyAutoSelectSingle(application: Application, code: string): boolean {
  const normalized = canonicalForm((application as any)?.form ?? (application as any)?.type);
  const policy =
    normalized === '517'
      ? (policy517 as any)
      : normalized === '517g'
      ? (policy517g as any)
      : normalized === '518a'
        ? (policy518a as any)
        : null;
  const requirements = Array.isArray(policy?.requirements) ? policy.requirements : [];
  const entry = requirements.find((req: any) => `${req?.code ?? ''}`.toUpperCase() === code.toUpperCase());
  if (!entry) return true;
  return entry.autoSelectSingle !== false;
}

export function resolveApplicationProfile(application: Application): Profile | null {
  if (!application) return null;
  const directProfileId = (application as any).applicantProfileId ?? application.applicantProfileId;
  if (directProfileId) {
    const profile = getById<Profile>(String(directProfileId));
    if (profile) {
      return profile;
    }
  }
  return getFirstProfile();
}

export function resolveApplicationFirearms(application: Application): Firearm[] {
  if (!application) return [];
  const inline: Firearm[] = Array.isArray(application.firearms)
    ? application.firearms.filter((f): f is Firearm => !!f && typeof f === 'object')
    : [];

  const ids = new Set<string>(resolveEffectiveFirearmIds(application, inline));

  if (!ids.size) {
    return inline;
  }

  const allFirearms = listByType<Firearm>('Firearm');
  const resolved: Firearm[] = [];

  ids.forEach((id) => {
    const matchInline = inline.find((firearm) => firearm?.id && String(firearm.id) === id);
    if (matchInline) {
      resolved.push(matchInline);
      return;
    }
    const matchStore = allFirearms.find((firearm) => firearm?.id && String(firearm.id) === id);
    if (matchStore) {
      resolved.push(matchStore);
    }
  });

  return resolved;
}

export function resolveEffectiveFirearmIds(application: Application, inline?: Firearm[]): string[] {
  const ids = new Set<string>();
  if (Array.isArray(application.selectedFirearmIds)) {
    application.selectedFirearmIds.forEach((id) => {
      if (id) ids.add(String(id));
    });
  } else {
    const inlineList = Array.isArray(inline)
      ? inline
      : Array.isArray(application.firearms)
        ? application.firearms.filter((f): f is Firearm => !!f && typeof f === 'object')
        : [];
    inlineList.forEach((firearm) => {
      if (firearm?.id) ids.add(String(firearm.id));
    });
  }
  if (!ids.size && !Array.isArray(application.selectedFirearmIds)) {
    const profileId = application.applicantProfileId ? String(application.applicantProfileId) : null;
    if (!profileId) return [];
    const profileFirearms = listByType<Firearm>('Firearm').filter(
      (firearm) => String(firearm.holderProfileId ?? '') === profileId
    );
    if (profileFirearms.length === 1 && profileFirearms[0]?.id) {
      ids.add(String(profileFirearms[0].id));
    }
  }
  return Array.from(ids);
}

export function resolveApplicationCompetencyCertificates(application: Application): CompetencyCertificate[] {
  if (!application) return [];
  const inline: CompetencyCertificate[] = Array.isArray((application as any).competencyCertificates)
    ? (application as any).competencyCertificates.filter(
        (cert: any): cert is CompetencyCertificate => !!cert && typeof cert === 'object'
      )
    : [];

  const ids = new Set<string>(resolveEffectiveCompetencyCertificateIds(application, inline));
  if (!ids.size) return inline;

  const allCertificates = listByType<CompetencyCertificate>('CompetencyCertificate');
  const resolved: CompetencyCertificate[] = [];

  ids.forEach((id) => {
    const matchInline = inline.find((cert) => cert?.id && String(cert.id) === id);
    if (matchInline) {
      resolved.push(matchInline);
      return;
    }
    const matchStore = allCertificates.find((cert) => cert?.id && String(cert.id) === id);
    if (matchStore) {
      resolved.push(matchStore);
    }
  });

  return resolved;
}

export function resolveEffectiveCompetencyCertificateIds(
  application: Application,
  inline?: CompetencyCertificate[]
): string[] {
  const ids = new Set<string>();
  const inlineList: CompetencyCertificate[] = Array.isArray(inline)
    ? inline
    : Array.isArray((application as any).competencyCertificates)
      ? (application as any).competencyCertificates.filter(
          (cert: any): cert is CompetencyCertificate => !!cert && typeof cert === 'object'
        )
      : [];

  inlineList.forEach((cert) => {
    if (cert?.id) {
      ids.add(String(cert.id));
    }
  });
  (application.competencyCertificateIds ?? []).forEach((id) => {
    if (id) ids.add(String(id));
  });

  if (!ids.size) {
    const profileId = application.applicantProfileId ? String(application.applicantProfileId) : null;
    if (!profileId) return [];
    const profileCerts = listByType<CompetencyCertificate>('CompetencyCertificate').filter(
      (cert) => String(cert.holderProfileId ?? '') === profileId
    );
    if (profileCerts.length === 1 && profileCerts[0]?.id) {
      ids.add(String(profileCerts[0].id));
    }
  }

  return Array.from(ids);
}

export function resolveEffectiveSafeIds(application: Application): string[] {
  const ids = new Set<string>();
  (application.safeIds ?? []).forEach((id) => {
    if (id) ids.add(String(id));
  });
  if (!ids.size) {
    const profileId = application.applicantProfileId ? String(application.applicantProfileId) : null;
    if (!profileId) return [];
    const profileSafes = listByType<Safe>('Safe').filter(
      (safe) => String(safe.holderProfileId ?? '') === profileId
    );
    if (profileSafes.length === 1 && profileSafes[0]?.id) {
      ids.add(String(profileSafes[0].id));
    }
  }
  return Array.from(ids);
}

export function resolveEffectiveMembershipIds(application: Application): string[] {
  const ids = new Set<string>();
  (application.membershipIds ?? []).forEach((id) => {
    if (id) ids.add(String(id));
  });
  if (!ids.size && !Array.isArray(application.membershipIds) && policyAutoSelectSingle(application, 'MEMBERSHIP')) {
    const profileId = application.applicantProfileId ? String(application.applicantProfileId) : null;
    if (!profileId) return [];
    const profileMemberships = listByType<Membership>('Membership').filter(
      (m) => String(m.holderProfileId ?? '') === profileId
    );
    if (profileMemberships.length === 1 && profileMemberships[0]?.id) {
      ids.add(String(profileMemberships[0].id));
    }
  }
  return Array.from(ids);
}

export function resolveEffectiveProficiencyIds(application: Application): string[] {
  const ids = new Set<string>();
  (application.proficiencyIds ?? []).forEach((id) => {
    if (id) ids.add(String(id));
  });
  if (!ids.size && !Array.isArray(application.proficiencyIds) && policyAutoSelectSingle(application, 'PROFICIENCY')) {
    const profileId = application.applicantProfileId ? String(application.applicantProfileId) : null;
    if (!profileId) return [];
    const profileProficiencies = listByType<Proficiency>('Proficiency').filter(
      (p) => String(p.holderProfileId ?? '') === profileId
    );
    if (profileProficiencies.length === 1 && profileProficiencies[0]?.id) {
      ids.add(String(profileProficiencies[0].id));
    }
  }
  return Array.from(ids);
}

export function resolveEffectiveActivityEvidenceIds(application: Application): string[] {
  const ids = new Set<string>();
  (application.activityEvidenceIds ?? []).forEach((id) => {
    if (id) ids.add(String(id));
  });
  return Array.from(ids);
}

export function resolveActivityEvidenceForProfile(profileId?: string | null): ActivityEvidence[] {
  const trimmed = `${profileId ?? ''}`.trim();
  if (!trimmed) return [];
  return listByType<ActivityEvidence>('ActivityEvidence').filter(
    (entry) => String(entry.holderProfileId ?? '') === trimmed && !entry.deleted,
  );
}
