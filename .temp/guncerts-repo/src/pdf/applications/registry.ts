import { Application } from '../../data/types';
import { getById } from '../../data/sqlite';
import {
  resolveApplicationFirearms,
  resolveApplicationProfile,
  resolveApplicationCompetencyCertificates,
} from '../context';
import { ApplicationPdfGenerator, ApplicationPdfResult } from './types';
import { saps517Generator } from './saps517';
import { saps517gGenerator } from './saps517g';
import { saps518aGenerator } from './saps518a';

const REGISTRY: Partial<Record<Application['form'], ApplicationPdfGenerator>> = {
  '517': saps517Generator,
  '517g': saps517gGenerator,
  '518a': saps518aGenerator,
};

export function getApplicationPdfGenerator(form: Application['form']) {
  return REGISTRY[form];
}

export async function generateApplicationPdf(application: Application): Promise<ApplicationPdfResult | null> {
  const freshApplication =
    application?.id ? (getById<Application>(String(application.id)) ?? application) : application;
  const generator = getApplicationPdfGenerator(freshApplication.form);
  if (!generator) {
    return null;
  }
  const profile = resolveApplicationProfile(freshApplication);
  const firearms = resolveApplicationFirearms(freshApplication);
  const competencyCertificates = resolveApplicationCompetencyCertificates(freshApplication);
  return generator.generate({ application: freshApplication, profile, firearms, competencyCertificates });
}
