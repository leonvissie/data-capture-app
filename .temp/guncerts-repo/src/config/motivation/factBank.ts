import type { MotivationDistanceBand, MotivationSightingSystem } from '../../data/types';
import type { MotivationPurposeType } from './sentenceBank.types';
import type {
  FactBank,
  FactCalibreCatalogRecord,
  FactRecord,
  FactSpeciesGroupRecord,
  FactSightingCatalogRecord,
} from './factBank.types';
import { resolveCalibreCatalogRecordFromList } from './calibreCatalog.shared';

const SAPS_Q3_2025_2026_TITLE =
  'Police Recorded Crime Statistics: Republic of South Africa, Third Quarter of 2025-2026 Financial Year (October 2025 to December 2025)';
const SAPS_Q3_2025_2026_URL =
  'https://www.saps.gov.za/services/downloads/2025/2025-2026_-_3rd_Quarter_WEB.pdf';
const SAAMI_GAUGE_GLOSSARY_URL = 'https://saami.org/glossary/gauge/';
const SAAMI_SHOTSHELL_STANDARD_URL =
  'https://saami.org/wp-content/uploads/2022/08/ANSI-SAAMI-Z299.2-Shotshell-2019-Approved-2019-04-23.pdf';
const WINCHESTER_SHOTSHELL_NOTATION_URL =
  'https://winchester.com/Support/Media/In-The-News/2024/09/05/Winchester-Introduces-Last-Call-TSS-Waterfowl-Ammunition';

const NATIONAL_VIOLENT_CRIME_FACT: FactRecord = {
  id: 'crime_sa_national_violent_crime_context',
  category: 'crime_stat',
  contextType: 'self_defence',
  title: 'South Africa violent-crime context',
  summary:
    'The SAPS Third Quarter 2025-2026 crime statistics record 175 210 contact crimes nationally, including murder, sexual offences, attempted murder, assault, robbery, carjacking, and ransom-related kidnappings.',
  wording:
    'According to the SAPS Police Recorded Crime Statistics: Republic of South Africa, Third Quarter of the 2025-2026 financial year, South Africa recorded 175 210 contact crimes between October and December 2025, including 6 351 murders, 14 547 sexual offences, 7 858 attempted murders, 50 253 assaults with intent to inflict grievous bodily harm, 53 539 common assaults, and 42 662 robbery counts when common robbery and robbery with aggravating circumstances are read together. The same quarter also recorded 4 420 carjackings and 208 ransom-related kidnappings, illustrating the continued prevalence of violent crime relevant to lawful personal protection.',
  jurisdiction: {
    type: 'national',
    regionCode: 'za',
    regionLabel: 'South Africa',
  },
  metric: {
    metricType: 'count',
    value: 175210,
    periodLabel: 'October 2025 to December 2025',
  },
  tags: [
    'crime',
    'violent-crime',
    'murder',
    'sexual-offences',
    'assault',
    'robbery',
    'carjacking',
    'kidnapping',
  ],
  usage: {
    sectionIds: ['S9'],
    sectionTypes: ['s13'],
    contextTypes: ['self_defence'],
    locationSensitive: false,
    priority: 10,
  },
  source: {
    id: 'saps_q3_2025_2026_crime_stats_national',
    title: SAPS_Q3_2025_2026_TITLE,
    sourceType: 'official_statistics',
    publisher: 'South African Police Service',
    publicationDate: '2026-02-20',
    url: SAPS_Q3_2025_2026_URL,
    notes:
      'National contact-crime total appears on page 130 of the PDF, with the province summary on page 130 and ransom-related kidnappings on page 81.',
  },
  reviewStatus: 'approved',
};

const FEMALE_SELF_DEFENCE_CONTEXT_FACT: FactRecord = {
  id: 'crime_sa_female_self_defence_context',
  category: 'crime_stat',
  contextType: 'self_defence',
  title: 'National sexual-offence context relevant to female applicants',
  summary:
    'The SAPS Third Quarter 2025-2026 crime statistics record 14 547 sexual offences nationally between October and December 2025.',
  wording:
    'For a female applicant, the broader safety environment must also be considered against the continued prevalence of sexual offences. The same SAPS quarterly crime report records 14 547 sexual offences nationally between October and December 2025, which underscores that additional dimension of personal-security risk.',
  jurisdiction: {
    type: 'none',
  },
  metric: {
    metricType: 'count',
    value: 14547,
    periodLabel: 'October 2025 to December 2025',
  },
  tags: ['crime', 'violent-crime', 'sexual-offences', 'female-applicant'],
  usage: {
    sectionIds: ['S9'],
    sectionTypes: ['s13'],
    contextTypes: ['self_defence'],
    applicantSexes: ['female'],
    priority: 11,
  },
  source: {
    id: 'saps_q3_2025_2026_crime_stats_female_context',
    title: SAPS_Q3_2025_2026_TITLE,
    sourceType: 'official_statistics',
    publisher: 'South African Police Service',
    publicationDate: '2026-02-20',
    url: SAPS_Q3_2025_2026_URL,
    notes:
      'National sexual-offences total appears in the SAPS Q3 2025-2026 report and is used here as a restrained additional context factor for female self-defence applications.',
  },
  reviewStatus: 'approved',
};

const PROVINCIAL_SELF_DEFENCE_CRIME_FACTS: FactRecord[] = [
  {
    regionCode: 'ec',
    regionLabel: 'Eastern Cape',
    contactCrimes: 19648,
    murders: 1270,
    sexualOffences: 2315,
    attemptedMurder: 609,
    assaultGBH: 7739,
    commonAssault: 4665,
    commonRobbery: 654,
    aggravatedRobbery: 2396,
    ransomKidnappings: 9,
  },
  {
    regionCode: 'fs',
    regionLabel: 'Free State',
    contactCrimes: 11484,
    murders: 228,
    sexualOffences: 972,
    attemptedMurder: 639,
    assaultGBH: 3781,
    commonAssault: 4102,
    commonRobbery: 559,
    aggravatedRobbery: 1203,
    ransomKidnappings: 5,
  },
  {
    regionCode: 'gp',
    regionLabel: 'Gauteng',
    contactCrimes: 44540,
    murders: 1536,
    sexualOffences: 2719,
    attemptedMurder: 1939,
    assaultGBH: 9958,
    commonAssault: 13255,
    commonRobbery: 3495,
    aggravatedRobbery: 11638,
    ransomKidnappings: 138,
  },
  {
    regionCode: 'kzn',
    regionLabel: 'KwaZulu-Natal',
    contactCrimes: 30688,
    murders: 1297,
    sexualOffences: 2842,
    attemptedMurder: 1822,
    assaultGBH: 8928,
    commonAssault: 8536,
    commonRobbery: 1815,
    aggravatedRobbery: 5448,
    ransomKidnappings: 19,
  },
  {
    regionCode: 'lp',
    regionLabel: 'Limpopo',
    contactCrimes: 10336,
    murders: 215,
    sexualOffences: 1277,
    attemptedMurder: 263,
    assaultGBH: 3271,
    commonAssault: 2982,
    commonRobbery: 769,
    aggravatedRobbery: 1559,
    ransomKidnappings: 3,
  },
  {
    regionCode: 'mp',
    regionLabel: 'Mpumalanga',
    contactCrimes: 9252,
    murders: 285,
    sexualOffences: 969,
    attemptedMurder: 328,
    assaultGBH: 3097,
    commonAssault: 2488,
    commonRobbery: 454,
    aggravatedRobbery: 1631,
    ransomKidnappings: 7,
  },
  {
    regionCode: 'nw',
    regionLabel: 'North West',
    contactCrimes: 12078,
    murders: 251,
    sexualOffences: 1007,
    attemptedMurder: 301,
    assaultGBH: 4539,
    commonAssault: 3512,
    commonRobbery: 671,
    aggravatedRobbery: 1797,
    ransomKidnappings: 15,
  },
  {
    regionCode: 'nc',
    regionLabel: 'Northern Cape',
    contactCrimes: 5785,
    murders: 112,
    sexualOffences: 432,
    attemptedMurder: 746,
    assaultGBH: 2212,
    commonAssault: 1552,
    commonRobbery: 296,
    aggravatedRobbery: 435,
    ransomKidnappings: 1,
  },
  {
    regionCode: 'wc',
    regionLabel: 'Western Cape',
    contactCrimes: 31399,
    murders: 1157,
    sexualOffences: 2014,
    attemptedMurder: 1211,
    assaultGBH: 6728,
    commonAssault: 12447,
    commonRobbery: 2861,
    aggravatedRobbery: 4981,
    ransomKidnappings: 11,
  },
].map((province): FactRecord => {
  const robberyTotal = province.commonRobbery + province.aggravatedRobbery;

  return {
    id: `crime_${province.regionCode}_violent_crime_context`,
    category: 'crime_stat',
    contextType: 'self_defence',
    title: `${province.regionLabel} violent-crime context`,
    summary: `The SAPS Third Quarter 2025-2026 crime statistics record ${province.contactCrimes.toLocaleString(
      'en-ZA'
    )} contact crimes in ${province.regionLabel}, together with ${province.ransomKidnappings.toLocaleString(
      'en-ZA'
    )} ransom-related kidnappings during the same quarter.`,
    wording: `The SAPS Police Recorded Crime Statistics: Republic of South Africa, Third Quarter of the 2025-2026 financial year records ${province.contactCrimes.toLocaleString(
      'en-ZA'
    )} contact crimes in ${province.regionLabel} between October and December 2025, including ${province.murders.toLocaleString(
      'en-ZA'
    )} murders, ${province.sexualOffences.toLocaleString(
      'en-ZA'
    )} sexual offences, ${province.attemptedMurder.toLocaleString(
      'en-ZA'
    )} attempted murders, ${province.assaultGBH.toLocaleString(
      'en-ZA'
    )} assaults with intent to inflict grievous bodily harm, ${province.commonAssault.toLocaleString(
      'en-ZA'
    )} common assaults, and ${robberyTotal.toLocaleString(
      'en-ZA'
    )} robbery counts when common robbery and robbery with aggravating circumstances are read together. The same report also records ${province.ransomKidnappings.toLocaleString(
      'en-ZA'
    )} ransom-related kidnappings in ${province.regionLabel} during the same quarter, reinforcing the serious violent-crime environment relevant to lawful personal protection.`,
    jurisdiction: {
      type: 'province',
      regionCode: province.regionCode,
      regionLabel: province.regionLabel,
    },
    metric: {
      metricType: 'count',
      value: province.contactCrimes,
      periodLabel: 'October 2025 to December 2025',
    },
    tags: [
      'crime',
      'province',
      'violent-crime',
      'murder',
      'sexual-offences',
      'assault',
      'robbery',
      'kidnapping',
      province.regionLabel.toLowerCase().replace(/\s+/g, '-'),
    ],
    usage: {
      sectionIds: ['S9'],
      sectionTypes: ['s13'],
      contextTypes: ['self_defence'],
      locationSensitive: true,
      priority: 20,
    },
    source: {
      id: `saps_q3_2025_2026_crime_stats_${province.regionCode}`,
      title: SAPS_Q3_2025_2026_TITLE,
      sourceType: 'official_statistics',
      publisher: 'South African Police Service',
      publicationDate: '2026-02-20',
      url: SAPS_Q3_2025_2026_URL,
      notes:
        'Province contact-crime totals appear in the national overview with provincial summary, and ransom-related kidnappings appear in the provincial kidnapping table.',
    },
    reviewStatus: 'approved',
  };
});

function resolveDistanceBandFromMaxDistance(
  maxDistanceMetres: number
): MotivationDistanceBand {
  if (maxDistanceMetres <= 50) return 'under_50m';
  if (maxDistanceMetres <= 150) return '50_to_150m';
  if (maxDistanceMetres <= 300) return '150_to_300m';
  return '300m_plus';
}

export const factBank: FactBank = {
  version: '1.0.0',
  huntingSpeciesGroupPills: [
    'Bird & Fowl',
    'Small Game',
    'Medium Game',
    'Large Game',
    'Varmint & Pest Control',
    'Big 5',
  ],
  huntingSpeciesGroups: [
    {
      id: 'bird_fowl',
      label: 'Bird & Fowl',
      calibreKeys: ['22lr', '12ga', '16ga', '20ga', '28ga', '410ga'],
      speciesExamples: ['Guineafowl', 'Francolin', 'Duck', 'Goose', 'Pigeon and dove'],
    },
    {
      id: 'small_game',
      label: 'Small Game',
      calibreKeys: ['17hmr', '22lr', '22wmr', '222rem', '223rem', '556x45', '22250rem', '410ga'],
      speciesExamples: ['Hare', 'Springhare', 'Rock hyrax (dassie)', 'Duiker', 'Steenbok', 'Warthog'],
    },
    {
      id: 'varmint_pest_control',
      label: 'Varmint & Pest Control',
      calibreKeys: ['17hmr', '22lr', '22wmr', '222rem', '223rem', '556x45', '22250rem', '410ga'],
      speciesExamples: ['Jackal', 'Caracal', 'Vervet monkey', 'Rock hyrax (dassie)', 'Feral pigeon'],
    },
    {
      id: 'medium_game',
      label: 'Medium Game',
      calibreKeys: [
        '243win',
        '2506rem',
        '65creedmoor',
        '65x55',
        '270win',
        '270wsm',
        '7mm08rem',
        '7x57',
        '303british',
        '308win',
      ],
      speciesExamples: ['Impala', 'Blesbok', 'Nyala', 'Bushbuck', 'Kudu'],
    },
    {
      id: 'large_game',
      label: 'Large Game',
      calibreKeys: [
        '7mmremmag',
        '3006springfield',
        '300wsm',
        '308win',
        '300winmag',
        '375hh',
      ],
      speciesExamples: ['Wildebeest', 'Waterbuck', 'Gemsbok', 'Eland', 'Hartebeest'],
    },
    {
      id: 'big_5',
      label: 'Big 5',
      calibreKeys: ['375hh', '416rigby', '458winmag', '458lott'],
      speciesExamples: ['Lion', 'Leopard', 'Elephant', 'Rhinoceros', 'Buffalo'],
    },
  ],
  calibreCatalog: ([
    {
      key: '22lr',
      label: '.22 LR',
      aliases: [
        '22lr',
        '.22lr',
        '.22 lr',
        '22 lr',
        '.22short/long/lr',
        '.22 short/long/lr',
        '22 short/long/lr',
        '22 long rifle',
      ],
      typicalDistanceLabel: '0 to 75 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 75,
      notes: 'Commonly used for short-range small game and training contexts.',
    },
    {
      key: '17hmr',
      label: '.17 HMR',
      aliases: ['17hmr', '.17hmr', '.17 hmr', '17 hmr', '.17', '17'],
      typicalDistanceLabel: '30 to 150 metres',
      minDistanceMetres: 30,
      maxDistanceMetres: 150,
      notes: 'Typically used for small game and varmint control where legal.',
    },
    {
      key: '22wmr',
      label: '.22 WMR',
      aliases: ['22wmr', '.22wmr', '.22 wmr', '22 wmr', '22 mag', '.22 magnum', '.22', '22'],
      typicalDistanceLabel: '30 to 125 metres',
      minDistanceMetres: 30,
      maxDistanceMetres: 125,
      notes: 'Practical for small game and pest control roles.',
    },
    {
      key: '223rem',
      label: '.223 Rem',
      aliases: ['223rem', '.223rem', '.223 rem', '223 rem', '.223 remington', '.223', '223'],
      typicalDistanceLabel: '75 to 250 metres',
      minDistanceMetres: 75,
      maxDistanceMetres: 250,
      notes: 'Often used for small game and varmint control; medium game only where lawful.',
    },
    {
      key: '222rem',
      label: '.222 Rem',
      aliases: [
        '222rem',
        '.222rem',
        '.222 rem',
        '222 rem',
        '.222 rem rifle',
        '222 rem rifle',
        '.222 remington',
        '222 remington',
        '.222',
        '222',
        '5.7x43',
        '5.7x43mm',
        'triple deuce',
      ],
      typicalDistanceLabel: '75 to 250 metres',
      minDistanceMetres: 75,
      maxDistanceMetres: 250,
      notes: 'Classic small-game and varmint cartridge commonly used at short-to-medium ranges.',
    },
    {
      key: '556x45',
      label: '5.56x45',
      aliases: ['5.56', '5.56 nato', '5.56x45', '5.56x45 nato', '5.56x45mm', '556x45mm'],
      typicalDistanceLabel: '75 to 250 metres',
      minDistanceMetres: 75,
      maxDistanceMetres: 250,
      notes: 'Common service-rifle calibre used in suitable lawful field and range contexts.',
    },
    {
      key: '22250rem',
      label: '.22-250 Rem',
      aliases: ['22-250', '.22-250', '22-250 rem', '.22-250 remington', '.22', '22'],
      typicalDistanceLabel: '100 to 350 metres',
      minDistanceMetres: 100,
      maxDistanceMetres: 350,
      notes: 'Typically used for varmint and small game at extended practical distances.',
    },
    {
      key: '243win',
      label: '.243 Win',
      aliases: ['243win', '.243win', '.243 win', '243 win', '.243 winchester', '.243', '243'],
      typicalDistanceLabel: '100 to 300 metres',
      minDistanceMetres: 100,
      maxDistanceMetres: 300,
      notes: 'Commonly used for smaller antelope and medium game where suitable.',
    },
    {
      key: '6mmcreedmoor',
      label: '6mm Creedmoor',
      aliases: ['6mm creedmoor', '6mm cm', '6mm creed'],
      typicalDistanceLabel: '100 to 350 metres',
      minDistanceMetres: 100,
      maxDistanceMetres: 350,
      notes: 'Generally suited to precision-oriented varmint and medium-light game contexts.',
    },
    {
      key: '270win',
      label: '.270 Win',
      aliases: ['270win', '.270win', '.270 win', '270 win', '.270 winchester', '.270', '270'],
      typicalDistanceLabel: '100 to 350 metres',
      minDistanceMetres: 100,
      maxDistanceMetres: 350,
      notes: 'Common medium-game hunting calibre across mixed terrain.',
    },
    {
      key: '270wsm',
      label: '.270 WSM',
      aliases: ['270wsm', '.270 wsm', '270 wsm', '.270', '270'],
      typicalDistanceLabel: '120 to 400 metres',
      minDistanceMetres: 120,
      maxDistanceMetres: 400,
      notes: 'Magnum .270 variant commonly used where longer practical hunting distances are expected.',
    },
    {
      key: '308win',
      label: '.308 Win',
      aliases: [
        '308win',
        '.308win',
        '.308 win',
        '308 win',
        '.308 winchester',
        '.308',
        '308 win rif (7.62x51)',
        '7.62x51',
        '7.62x51mm',
      ],
      typicalDistanceLabel: '80 to 300 metres',
      minDistanceMetres: 80,
      maxDistanceMetres: 300,
      notes: 'Flexible medium-game calibre with broad field applicability.',
    },
    {
      key: '65creedmoor',
      label: '6.5 Creedmoor',
      aliases: ['65creedmoor', '6.5creedmoor', '6.5 creedmoor', '6.5cm', '6.5 creed'],
      typicalDistanceLabel: '100 to 350 metres',
      minDistanceMetres: 100,
      maxDistanceMetres: 350,
      notes: 'Commonly used for medium game and longer practical field distances.',
    },
    {
      key: '65x55',
      label: '6.5x55',
      aliases: ['6.5x55', '6.5 swede', '6.5x55 swedish'],
      typicalDistanceLabel: '100 to 300 metres',
      minDistanceMetres: 100,
      maxDistanceMetres: 300,
      notes: 'Established medium-game calibre with practical field use across varied terrain.',
    },
    {
      key: '2506rem',
      label: '.25-06 Rem',
      aliases: ['25-06', '.25-06', '25-06 rem', '.25-06 remington', '.25', '25'],
      typicalDistanceLabel: '120 to 400 metres',
      minDistanceMetres: 120,
      maxDistanceMetres: 400,
      notes: 'High-velocity calibre often used for open-terrain hunting applications.',
    },
    {
      key: '7mm08rem',
      label: '7mm-08 Rem',
      aliases: ['7mm08rem', '7mm-08rem', '7mm-08 rem', '7mm08 rem', '7mm-08', '7mm08', '7mm remington 08'],
      typicalDistanceLabel: '100 to 300 metres',
      minDistanceMetres: 100,
      maxDistanceMetres: 300,
      notes: 'Common medium-game hunting calibre with manageable recoil.',
    },
    {
      key: '7x57',
      label: '7x57 Mauser',
      aliases: ['7x57', '7mm mauser', '7x57 mauser'],
      typicalDistanceLabel: '100 to 300 metres',
      minDistanceMetres: 100,
      maxDistanceMetres: 300,
      notes: 'Traditional medium-game calibre with broad practical field history.',
    },
    {
      key: '7mmremmag',
      label: '7mm Rem Mag',
      aliases: ['7mm rem mag', '7mm remington magnum', '7mm rm'],
      typicalDistanceLabel: '150 to 450 metres',
      minDistanceMetres: 150,
      maxDistanceMetres: 450,
      notes: 'Magnum hunting calibre commonly selected for longer-distance field use.',
    },
    {
      key: '300blk',
      label: '.300 Blackout',
      aliases: ['300blk', '.300blk', '.300 blackout', '300 blackout', '.300', '300'],
      typicalDistanceLabel: '0 to 200 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 200,
      notes: 'Short-to-medium range calibre commonly used in compact rifle platforms.',
    },
    {
      key: '3006springfield',
      label: '.30-06 Springfield',
      aliases: [
        '30-06',
        '.30-06',
        '30-06 springfield',
        '.30-06 springfield',
        '30.06 springfield',
        '.30-06springfield',
        '30.06springfield',
        '.30',
        '30',
      ],
      typicalDistanceLabel: '100 to 350 metres',
      minDistanceMetres: 100,
      maxDistanceMetres: 350,
      notes: 'Widely used all-round hunting calibre for medium to larger game profiles.',
    },
    {
      key: '303british',
      label: '.303 British',
      aliases: ['303british', '.303 british', '303 british', '.303 brit', '303 brit', '303'],
      typicalDistanceLabel: '100 to 300 metres',
      minDistanceMetres: 100,
      maxDistanceMetres: 300,
      notes: 'Classic medium-game calibre commonly encountered on legacy licensed rifles.',
    },
    {
      key: '300winmag',
      label: '.300 Win Mag',
      aliases: ['300winmag', '.300 win mag', '300 win mag', '.300 winchester magnum', '.300', '300'],
      typicalDistanceLabel: '150 to 500 metres',
      minDistanceMetres: 150,
      maxDistanceMetres: 500,
      notes: 'Magnum calibre commonly selected where longer-range hunting performance is required.',
    },
    {
      key: '300wsm',
      label: '.300 WSM',
      aliases: ['300wsm', '.300 wsm', '300 wsm', '.300', '300'],
      typicalDistanceLabel: '150 to 450 metres',
      minDistanceMetres: 150,
      maxDistanceMetres: 450,
      notes: 'Short magnum calibre typically used for medium-to-longer distance hunting.',
    },
    {
      key: '338lm',
      label: '.338 Lapua Magnum',
      aliases: ['338lm', '.338 lapua', '338 lapua magnum', '.338', '338'],
      typicalDistanceLabel: '250 to 800 metres',
      minDistanceMetres: 250,
      maxDistanceMetres: 800,
      notes: 'Specialized long-range calibre for advanced, lawful precision applications.',
    },
    {
      key: '375hh',
      label: '.375 H&H',
      aliases: ['375hh', '.375 h&h', '375 h&h magnum', '.375 holland holland', '.375', '375'],
      typicalDistanceLabel: '50 to 250 metres',
      minDistanceMetres: 50,
      maxDistanceMetres: 250,
      notes: 'Classic large-game calibre with strong close-to-medium range field use.',
    },
    {
      key: '416rigby',
      label: '.416 Rigby',
      aliases: ['416 rigby', '.416 rigby', '.416', '416'],
      typicalDistanceLabel: '40 to 200 metres',
      minDistanceMetres: 40,
      maxDistanceMetres: 200,
      notes: 'Specialized large-game calibre typically used at moderate field distances.',
    },
    {
      key: '458lott',
      label: '.458 Lott',
      aliases: ['458 lott', '.458 lott', '.458', '458'],
      typicalDistanceLabel: '30 to 150 metres',
      minDistanceMetres: 30,
      maxDistanceMetres: 150,
      notes: 'Specialized dangerous-game calibre intended for short to moderate distances.',
    },
    {
      key: '458winmag',
      label: '.458 Win Mag',
      aliases: ['458 win mag', '.458 winchester magnum', '.458', '458'],
      typicalDistanceLabel: '30 to 150 metres',
      minDistanceMetres: 30,
      maxDistanceMetres: 150,
      notes: 'Specialized large-game calibre generally used in short-to-moderate range contexts.',
    },
    {
      key: '12ga',
      label: '12 GA',
      aliases: ['12ga', '12 ga', '12 g a', '12gauge', '12 gauge', '12 bore', '12 br shotgun'],
      typicalDistanceLabel: '0 to 50 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 50,
      notes: 'Typical slug-use distance profile for lawful field applications.',
    },
    {
      key: '16ga',
      label: '16 GA',
      aliases: ['16ga', '16 ga', '16 g a', '16gauge', '16 gauge', '16 bore'],
      typicalDistanceLabel: '0 to 95 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 95,
      notes: 'Typical slug-use distance profile for lawful field applications.',
    },
    {
      key: '20ga',
      label: '20 GA',
      aliases: ['20ga', '20 ga', '20 g a', '20gauge', '20 gauge', '20 bore'],
      typicalDistanceLabel: '0 to 50 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 50,
      notes: 'Typical slug-use distance profile for lawful field applications.',
    },
    {
      key: '28ga',
      label: '28 GA',
      aliases: ['28ga', '28 ga', '28 g a', '28gauge', '28 gauge', '28 bore'],
      typicalDistanceLabel: '0 to 75 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 75,
      notes: 'Typical short-range shotgun profile where lawful and suitable.',
    },
    {
      key: '410ga',
      label: '.410 Bore',
      aliases: ['410', '.410', '.410 bore', '410 bore', '410ga', '410 ga', '410 g a', '410 gauge'],
      typicalDistanceLabel: '0 to 60 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 60,
      notes: 'Typical short-range profile for .410 bore shotgun use.',
    },
    {
      key: '9mm',
      label: '9mm',
      aliases: [
        '9mm',
        '9 mm',
        '9x19',
        '9x19mm',
        '9mmp',
        '9mm par (9x19mm)',
        '9mm par',
        '9mm luger',
        '9mm parabellum',
      ],
      typicalDistanceLabel: '0 to 50 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 50,
      notes: 'Handgun defensive and practical-training contexts are generally close range.',
    },
    {
      key: '25acp',
      label: '.25 ACP',
      aliases: ['25acp', '.25 acp', '25 auto', '.25', '25'],
      typicalDistanceLabel: '0 to 25 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 25,
      notes: 'Compact defensive handgun calibre typically used at very short range.',
    },
    {
      key: '32acp',
      label: '.32 ACP',
      aliases: ['32acp', '.32 acp', '7.65 browning', '.32', '32'],
      typicalDistanceLabel: '0 to 30 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 30,
      notes: 'Defensive handgun calibre commonly associated with short-range use.',
    },
    {
      key: '380acp',
      label: '.380 ACP',
      aliases: ['380acp', '.380 acp', '9mm short', '9mm kurz', '.380', '380'],
      typicalDistanceLabel: '0 to 40 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 40,
      notes: 'Defensive handgun calibre typically used at close to moderate short range.',
    },
    {
      key: '357sig',
      label: '.357 SIG',
      aliases: ['357sig', '.357 sig', '.357', '357'],
      typicalDistanceLabel: '0 to 50 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 50,
      notes: 'Service handgun calibre generally used in close-range defensive contexts.',
    },
    {
      key: '38spl',
      label: '.38 Special',
      aliases: ['38spl', '.38 special', '38 special', '.38', '38'],
      typicalDistanceLabel: '0 to 50 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 50,
      notes: 'Common revolver calibre for defensive and range use at short distance.',
    },
    {
      key: '357mag',
      label: '.357 Magnum',
      aliases: ['357mag', '.357 magnum', '.357magnum', '357 magnum', '357magnum', '.357 mag', '.357mag'],
      typicalDistanceLabel: '0 to 75 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 75,
      notes: 'Revolver calibre with practical use from close range out to extended handgun distances.',
    },
    {
      key: '22hornet',
      label: '.22 Hornet',
      aliases: ['22hornet', '.22hornet', '.22 hornet', '22 hornet', '.22', '22'],
      typicalDistanceLabel: '75 to 200 metres',
      minDistanceMetres: 75,
      maxDistanceMetres: 200,
      notes: 'Small-game and varmint rifle calibre suited to short-to-medium field distances.',
    },
    {
      key: '93x62mauser',
      label: '9.3x62 Mauser',
      aliases: ['9.3x62', '9.3x62mm', '9.3x62 mauser', '9.3x62mm mauser'],
      typicalDistanceLabel: '50 to 250 metres',
      minDistanceMetres: 50,
      maxDistanceMetres: 250,
      notes: 'Medium-to-large game rifle calibre with practical use at moderate hunting distances.',
    },
    {
      key: '32revolver',
      label: '.32 Revolver',
      aliases: ['32 revolver', '.32 revolver', '.32', '32'],
      typicalDistanceLabel: '0 to 50 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 50,
      notes: 'Legacy revolver designation used for short-range defensive and range contexts.',
    },
    {
      key: '40sw',
      label: '.40 S&W',
      aliases: ['40sw', '.40 s&w', '40 smith wesson', '.40', '40'],
      typicalDistanceLabel: '0 to 50 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 50,
      notes: 'Defensive/service handgun calibre typically used at close practical distances.',
    },
    {
      key: '10mm',
      label: '10mm Auto',
      aliases: ['10mm', '10mm auto'],
      typicalDistanceLabel: '0 to 75 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 75,
      notes: 'Higher-energy handgun calibre suited to short to extended practical handgun distances.',
    },
    {
      key: '45acp',
      label: '.45 ACP',
      aliases: ['45acp', '.45 acp', '45 auto', '.45', '45'],
      typicalDistanceLabel: '0 to 50 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 50,
      notes: 'Widely used defensive handgun calibre in close-range contexts.',
    },
    {
      key: '44mag',
      label: '.44 Magnum',
      aliases: ['44mag', '.44 magnum', '.44', '44'],
      typicalDistanceLabel: '0 to 100 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 100,
      notes: 'High-energy revolver calibre with extended practical handgun range.',
    },
    {
      key: '454casull',
      label: '.454 Casull',
      aliases: ['454 casull', '.454 casull', '.454', '454'],
      typicalDistanceLabel: '0 to 125 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 125,
      notes: 'Specialized high-energy revolver calibre with extended effective handgun range.',
    },
    {
      key: '500sw',
      label: '.500 S&W',
      aliases: ['500sw', '.500 s&w', '500 smith wesson', '.500', '500'],
      typicalDistanceLabel: '0 to 125 metres',
      minDistanceMetres: 0,
      maxDistanceMetres: 125,
      notes: 'Specialized large-bore revolver calibre typically used at short to extended handgun distances.',
    },
  ] as Omit<FactCalibreCatalogRecord, 'distanceBand'>[]).map((entry) => ({
    ...entry,
    distanceBand: resolveDistanceBandFromMaxDistance(entry.maxDistanceMetres),
  })),
  sightingCatalog: [
    {
      system: 'iron_sights',
      label: 'iron sights',
      aliases: ['iron sights', 'open sights', 'fixed sights'],
      selfDefenceRationale:
        'it remains simple, durable, and immediately usable in close-range defensive circumstances with minimal setup dependency',
      huntingRationale:
        'it provides practical target acquisition in field conditions where straightforward, reliable sight alignment is required',
      sportShootingRationale:
        'it supports repeatable fundamentals and consistent marksmanship development in structured range practice',
    },
    {
      system: 'scope',
      label: 'scope',
      aliases: ['scope', 'telescopic sight', 'optical scope'],
      selfDefenceRationale:
        'it can support clear sight picture and controlled shot placement where lawful defensive use requires deliberate visual confirmation',
      huntingRationale:
        'it supports more precise shot placement and clearer target identification at expected field distances',
      sportShootingRationale:
        'it supports precision-oriented discipline performance with improved target definition and repeatable aiming reference',
    },
    {
      system: 'red_dot',
      label: 'red dot',
      aliases: ['red dot', 'red-dot sight', 'reflex sight'],
      selfDefenceRationale:
        'it supports rapid sight acquisition and practical close-range alignment under defensive time pressure',
      huntingRationale:
        'it supports practical, fast target acquisition in short-to-moderate range hunting conditions',
      sportShootingRationale:
        'it supports fast transitions, controlled follow-up engagement, and practical stage efficiency in dynamic disciplines',
    },
    {
      system: 'mixed',
      label: 'mixed sighting setup',
      aliases: ['mixed', 'mixed sighting', 'mixed setup'],
      selfDefenceRationale:
        'it allows lawful defensive use to remain adaptable across practical scenarios requiring either speed or precision emphasis',
      huntingRationale:
        'it allows hunting use to remain adaptable across changing terrain, distance, and field visibility conditions',
      sportShootingRationale:
        'it allows participation across multiple disciplines with different sighting demands while maintaining practical consistency',
    },
  ],
  facts: [
    NATIONAL_VIOLENT_CRIME_FACT,
    FEMALE_SELF_DEFENCE_CONTEXT_FACT,
    ...PROVINCIAL_SELF_DEFENCE_CRIME_FACTS,
    {
      id: 'handgun_platform_self_defence',
      category: 'firearm_platform_guidance',
      contextType: 'self_defence',
      title: 'Handgun platform suitability for self-defence',
      summary:
        'A handgun platform is generally suitable for lawful self-defence where portability, accessibility, and responsible everyday control are relevant considerations.',
      wording:
        'A handgun platform is generally well suited to lawful self-defence because it offers practical portability, accessibility, and responsible controllability in circumstances where immediate defensive action may be required.',
      jurisdiction: {
        type: 'none',
      },
      firearmType: 'handgun',
      useContexts: ['self_defence'],
      tags: ['platform', 'self_defence', 'handgun'],
      usage: {
        sectionIds: ['S10'],
        sectionTypes: ['s13'],
        contextTypes: ['self_defence'],
        priority: 12,
      },
      source: {
        id: 'general_handgun_self_defence_guidance',
        title: 'Curated internal firearm platform guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General platform guidance for lawful self-defence. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'shotgun_platform_self_defence',
      category: 'firearm_platform_guidance',
      contextType: 'self_defence',
      title: 'Shotgun platform suitability for self-defence',
      summary:
        'A shotgun platform may be suitable for self-defence where close-range defensive use, safe handling, and practical control are relevant considerations.',
      wording:
        'A shotgun platform is suitable for lawful self-defence where close-range defensive use, responsible handling, and practical controllability are relevant to the applicant’s protective needs.',
      jurisdiction: {
        type: 'none',
      },
      firearmType: 'shotgun',
      useContexts: ['self_defence'],
      tags: ['platform', 'self_defence', 'shotgun'],
      usage: {
        sectionIds: ['S10'],
        sectionTypes: ['s13'],
        contextTypes: ['self_defence'],
        priority: 12,
      },
      source: {
        id: 'general_shotgun_self_defence_guidance',
        title: 'Curated internal firearm platform guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General shotgun platform guidance for lawful self-defence. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'calibre_self_defence_suitability',
      category: 'calibre_guidance',
      contextType: 'self_defence',
      title: 'Calibre suitability for self-defence',
      summary:
        'The selected calibre may be assessed for self-defence suitability with reference to controllability, practical handling, and reliable defensive use.',
      wording:
        'The ${firearmCalibre} calibre is suitable for lawful self-defence because it supports practical controllability, dependable defensive capability, and consistent handling in the selected defensive platform.',
      jurisdiction: {
        type: 'none',
      },
      useContexts: ['self_defence'],
      tags: ['calibre', 'self_defence'],
      usage: {
        sectionIds: ['S12'],
        sectionTypes: ['s13'],
        contextTypes: ['self_defence'],
        priority: 15,
      },
      source: {
        id: 'general_calibre_guidance_self_defence_handgun',
        title: 'Curated internal calibre guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General self-defence calibre guidance for handgun applications. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'sighting_self_defence_suitability',
      category: 'firearm_platform_guidance',
      contextType: 'self_defence',
      title: 'Sighting-system suitability for self-defence',
      summary:
        'The selected sighting system may be assessed for lawful self-defence suitability with reference to practical acquisition, control, and safe use.',
      wording:
        'For self-defence, the ${sightingSystemLabel} selected on the ${firearmDescription} is suitable because ${sightingUseRationale}.',
      jurisdiction: {
        type: 'none',
      },
      useContexts: ['self_defence'],
      tags: ['sighting', 'self_defence'],
      usage: {
        sectionIds: ['S12'],
        sectionTypes: ['s13'],
        contextTypes: ['self_defence'],
        requiresSightingSystem: true,
        priority: 14,
      },
      source: {
        id: 'general_sighting_guidance_self_defence',
        title: 'Curated internal sighting-system guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General self-defence sighting guidance. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'rifle_hunting_platform',
      category: 'firearm_platform_guidance',
      contextType: 'hunting',
      title: 'Rifle platform suitability for hunting',
      summary:
        'A rifle platform is commonly suited to hunting because it supports deliberate shot placement, range capability, and practical field use.',
      wording:
        'A rifle platform is commonly suited to hunting because it supports deliberate shot placement, appropriate range capability, pin-point accuracy, and practical use in field conditions relevant to hunting activities.',
      jurisdiction: {
        type: 'none',
      },
      firearmType: 'rifle',
      useContexts: ['hunting'],
      tags: ['platform', 'hunting', 'rifle'],
      usage: {
        sectionIds: ['S10'],
        sectionTypes: ['s15'],
        contextTypes: ['hunting'],
        priority: 12,
      },
      source: {
        id: 'general_rifle_hunting_guidance',
        title: 'Curated internal firearm platform guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General hunting platform guidance. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'shotgun_hunting_platform',
      category: 'firearm_platform_guidance',
      contextType: 'hunting',
      title: 'Shotgun platform suitability for hunting',
      summary:
        'A shotgun platform is commonly suited to hunting where short-range field use, moving targets, and species-appropriate load selection are relevant.',
      wording:
        'A shotgun platform is commonly suited to hunting where short-to-moderate range field use and appropriate load selection are required for the intended species and conditions.',
      jurisdiction: {
        type: 'none',
      },
      firearmType: 'shotgun',
      useContexts: ['hunting'],
      tags: ['platform', 'hunting', 'shotgun'],
      usage: {
        sectionIds: ['S10'],
        sectionTypes: ['s15'],
        contextTypes: ['hunting'],
        priority: 12,
      },
      source: {
        id: 'general_shotgun_hunting_guidance',
        title: 'Curated internal firearm platform guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General hunting platform guidance for shotgun applications. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'calibre_hunting_suitability',
      category: 'calibre_guidance',
      contextType: 'hunting',
      title: 'Calibre suitability for hunting',
      summary:
        'The selected calibre may be assessed for hunting suitability with reference to species and expected field distance.',
      wording:
        'The ${firearmCalibre} calibre is widely used for hunting due to its versatility, effectiveness, and suitability for ${huntingSpeciesSummary} at ${huntingDistanceSummary}.',
      jurisdiction: {
        type: 'none',
      },
      useContexts: ['hunting'],
      tags: ['calibre', 'hunting'],
      usage: {
        sectionIds: ['S12'],
        sectionTypes: ['s15', 's16'],
        contextTypes: ['hunting', 'mixed_hunting_sport'],
        priority: 15,
      },
      source: {
        id: 'general_calibre_guidance_hunting_rifle',
        title: 'Curated internal calibre guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'Not sourced from SAPS crime statistics. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'sighting_hunting_suitability',
      category: 'hunting_guidance',
      contextType: 'hunting',
      title: 'Sighting-system suitability for hunting',
      summary:
        'The selected sighting system may be assessed for hunting suitability with reference to practical target acquisition and field-use conditions.',
      wording:
        'For hunting, the ${sightingSystemLabel} selected on the ${firearmDescription} is suitable because ${sightingUseRationale}.',
      jurisdiction: {
        type: 'none',
      },
      useContexts: ['hunting', 'general'],
      tags: ['sighting', 'hunting'],
      usage: {
        sectionIds: ['S12'],
        sectionTypes: ['s15', 's16'],
        contextTypes: ['hunting', 'mixed_hunting_sport'],
        requiresSightingSystem: true,
        priority: 14,
      },
      source: {
        id: 'general_sighting_guidance_hunting',
        title: 'Curated internal sighting-system guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General hunting sighting guidance. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'sport_shooting_participation_context',
      category: 'sport_shooting_guidance',
      contextType: 'sport_shooting',
      title: 'Sport shooting participation',
      summary:
        'Participation in organised sport shooting requires appropriate and suitable firearms for specific disciplines.',
      wording:
        'Participation in organised sport shooting requires the use of appropriate and suitable firearms aligned with the specific discipline and performance requirements.',
      jurisdiction: {
        type: 'none',
      },
      tags: ['sport', 'participation'],
      usage: {
        sectionIds: ['S11'],
        sectionTypes: ['s15', 's16'],
        contextTypes: ['sport_shooting', 'mixed_hunting_sport'],
        priority: 10,
      },
      source: {
        id: 'sport_general_guidance',
        title: 'Curated internal sport shooting guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'Not sourced from SAPS crime statistics. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'sport_precision_rimfire_context',
      category: 'calibre_guidance',
      contextType: 'sport_shooting',
      title: 'Precision rimfire suitability for sport shooting and training',
      summary:
        'Rimfire calibres are widely used in precision-focused sport shooting and training because they support regular practice and practical consistency.',
      wording:
        'In the context of precision rimfire sport shooting, the ${firearmDescription} in calibre ${firearmCalibre} is well suited to lawful training and participation because it supports manageable recoil, consistent handling, and repeatable accuracy in disciplines where precision and repetition are central.',
      jurisdiction: {
        type: 'none',
      },
      calibre: '22lr',
      firearmType: 'rifle',
      useContexts: ['sport_shooting'],
      tags: ['calibre', 'sport_shooting', 'training', 'rimfire', 'precision_rimfire'],
      usage: {
        sectionIds: ['S11', 'S12'],
        sectionTypes: ['s15', 's16'],
        contextTypes: ['sport_shooting', 'mixed_hunting_sport'],
        priority: 16,
      },
      source: {
        id: 'general_calibre_guidance_precision_rimfire',
        title: 'Curated internal precision-rimfire guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General precision-rimfire sport and training guidance. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'sport_general_range_context',
      category: 'calibre_guidance',
      contextType: 'sport_shooting',
      title: 'General range practice suitability for sport shooting',
      summary:
        'General range-practice participation requires a practical calibre and platform combination that supports regular, lawful training repetition.',
      wording:
        'For general range practice, the ${firearmDescription} in calibre ${firearmCalibre} is suitable for sport shooting participation because it supports repeatable handling, practical controllability, and consistent training progression.',
      jurisdiction: {
        type: 'none',
      },
      useContexts: ['sport_shooting'],
      tags: ['calibre', 'sport_shooting', 'training', 'general_range_practice'],
      usage: {
        sectionIds: ['S11', 'S12'],
        sectionTypes: ['s15', 's16'],
        contextTypes: ['sport_shooting', 'mixed_hunting_sport'],
        priority: 16,
      },
      source: {
        id: 'general_calibre_guidance_general_range',
        title: 'Curated internal general range-practice guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General range-practice sport and training guidance. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'sport_club_competition_context',
      category: 'calibre_guidance',
      contextType: 'sport_shooting',
      title: 'Club-competition suitability for sport shooting',
      summary:
        'Club-level sport shooting competition requires a calibre and platform combination suited to lawful discipline participation and repeatable match use.',
      wording:
        'For club-level competition, the ${firearmDescription} in calibre ${firearmCalibre} is suitable for sport shooting use because it supports practical reliability, consistent performance, and effective participation under structured match conditions.',
      jurisdiction: {
        type: 'none',
      },
      useContexts: ['sport_shooting'],
      tags: ['calibre', 'sport_shooting', 'competition', 'club_competition'],
      usage: {
        sectionIds: ['S11', 'S12'],
        sectionTypes: ['s15', 's16'],
        contextTypes: ['sport_shooting', 'mixed_hunting_sport'],
        priority: 16,
      },
      source: {
        id: 'general_calibre_guidance_club_competition',
        title: 'Curated internal club-competition guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General club-competition sport shooting guidance. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'sport_practical_rifle_context',
      category: 'calibre_guidance',
      contextType: 'sport_shooting',
      title: 'Practical-firearm-shooting suitability for sport shooting',
      summary:
        'Practical-firearm-shooting participation requires a calibre and platform combination that supports safe, lawful stage execution and repeatable control.',
      wording:
        'For practical-firearm-shooting participation, the ${firearmDescription} in calibre ${firearmCalibre} is suitable for sport shooting use because it supports controlled stage handling, repeatable transitions, and consistent performance across practical drills.',
      jurisdiction: {
        type: 'none',
      },
      useContexts: ['sport_shooting'],
      tags: ['calibre', 'sport_shooting', 'practical_rifle'],
      usage: {
        sectionIds: ['S11', 'S12'],
        sectionTypes: ['s15', 's16'],
        contextTypes: ['sport_shooting', 'mixed_hunting_sport'],
        priority: 16,
      },
      source: {
        id: 'general_calibre_guidance_practical_rifle',
        title: 'Curated internal practical-firearm-shooting guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General practical-firearm-shooting guidance. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'sport_steel_challenge_context',
      category: 'calibre_guidance',
      contextType: 'sport_shooting',
      title: 'Steel-challenge suitability for sport shooting',
      summary:
        'Steel-target sport participation requires a calibre and platform combination suited to lawful, repeatable target engagement and controlled follow-up shooting.',
      wording:
        'For steel-target participation, the ${firearmDescription} in calibre ${firearmCalibre} is suitable for sport shooting use because it supports controlled target engagement, practical follow-up capability, and consistent stage performance.',
      jurisdiction: {
        type: 'none',
      },
      useContexts: ['sport_shooting'],
      tags: ['calibre', 'sport_shooting', 'steel_challenge'],
      usage: {
        sectionIds: ['S11', 'S12'],
        sectionTypes: ['s15', 's16'],
        contextTypes: ['sport_shooting', 'mixed_hunting_sport'],
        priority: 16,
      },
      source: {
        id: 'general_calibre_guidance_steel_challenge',
        title: 'Curated internal steel-target guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General steel-target sport shooting guidance. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'shotgun_sport_shooting_platform',
      category: 'calibre_guidance',
      contextType: 'sport_shooting',
      title: 'Shotgun sport shooting platform suitability',
      summary:
        'Shotgun configurations in common gauges are widely used for sport shooting where practical controllability and discipline fit are required.',
      wording:
        'A ${firearmCalibre} shotgun configuration is widely used in sport shooting because it supports practical controllability, ammunition availability, and suitability for a broad range of shotgun disciplines and range activities.',
      jurisdiction: {
        type: 'none',
      },
      firearmType: 'shotgun',
      useContexts: ['sport_shooting', 'general'],
      tags: ['calibre', 'shotgun', 'sport-use', 'platform'],
      usage: {
        sectionIds: ['S11', 'S12'],
        sectionTypes: ['s15', 's16'],
        contextTypes: ['sport_shooting', 'mixed_hunting_sport'],
        priority: 17,
      },
      source: {
        id: 'saami_shotshell_sport_guidance_general',
        title: 'SAAMI shotshell gauge nomenclature references',
        sourceType: 'association_guidance',
        publisher: "Sporting Arms and Ammunition Manufacturers' Institute (SAAMI)",
        url: SAAMI_GAUGE_GLOSSARY_URL,
        notes: `SAAMI uses standard gauge naming in shotshell references (${SAAMI_SHOTSHELL_STANDARD_URL}), while commercial ammunition commonly abbreviates these gauges as "ga" (${WINCHESTER_SHOTSHELL_NOTATION_URL}).`,
      },
      reviewStatus: 'approved',
    },
    {
      id: 'rifle_sport_shooting_platform',
      category: 'calibre_guidance',
      contextType: 'sport_shooting',
      title: 'Rifle sport shooting platform suitability',
      summary:
        'Rifle configurations are widely used for sport shooting where practical stability, controllability, and discipline-specific accuracy are required.',
      wording:
        'A ${firearmCalibre} rifle configuration is widely used in sport shooting because it supports stable shot execution, practical controllability, and consistent discipline-specific performance across range activities.',
      jurisdiction: {
        type: 'none',
      },
      firearmType: 'rifle',
      useContexts: ['sport_shooting', 'general'],
      tags: ['calibre', 'rifle', 'sport-use', 'platform'],
      usage: {
        sectionIds: ['S11', 'S12'],
        sectionTypes: ['s15', 's16'],
        contextTypes: ['sport_shooting', 'mixed_hunting_sport'],
        priority: 17,
      },
      source: {
        id: 'general_rifle_sport_guidance',
        title: 'Curated internal rifle sport shooting guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General rifle platform guidance for sport shooting applications. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'handgun_sport_shooting_platform',
      category: 'calibre_guidance',
      contextType: 'sport_shooting',
      title: 'Handgun sport shooting platform suitability',
      summary:
        'Handgun configurations are widely used for sport shooting where practical handling, target transitions, and repeatable control are required.',
      wording:
        'A ${firearmCalibre} handgun configuration is widely used in sport shooting because it supports practical handling, controlled follow-up engagement, and consistent participation in handgun-focused range disciplines.',
      jurisdiction: {
        type: 'none',
      },
      firearmType: 'handgun',
      useContexts: ['sport_shooting', 'general'],
      tags: ['calibre', 'handgun', 'sport-use', 'platform'],
      usage: {
        sectionIds: ['S11', 'S12'],
        sectionTypes: ['s15', 's16'],
        contextTypes: ['sport_shooting', 'mixed_hunting_sport'],
        priority: 17,
      },
      source: {
        id: 'general_handgun_sport_guidance',
        title: 'Curated internal handgun sport shooting guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General handgun platform guidance for sport shooting applications. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },
    {
      id: 'sighting_sport_shooting_suitability',
      category: 'sport_shooting_guidance',
      contextType: 'sport_shooting',
      title: 'Sighting-system suitability for sport shooting',
      summary:
        'The selected sighting system may be assessed for sport shooting suitability with reference to discipline use, practical transitions, and controlled engagement.',
      wording:
        'For sport shooting, the ${sightingSystemLabel} selected on the ${firearmDescription} is suitable because ${sightingUseRationale}.',
      jurisdiction: {
        type: 'none',
      },
      useContexts: ['sport_shooting', 'general'],
      tags: ['sighting', 'sport_shooting'],
      usage: {
        sectionIds: ['S11', 'S12'],
        sectionTypes: ['s15', 's16'],
        contextTypes: ['sport_shooting', 'mixed_hunting_sport'],
        requiresSightingSystem: true,
        priority: 14,
      },
      source: {
        id: 'general_sighting_guidance_sport_shooting',
        title: 'Curated internal sighting-system guidance (requires external source review)',
        sourceType: 'curated_internal',
        notes:
          'General sport shooting sighting guidance. Keep under review until external technical source references are added.',
      },
      reviewStatus: 'approved',
    },

  ],
};

export function resolveSightingCatalogRecord(
  system?: string
): FactSightingCatalogRecord | undefined {
  if (!system) return undefined;

  const normalized = system.trim().toLowerCase();
  if (!normalized) return undefined;

  return factBank.sightingCatalog?.find((entry) => {
    if (entry.system === normalized) return true;
    return (entry.aliases ?? []).some((alias) => alias.trim().toLowerCase() === normalized);
  });
}

export function resolveCalibreCatalogRecord(
  calibre?: string
): FactCalibreCatalogRecord | undefined {
  return resolveCalibreCatalogRecordFromList(calibre, factBank.calibreCatalog);
}

export function resolveHuntingSpeciesGroupsForCalibre(
  calibre?: string
): FactSpeciesGroupRecord[] {
  const calibreRecord = resolveCalibreCatalogRecord(calibre);
  if (!calibreRecord) return [];
  return (
    factBank.huntingSpeciesGroups?.filter((group) =>
      group.calibreKeys.includes(calibreRecord.key)
    ) ?? []
  );
}

export function resolveSightingUseRationale(input: {
  system?: string;
  purposeType: MotivationPurposeType;
}): { sightingSystemLabel: string; sightingUseRationale: string } {
  const record = resolveSightingCatalogRecord(input.system);

  if (!record) {
    return {
      sightingSystemLabel: 'selected sighting system',
      sightingUseRationale:
        'it supports lawful, practical, and controlled use in the context of the intended application',
    };
  }

  if (input.purposeType === 'self_defence') {
    return {
      sightingSystemLabel: record.label,
      sightingUseRationale: record.selfDefenceRationale,
    };
  }
  if (input.purposeType === 'hunting') {
    return {
      sightingSystemLabel: record.label,
      sightingUseRationale: record.huntingRationale,
    };
  }
  if (input.purposeType === 'mixed_hunting_sport') {
    return {
      sightingSystemLabel: record.label,
      sightingUseRationale: `${record.huntingRationale}, while also supporting disciplined and repeatable range participation`,
    };
  }
  return {
    sightingSystemLabel: record.label,
    sightingUseRationale: record.sportShootingRationale,
  };
}

export default factBank;
