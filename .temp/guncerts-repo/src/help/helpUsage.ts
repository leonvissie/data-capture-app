const helpUsageByKey: Record<string, string[]> = {
  helpDocsSelectCompetency: ['application/[id]/documents'],
  helpDocsId: ['application/[id]/documents'],
  helpDocsProofOfAddress: ['application/[id]/documents'],
  helpDocsFirearmLicence: ['application/[id]/documents'],
  helpDocsCompCert: ['application/[id]/documents', '(tabs)/profile'],
  helpSettingsCompCertCalc: ['(tabs)/settings'],
  helpDocsSafes: ['application/[id]/documents'],
  helpDocSupportingStatement: ['application/[id]/documents', 'supporting/wizard'],
  helpDocMotivation: ['application/[id]/documents'],
  helpDocsPassportPhotos: ['application/[id]/documents'],
  helpDocsAssociationMembership: ['application/[id]/documents'],
  helpDocsAssociationLetter: ['application/[id]/documents'],
  helpDocsProficiency: ['application/[id]/documents'],
  helpDocsTrainingCert: ['application/[id]/documents'],
  helpDocsStatementOfResults: ['application/[id]/documents'],
  helpDocsGeneralUpload: ['application/[id]/documents'],
  helpDocsDedicatedHunter: ['application/[id]/documents'],
  helpDocsDedicatedSport: ['application/[id]/documents'],
  helpConvicted: ['application/[id]/documents'],
  helpFitToPossess: ['application/[id]/documents'],
  helpCarrySafely: ['application/[id]/documents'],
  helpMountedSafe: ['application/[id]/documents'],
  helpWizardMembership: ['membership/wizard'],
  helpWizardId: ['id/wizard'],
  helpWizardAddress: ['address/wizard'],
  helpWizardSafe: ['safe/wizard'],
  helpWizardCompetency: ['competency/wizard'],
  helpWizardFirearms: ['firearms/wizard'],
};

export const getHelpUsageScreens = (key: string): string[] => helpUsageByKey[key] ?? [];

export default helpUsageByKey;
