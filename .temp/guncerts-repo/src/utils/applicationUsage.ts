import type { Application } from '../data/types';
import { listByType } from '../data/sqlite';
import {
  resolveEffectiveCompetencyCertificateIds,
  resolveEffectiveFirearmIds,
} from '../pdf/context';

const isTerminalApplication = (application: Application) =>
  application.status === 'submitted' || application.status === 'archived';

const normalizeForm = (value?: string | null) => (value == null ? '' : String(value).trim().toLowerCase());

export const getFirearmIdsInTerminalApplications = (form?: string | null) => {
  const normalizedForm = normalizeForm(form);
  const ids = new Set<string>();
  listByType<Application>('Application')
    .filter((application) => {
      if (!isTerminalApplication(application)) return false;
      if (!normalizedForm) return true;
      return normalizeForm(application.form ?? (application as any).type) === normalizedForm;
    })
    .forEach((application) => {
      resolveEffectiveFirearmIds(application).forEach((id) => {
        if (id) ids.add(String(id));
      });
    });
  return ids;
};

export const getCompetencyCertificateIdsInTerminalApplications = (form?: string | null) => {
  const normalizedForm = normalizeForm(form);
  const ids = new Set<string>();
  listByType<Application>('Application')
    .filter((application) => {
      if (!isTerminalApplication(application)) return false;
      if (!normalizedForm) return true;
      return normalizeForm(application.form ?? (application as any).type) === normalizedForm;
    })
    .forEach((application) => {
      resolveEffectiveCompetencyCertificateIds(application).forEach((id) => {
        if (id) ids.add(String(id));
      });
    });
  return ids;
};
