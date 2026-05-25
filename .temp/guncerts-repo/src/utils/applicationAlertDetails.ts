import { FORM_LABEL_MAP, licenceLabel } from '../components/ApplicationCard';
import { Application, CompetencyCategory, CompetencyCertificate } from '../data/types';
import { resolveApplicationCompetencyCertificates, resolveApplicationFirearms } from '../pdf/context';
import { formatFirearmTitle, getPrimaryFirearmSerial } from './firearmDisplay';

const CATEGORY_LABELS: Record<CompetencyCategory, string> = {
  Handgun: 'Handgun',
  Rifle: 'Rifle',
  Shotgun: 'Shotgun',
  HandMachineCarbine: 'Hand machine carbine',
};

const COMPETENCY_TYPE_LABELS: Record<string, string> = {
  '1.1': 'Possess a firearm',
  '1.2': 'Trade in firearms',
  '1.3': 'Manufacture firearms',
  '1.4': 'Conduct business as a gunsmith',
  '1.5': 'Possess a firearm as a private collector',
};

function formatUpdatedDate(value?: string) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB');
}

function toBulletList(items: string[]) {
  return items.map((item) => `- ${item}`).join('\n');
}

function formatFirearmLine(application: Application) {
  const firearms = resolveApplicationFirearms(application);
  if (!firearms.length) return '- Not captured';

  const items = firearms.map((firearm) => {
    const model = String(firearm.model ?? '').trim();
    if (model && model.toUpperCase() !== 'NONE') {
      return formatFirearmTitle(firearm, 'Firearm');
    }
    const make = String(firearm.make ?? '').trim();
    const type = firearm.firearmType ? CATEGORY_LABELS[firearm.firearmType] ?? firearm.firearmType : 'Firearm';
    const serial = getPrimaryFirearmSerial(firearm);
    const heading = `${make} ${type}`.trim();
    return serial ? `${heading} (${serial})` : heading;
  });

  return toBulletList(items);
}

function formatCompetencyEntry(cert: CompetencyCertificate) {
  const labels = (cert.licenceTypes ?? [])
    .map((code) => {
      const mapped = licenceLabel('517g', code);
      if (mapped && mapped !== code) return mapped;
      return COMPETENCY_TYPE_LABELS[code] ?? code;
    })
    .filter(Boolean);
  const typeLabel = labels.length ? labels.join(', ') : 'Possess a firearm';
  const categories = (cert.categories ?? [])
    .map((category) => CATEGORY_LABELS[category] ?? category)
    .filter(Boolean);
  return categories.length ? `${typeLabel} (${categories.join(', ')})` : typeLabel;
}

function formatCompetencyLine(application: Application) {
  if (application.form === '517') {
    const categories = (application.form517?.sectionD?.possessFirearmCompetencies ?? [])
      .map((category) => CATEGORY_LABELS[category] ?? category)
      .filter(Boolean);
    if (!categories.length) return '- Not captured';
    return toBulletList([`Possess a firearm (${categories.join(', ')})`]);
  }

  const certs = resolveApplicationCompetencyCertificates(application);
  if (!certs.length) return '- Not captured';
  return toBulletList(certs.map((cert) => formatCompetencyEntry(cert)));
}

export function buildApplicationAlertDetails(application: Application) {
  const title = FORM_LABEL_MAP[application.form] ?? 'Application';
  const subjectLabel = application.form === '518a' ? 'Firearm' : 'Competency';
  const subjectContent = application.form === '518a'
    ? formatFirearmLine(application)
    : formatCompetencyLine(application);
  const updated = formatUpdatedDate(application.updatedAt || application.createdAt);

  return `Application type:\n${title}\n\n${subjectLabel}:\n${subjectContent}\n\nLast updated: ${updated}`;
}
