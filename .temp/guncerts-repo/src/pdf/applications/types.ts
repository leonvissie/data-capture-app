import { Application, Firearm, Profile, CompetencyCertificate } from '../../data/types';

export type ApplicationPdfContext = {
  application: Application;
  profile: Profile | null;
  firearms: Firearm[];
  competencyCertificates: CompetencyCertificate[];
};

export type ApplicationPdfResult = {
  uri: string;
  absolutePath: string;
  pageCount?: number;
  policyPdfPath?: string | null;
  policyFieldMapPath?: string | null;
  generated: boolean;
  diagnostics?: string[];
};

export type ApplicationPdfGenerator = {
  form: Application['form'];
  generate(context: ApplicationPdfContext): Promise<ApplicationPdfResult>;
};
