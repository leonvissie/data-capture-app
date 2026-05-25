import { Application, ApplicationDocState, Profile } from '../data/types';
import { resolveRequirementsForApplication } from '../policy/resolve';

export function seedDocsFor(app: Application, _profile: Profile | null): ApplicationDocState {
  const resolved = resolveRequirementsForApplication({
    application: {
      id: app.id,
      form: app.form,
      licenceType: (app as any).licenceType,
      licenceTypes: (app as any).licenceTypes,
      licenseType: (app as any).licenseType,
      licenseTypes: (app as any).licenseTypes,
    },
    firearms: (app.firearms ?? []).map((firearm) => ({
      id: firearm.id,
      make: firearm.make,
      model: firearm.model,
      section: firearm.section,
      licenceType: (firearm as any).licenceType,
      licenceTypes: (firearm as any).licenceTypes,
      licenseType: (firearm as any).licenseType,
      licenseTypes: (firearm as any).licenseTypes,
    })),
  });

  return {
    applicationId: app.id,
    policy: {
      form: app.form,
      version: resolved.policy?.version ?? '',
      effectiveFrom: undefined,
      licenceTypes: app.licenceTypes ?? (app as any).licenseTypes,
      includeMembershipIfPresent: resolved.includeMembershipIfPresent === true,
    },
    requirements: resolved.requirements.map((req) => ({
      code: req.code,
      required: req.required,
      requireUpload: req.requiredUpload ?? req.requireUpload ?? true,
      isSupportingDocument: false,
      isChecklistItem: false,
      documentKinds: req.documentKinds,
      annexure: req.annexure,
      min: req.min,
      copies: req.copies,
      scope: req.scope
        ? req.scope.perFirearm
          ? 'perFirearm'
          : req.scope.perSafe
            ? 'perSafe'
            : req.scope.perCertificate
              ? 'perCertificate'
              : req.scope.perMembership
                ? 'perMembership'
                : 'perApp'
        : undefined,
    })),
    documents: [],
  };
}
