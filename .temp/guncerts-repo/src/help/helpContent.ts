import helpPolicyJson from './help.json';
import type { ApplicationIntent, ApplicationTypePreference, WelcomeFlowPreference } from '../data/types';

export type HelpSection =
  | { type: 'heading'; items: string[] }
  | { type: 'paragraph'; items: string[] }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: string[] }
  | { type: 'subheading'; text: string }
  | { type: 'links'; items: HelpLink[] };

export type HelpLink = {
  ref: string;
  text: string;
  href: string;
  rel?: string;
  analyticsId?: string;
};

export type HelpTopic = {
  key: string;
  heading: string;
  audience: string[];
  sections: HelpSection[];
};

export type HelpPolicy = {
  type: string;
  schemaVersion: string;
  jurisdiction: string;
  locale: string;
  version: string;
  effectiveFrom: string;
  lastUpdated: string;
  a11y?: {
    minContrastRatio?: number;
    allowMarkdown?: boolean;
  };
  theme?: {
    disabledColors?: Record<string, string>;
    helpColors?: Record<string, string>;
  };
  topics: Record<string, HelpTopicDefinition>;
  links: Record<string, HelpLinkDefinition>;
};

export type WelcomeHelpContext = {
  mode: 'demo' | 'new' | 'renewal' | 'unknown';
  applicationIntent?: ApplicationIntent;
  applicationType?: ApplicationTypePreference;
  welcomeFlow?: WelcomeFlowPreference;
};

type HelpTopicDefinition = {
  key: string;
  heading: string;
  audience: string[];
  sections: HelpSectionDefinition[];
};

type HelpSectionDefinition =
  | { type: 'heading'; items: string[] }
  | { type: 'paragraph'; items: string[] }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: string[] }
  | { type: 'subheading'; text: string }
  | { type: 'links'; items: { ref: string }[] };

type HelpLinkDefinition = {
  text: string;
  href: string;
  rel?: string;
  analyticsId?: string;
};

const helpPolicy = helpPolicyJson as HelpPolicy;

const resolveSections = (sections: HelpSectionDefinition[]): HelpSection[] =>
  sections.map((section) => {
    if (section.type !== 'links') {
      return section as HelpSection;
    }

    const resolved = section.items
      .map((item) => {
        const link = helpPolicy.links[item.ref];
        if (!link) {
          return undefined;
        }
        return { ref: item.ref, ...link };
      })
      .filter((link): link is HelpLink => Boolean(link));

    return { type: 'links', items: resolved };
  });

const paragraph = (...items: string[]): HelpSection => ({ type: 'paragraph', items });
const heading = (...items: string[]): HelpSection => ({ type: 'heading', items });
const subheading = (text: string): HelpSection => ({ type: 'subheading', text });
const bullets = (...items: string[]): HelpSection => ({ type: 'bullets', items });

const runtimeTopics: HelpTopic[] = [
  {
    key: 'helpDocsGeneralUpload',
    heading: 'Document guidance',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to add clear, readable copies of the required documents.',
        'You can scan with the camera, select from library, or upload a file depending on the document type.'
      ),
      bullets(
        'Ensure the full page is visible and text is readable.',
        'Avoid glare, blur, and clipped edges.',
        'If a document has front and back, include both sides when required.'
      ),
    ],
  },
  {
    key: 'helpDocsTrainingCert',
    heading: 'Training certificates',
    audience: ['holder'],
    sections: [
      paragraph(
        'Add certified copy/copies of accredited firearm training certificates relevant to this competency application.'
      ),
      bullets(
        'Upload the training certificates that match the competency categories selected in the SAPS-517 form.',
        'Keep originals available for submission if requested by your DFO.'
      ),
    ],
  },
  {
    key: 'helpDocsStatementOfResults',
    heading: 'Statement of results',
    audience: ['holder'],
    sections: [
      paragraph(
        'Add your PFTC/SASSETA statement of results where available.'
      ),
      bullets(
        'If available, include a certified copy.',
        'If not available, you may continue and submit other required documents.'
      ),
    ],
  },
  {
    key: 'helpMotivationSetupFirearm',
    heading: 'Motivation setup: firearm',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to choose the firearm for this motivation.',
        'Each application firearm should have its own motivation, but you should still confirm any local DFO expectations before submission.'
      ),
      heading('What this card covers'),
      bullets(
        'The selected firearm sets the motivation section and pulls through details such as calibre and action where they already exist in your data.',
        'Choose carefully because the rest of the wizard adapts to the selected firearm.'
      ),
    ],
  },
  {
    key: 'helpMotivationSetupApplicationS13',
    heading: 'Motivation setup: section 13 application details',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to confirm the personal details that shape a section 13 self-defence motivation.',
        'The fields on this card feed the context paragraphs rather than replacing the legal self-defence basis.'
      ),
      subheading('Occupation'),
      bullets('This helps the motivation explain your routine, movement pattern, or work circumstances where that is relevant.'),
      subheading('Province'),
      bullets('This is used to select the provincial crime-stat context that supports the self-defence risk discussion.'),
      subheading('Association / club'),
      bullets('Any selected association or club can support your general firearm background, but it is not the main basis for a section 13 motivation.'),
    ],
  },
  {
    key: 'helpMotivationSetupApplicationS15',
    heading: 'Motivation setup: section 15 application details',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to shape the occasional-use structure of a section 15 motivation.',
        'This card captures applicant context and supporting profile details used by the motivation.'
      ),
      subheading('Occupation'),
      bullets('This can add practical background where your work routine supports your experience or regular lawful firearm use.'),
      subheading('Home type'),
      bullets('This gives additional residential context used by storage and suitability-related parts of the motivation.'),
      subheading('Home security'),
      bullets('Select the security measures that are actually present so the security context remains accurate and defensible.'),
      subheading('Association / club'),
      bullets('Selected memberships can support participation history and background, even where dedicated status is not the legal basis of the application.'),
    ],
  },
  {
    key: 'helpMotivationSetupApplicationS16',
    heading: 'Motivation setup: section 16 application details',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to shape the dedicated-use structure of a section 16 motivation.',
        'This card captures applicant context and supporting profile details used by the motivation.'
      ),
      subheading('Occupation'),
      bullets('This can add background context, but the core section 16 basis remains your dedicated activity and supporting participation detail.'),
      subheading('Home type'),
      bullets('This gives additional residential context used by storage and suitability-related parts of the motivation.'),
      subheading('Home security'),
      bullets('Select the security measures that are actually present so the security context remains accurate and defensible.'),
      subheading('Association / club'),
      bullets('Selected memberships help the motivation reflect the clubs or associations that support your dedicated participation context.'),
    ],
  },
  {
    key: 'helpMotivationFirearmFit',
    heading: 'Motivation: firearm fit',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to explain why the selected firearm is a practical fit for the role described in the motivation.',
        'These selections help the motivation describe suitability in plain, defensible terms.'
      ),
      subheading('Firearm fit'),
      paragraph('Choose the traits that are genuinely relevant to the selected firearm.'),
      subheading('Firearm purpose'),
      bullets(
        '**Hunting** focuses the motivation on hunting use and field suitability.',
        '**Sport shooting** focuses the motivation on sport participation and range use.',
        '**Mixed / both** keeps both hunting and sport use in view where the firearm genuinely supports both roles.'
      ),
      subheading('Sighting system'),
      bullets(
        '**Iron sights** means the firearm is used with the built-in front and rear sights and no optic fitted.',
        '**Scope** means the firearm has a magnified optic (or scope) fitted for clearer aiming at longer or variable distances.',
        '**Red dot** means the firearm has a non-magnified red-dot optic fitted for quicker target acquisition.',
        '**Mixed** means more than one sighting setup is used on this firearm (for example irons in some contexts and an optic in others).'
      ),
      bullets(
        '**Reliable** supports a statement that the firearm is dependable for its intended lawful use.',
        '**Accurate** supports a statement that the firearm is capable of precise shot placement within its role.',
        '**Portable** supports a statement that the firearm is practical to carry or move with in normal use.',
        '**Low ammo cost** supports a statement that the firearm is affordable to train with regularly.',
        '**Training friendly** supports a statement that the firearm is suitable for regular familiarisation and practice.',
        '**Field practical** supports a statement that the firearm is workable in normal hunting or outdoor conditions.',
        '**Humane application** supports a statement that the firearm can be used responsibly and ethically within its limits.'
      ),
      subheading('Fit note'),
      bullets('Use this note only if a short plain-language explanation will improve the suitability paragraph.'),
    ],
  },
  {
    key: 'helpMotivationFirearmFitS13',
    heading: 'Motivation: firearm fit',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to explain why the selected firearm is a practical fit for lawful self-defence.',
        'These selections help the motivation describe suitability in clear, defensible terms without introducing hunting or range-specific language.'
      ),
      subheading('Firearm fit'),
      paragraph('Choose the traits that are genuinely relevant to the selected self-defence firearm.'),
      bullets(
        '**Reliable** supports a statement that the firearm is dependable for its intended lawful use.',
        '**Accurate** supports a statement that the firearm allows controlled, responsible shot placement.',
        '**Portable** supports a statement that the firearm is practical for routine lawful carry or readiness.',
        '**Low ammo cost** supports a statement that the firearm can be trained with regularly and affordably.',
        '**Training friendly** supports a statement that the firearm is suitable for regular familiarisation and practice.'
      ),
      subheading('Sighting system'),
      bullets(
        '**Iron sights** means the firearm is used with the built-in front and rear sights and no optic fitted.',
        '**Scope** means the firearm has a magnified optic (or scope) fitted.',
        '**Red dot** means the firearm has a non-magnified red-dot optic fitted.',
        '**Mixed** means more than one sighting setup is used on this firearm (for example irons in some contexts and an optic in others).'
      ),
      subheading('Fit note'),
      bullets('Use this note only if a short plain-language explanation will improve the suitability paragraph.')
    ],
  },
  {
    key: 'helpMotivationExistingFirearmsS13',
    heading: 'Motivation: existing firearms for section 13',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to explain why the rest of your firearm portfolio does not remove the ongoing need for the selected self-defence firearm.',
        'The goal is not to list every firearm mechanically, but to compare the ones that are actually relevant.'
      ),
      subheading('No other firearms are relevant'),
      bullets('Use this option when you have other firearms in your portfolio, but none of them need a direct comparison because they do not suit the same purpose.'),
      subheading('How similar is this firearm to the application firearm?'),
      bullets(
        '**Same role** means the other firearm can serve essentially the same role as the application firearm and needs direct comparison.',
        '**Similar role** means the other firearm can serve part of the same role, but not in the full practical way needed.',
        '**Different role** means the other firearm is in your portfolio but is aimed at a different role from the application firearm.'
      ),
      subheading('Why it falls short'),
      bullets(
        '**Wrong firearm type** means the other firearm is the wrong type for routine lawful carry or self-defence use.',
        '**Wrong calibre** means the other firearm is not suited to the role you are motivating here.',
        '**Not practical to carry** means the other firearm is less practical for lawful daily carry.',
        '**Not practical in the field** means the other firearm is awkward or impractical in the setting being described.',
        '**Less suitable for hunting** means the other firearm is less suitable for the practical hunting role being motivated.',
        '**Not suited to this discipline** means the other firearm is designed for a different use pattern.',
        '**Less suitable for training** means the other firearm is less suitable for regular, useful practice.',
        '**Already used for another purpose** means the other firearm is committed to a different practical purpose in the portfolio.'
      ),
      subheading('Notes'),
      bullets('Use the comparison notes to explain specific limits in plain language where the pill labels alone are not enough.'),
    ],
  },
  {
    key: 'helpMotivationExistingFirearmsS15',
    heading: 'Motivation: existing firearms for section 15',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to show why the selected firearm still fills an occasional-use role that your current firearms do not cover properly.',
        'The comparison should stay practical and specific rather than argumentative.'
      ),
      subheading('No other firearms are relevant'),
      bullets('Use this option when you have other firearms, but none of them need a direct comparison because they do not fit the same occasional-use purpose.'),
      subheading('How similar is this firearm to the application firearm?'),
      bullets(
        '**Same role** means the other firearm can serve essentially the same role as the application firearm and needs direct comparison.',
        '**Similar role** means the other firearm can serve part of the same role, but not in the full use being motivated.',
        '**Different role** means the other firearm belongs in your portfolio, but mainly serves a different role from the application firearm.'
      ),
      subheading('Why it falls short'),
      bullets(
        '**Wrong firearm type** means the other firearm is the wrong type for the intended hunting or sport use.',
        '**Wrong calibre** means the other firearm does not fit the calibre role being motivated here.',
        '**Not practical to carry** means the other firearm is unsuitable where compact carry matters.',
        '**Not practical in the field** means the other firearm is less practical in normal field or outdoor use.',
        '**Less suitable for hunting** means the other firearm is less suitable for the practical hunting role being motivated.',
        '**Not suited to this discipline** means the other firearm does not match the sport or task being described.',
        '**Less suitable for training** means the other firearm is less useful for consistent practice in this role.',
        '**Already used for another purpose** means the other firearm is better kept for a different function.'
      ),
      subheading('Notes'),
      bullets('Use the notes to explain the comparison in plain language if the selected pills do not say enough on their own.'),
    ],
  },
  {
    key: 'helpMotivationExistingFirearmsS16',
    heading: 'Motivation: existing firearms for section 16',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to show why your dedicated hunting or sport role still requires the selected firearm even if you already own other firearms.',
        'This is where you explain portfolio gaps in a practical way rather than repeating your dedicated status.'
      ),
      subheading('No other firearms are relevant'),
      bullets('Use this option when you have other firearms in the portfolio, but none of them need a direct comparison because they do not suit the same dedicated role.'),
      subheading('How similar is this firearm to the application firearm?'),
      bullets(
        '**Same role** means the other firearm can serve essentially the same dedicated role as the application firearm and needs direct comparison.',
        '**Similar role** means the other firearm can assist in part of that role, but not in the full way required.',
        '**Different role** means the other firearm belongs in your portfolio but is aimed at a separate role from the application firearm.'
      ),
      subheading('Why it falls short'),
      bullets(
        '**Wrong firearm type** means the other firearm is the wrong type for the dedicated role being motivated.',
        '**Wrong calibre** means the other firearm does not fit the calibre requirement of the role.',
        '**Not practical to carry** means the other firearm is unsuitable where compact carry matters.',
        '**Not practical in the field** means the other firearm is less practical in normal hunting or field conditions.',
        '**Less suitable for hunting** means the other firearm is less suitable for the practical hunting role being motivated.',
        '**Not suited to this discipline** means the other firearm does not match the discipline or activity being described.',
        '**Less suitable for training** means the other firearm is less useful for ongoing meaningful training.',
        '**Already used for another purpose** means the other firearm is already committed to another dedicated purpose.'
      ),
      subheading('Notes'),
      bullets('Use the notes to explain the actual shortfall clearly if the pill labels need context.'),
    ],
  },
  {
    key: 'helpMotivationNeedsSelfDefence',
    heading: 'Motivation: self-defence need',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to state the core reason why the firearm is needed for lawful personal protection.',
        'For section 13, this section should stay focused on personal protection rather than hunting, sport, or club status.'
      ),
      subheading('Used firearms since'),
      bullets('This helps the motivation describe how long you have been using firearms.'),
      subheading('Years of firearm experience'),
      bullets('This helps the motivation describe your background and familiarity where that supports the application.'),
      subheading('Primary need summary'),
      bullets('Use this field for a short plain-language statement of the main need if the generated wording needs more specificity.'),
      subheading('Need note'),
      bullets('Use this note to add a brief detail that strengthens the need paragraph without turning it into a long narrative.'),
    ],
  },
  {
    key: 'helpMotivationNeedsHunting',
    heading: 'Motivation: hunting need',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to state the main reason the firearm is needed for hunting use.',
        'Choose only the reasons that are genuinely true for the selected firearm and role.'
      ),
      subheading('Reason tags'),
      bullets(
        '**Dedicated hunting** supports the claim that the firearm is needed for your active hunting role.',
        '**Ethical hunting** supports the claim that the firearm is suitable for responsible, humane use within its limits.',
        '**Platform fit** supports the claim that the firearm is practically suited to the job it must do.'
      ),
      subheading('Primary need summary'),
      bullets('Use this field for a short summary of the main hunting need if the standard wording needs more precision.'),
      subheading('Need note'),
      bullets('Use this note to add a brief practical detail that strengthens the need paragraph.'),
      subheading('Years of firearm experience'),
      bullets('This helps the motivation explain your firearm background and experience level.'),
    ],
  },
  {
    key: 'helpMotivationNeedsSport',
    heading: 'Motivation: sport shooting need',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to state the main reason the firearm is needed for sport shooting use.',
        'The selected reasons should match the actual discipline, training, or competition role you are motivating.'
      ),
      subheading('Reason tags'),
      bullets(
        '**Dedicated sport** supports the claim that the firearm is needed for your active sport shooting role.',
        '**Training continuity** supports the claim that the firearm helps sustain regular and meaningful practice.',
        '**Platform fit** supports the claim that the firearm is practically suited to the discipline or training role.'
      ),
      subheading('Primary need summary'),
      bullets('Use this field for a short summary of the main sport shooting need if more specificity is useful.'),
      subheading('Need note'),
      bullets('Use this note to add a short practical detail that improves the need paragraph.'),
      subheading('Years of firearm experience'),
      bullets('This helps the motivation describe your background and familiarity with firearms and training.'),
    ],
  },
  {
    key: 'helpMotivationNeedsMixed',
    heading: 'Motivation: mixed hunting and sport need',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to show why the firearm is genuinely needed across both hunting and sport use.',
        'Only keep the mixed path if the same firearm really serves both roles in a credible way.'
      ),
      subheading('Reason tags'),
      bullets(
        '**Dedicated hunting** supports the hunting side of the mixed-use claim.',
        '**Dedicated sport** supports the sport shooting side of the mixed-use claim.',
        '**Training continuity** supports the claim that regular, meaningful practice is sustained across the mixed-use role.',
        '**Ethical hunting** supports the claim that the firearm remains suitable for responsible, humane hunting use.',
        '**Platform fit** supports the claim that one platform can realistically serve the combined role.'
      ),
      subheading('Primary need summary'),
      bullets('Use this field for a short summary of the combined need if the generated wording should be more specific.'),
      subheading('Need note'),
      bullets('Use this note to explain the mixed-use case in plain language if needed.'),
      subheading('Years of firearm experience'),
      bullets('This helps the motivation describe the experience behind the combined hunting and sport use case.'),
    ],
  },
  {
    key: 'helpMotivationSelfDefenceContext',
    heading: 'Motivation: self-defence context',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to capture the risk factors that make the self-defence need concrete rather than abstract.',
        'Choose only the circumstances that actually apply to you.'
      ),
      subheading('How this is used'),
      bullets(
        'The selected exposure tags are combined into the self-defence context paragraph in the generated motivation.',
      ),
      subheading('Risk exposure'),
      bullets(
        '**Travel after dark** supports a statement that you are regularly exposed outside safer daylight conditions.',
        '**Frequent road travel** supports a statement that routine movement increases exposure to risk.',
        '**Client/work site visits** supports a statement that work takes you into varied locations and conditions.',
        '**Isolated areas** supports a statement that you may be in places with slower access to assistance.',
        '**Crime hotspots** supports a statement that your routine includes areas with heightened criminal risk.',
        '**Valuable equipment** supports a statement that you may carry items that increase your vulnerability to crime.',
        '**Family protection** supports a statement that your lawful protection concerns extend to your household context.',
        '**Farm or rural access** supports a statement that some travel or access routes involve more isolated conditions.'
      ),
      subheading('Context note'),
      bullets('Use this note to add one short real-world detail that makes the self-defence context clearer.'),
    ],
  },
  {
    key: 'helpMotivationHuntingActivityS15',
    heading: 'Motivation: section 15 hunting activity',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to capture the practical hunting detail behind an occasional hunting motivation.',
        'The purpose is to show realistic use and suitability without forcing long free-text answers.'
      ),
      subheading('Terrain'),
      bullets(
        '**Bushveld** supports a closer-range, denser-environment use case.',
        '**Open field** supports a more open environment where sight lines are longer.',
        '**Mountain** supports a more demanding terrain context with different movement and shot considerations.',
        '**Mixed field** supports a use case that crosses more than one terrain type.'
      ),
      subheading('Distance'),
      bullets(
        '**Under 50m** supports a close-range use case.',
        '**Up to 150m** supports a short-to-medium range use case.',
        '**Up to 300m** supports a moderate range use case.',
        '**300m+** supports a longer-range use case.'
      ),
      subheading('Trips per year and note'),
      bullets(
        '**Once** means a single hunting trip in the year.',
        '**Twice** means two trips in the year.',
        '**Multiple** means more than two trips in the year.',
        'Use the hunting note only for a short detail that materially improves the activity paragraph.'
      ),
    ],
  },
  {
    key: 'helpMotivationHuntingActivityS16',
    heading: 'Motivation: section 16 hunting activity',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to capture the practical hunting detail behind a dedicated hunting motivation.',
        'These details support the dedicated-use narrative by showing actual hunting activity and environment.'
      ),
      subheading('Terrain'),
      bullets(
        '**Bushveld** supports a closer-range, denser-environment use case.',
        '**Open field** supports a more open environment where sight lines are longer.',
        '**Mountain** supports a more demanding terrain context with different movement and shot considerations.',
        '**Mixed field** supports a use case that crosses more than one terrain type.'
      ),
      subheading('Distance'),
      bullets(
        '**Under 50m** supports a close-range use case.',
        '**Up to 150m** supports a short-to-medium range use case.',
        '**Up to 300m** supports a moderate range use case.',
        '**300m+** supports a longer-range use case.'
      ),
      subheading('Trips per year and note'),
      bullets(
        '**Once** means a single hunting trip in the year.',
        '**Twice** means two trips in the year.',
        '**Multiple** means more than two trips in the year.',
        'Use the hunting note only for a short detail that materially improves the activity paragraph.'
      ),
    ],
  },
  {
    key: 'helpMotivationSportActivityS15',
    heading: 'Motivation: section 15 sport activity',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to capture the practical sport shooting detail behind an occasional sport motivation.',
        'The goal is to show actual participation and platform fit without turning the wizard into a long questionnaire.'
      ),
      subheading('Disciplines'),
      bullets(
        '**General range practice** supports a broad training and familiarisation role.',
        '**Club competition** supports participation in organised club events.',
        '**Precision rimfire** supports a discipline that values accuracy, consistency, and low-recoil repetition.',
        '**Practical firearm shooting** supports a more dynamic practical-use discipline across suitable firearm categories.',
        '**Steel challenge** supports a speed and target-transition use case.'
      ),
      subheading('Sessions per year and note'),
      bullets(
        '**Once** means a single session or event in the year.',
        '**Twice** means two sessions or events in the year.',
        '**Multiple** means more than two sessions or events in the year.',
        'Use the sport note only for a short detail that materially improves the activity paragraph.'
      ),
    ],
  },
  {
    key: 'helpMotivationSportActivityS16',
    heading: 'Motivation: section 16 sport activity',
    audience: ['holder'],
    sections: [
      paragraph(
        'Use this card to capture the practical sport shooting detail behind a dedicated sport motivation.',
        'These details support the dedicated-use narrative by showing actual participation and discipline fit.'
      ),
      subheading('Disciplines'),
      bullets(
        '**General range practice** supports a broad training and familiarisation role.',
        '**Club competition** supports participation in organised club events.',
        '**Precision rimfire** supports a discipline that values accuracy, consistency, and low-recoil repetition.',
        '**Practical firearm shooting** supports a more dynamic practical-use discipline across suitable firearm categories.',
        '**Steel challenge** supports a speed and target-transition use case.'
      ),
      subheading('Sessions per year and note'),
      bullets(
        '**Once** means a single session or event in the year.',
        '**Twice** means two sessions or events in the year.',
        '**Multiple** means more than two sessions or events in the year.',
        'Use the sport note only for a short detail that materially improves the activity paragraph.'
      ),
    ],
  },
  {
    key: 'helpMotivationPreviewSummary',
    heading: 'Motivation: preview summary',
    audience: ['holder'],
    sections: [
      paragraph(
        'This card shows the numbered motivation generated from the answers currently captured in the wizard.',
        'Use it to check whether the structure, tone, and factual detail read the way you expect before you refine the inputs further.'
      ),
      heading('How to use this preview'),
      bullets(
        'If a paragraph feels thin, return to the card that feeds that topic and improve the structured detail there.',
        'If the motivation goes off-course, check that the firearm, section, purpose, and comparison choices are correct.'
      ),
    ],
  },
  {
    key: 'helpMotivationBenchmark',
    heading: 'Motivation: benchmark',
    audience: ['holder'],
    sections: [
      paragraph(
        'This dev-only card compares the generated motivation against the internal benchmark for the selected section and purpose.',
        'It is a quality-check aid, not part of the final motivation itself.'
      ),
      heading('What the output means'),
      bullets(
        'Benchmark passed means the current output broadly meets the expected structure and coverage checks.',
        'Missing sections means expected content areas are not being detected.',
        'Missing phrases means key reference wording or signals are not present.',
        'Paragraph depth shows where the generated section is thinner than the benchmark expects.'
      ),
    ],
  },
  {
    key: 'helpMotivationStructuredProfile',
    heading: 'Motivation: structured profile',
    audience: ['holder'],
    sections: [
      paragraph(
        'This dev-only card shows the raw structured data the wizard is building underneath the UI.',
        'It is mainly useful for debugging and checking that the right values are being stored.'
      ),
      heading('What to look for'),
      bullets(
        'Check that the section, purpose, firearm, and profile fields match the visible selections in the wizard.',
        'If the preview output is wrong, this view helps identify whether the problem is in data capture or composition.'
      ),
    ],
  },
];

const topicsByKey: Record<string, HelpTopic> = [
  ...Object.values(helpPolicy.topics).map((topic) => ({
    key: topic.key,
    heading: topic.heading,
    audience: topic.audience,
    sections: resolveSections(topic.sections),
  })),
  ...runtimeTopics,
].reduce((acc, topic) => {
  acc[topic.key] = topic;
  return acc;
}, {} as Record<string, HelpTopic>);

const topicAliases: Record<string, string> = {
  helpSelectCertificate: 'helpSelectCompetency',
  helpDocsMembership: 'helpDocsAssociationMembership',
  helpDocsCompCert: 'helpDocsCompCert',
};

const welcomeStepSections = {
  pin: {
    type: 'bullets',
    items: ['**Create a Passcode**: Set your app Passcode to secure local access to your information.'],
  } as HelpSection,
  profileNew: {
    type: 'bullets',
    items: ['**Complete profile details**: Capture your contact, employment and other information. Once captured, this will be used for all your new applications.'],
  } as HelpSection,
  profileRenewal: {
    type: 'bullets',
    items: ['**Complete profile details**: Capture your contact information. Once captured, this will be used for all your renewal applications.'],
  } as HelpSection,
  id: {
    type: 'bullets',
    items: ['**Upload proof of ID**: Add a clear copy of your ID card/book or passport.'],
  } as HelpSection,
  poa: {
    type: 'bullets',
    items: ['**Upload proof of address**: Add recent address evidence matching your profile details. This should not be older than 3 months.'],
  } as HelpSection,
  proficiency: {
    type: 'bullets',
    items: ['**Capture training/proficiency docs**: Add training certificates and statement-of-results documents needed for new competency applications. There is no harm including them for other applications as well. Your DFO will remove the documents that are not required.'],
  } as HelpSection,
  competency: {
    type: 'bullets',
    items: ['**Add a competency certificate**: Capture your existing competency certificate details and supporting document.'],
  } as HelpSection,
  safe: {
    type: 'bullets',
    items: ['**Upload firearm storage images**: Add photos/evidence of the safe used for firearm storage.'],
  } as HelpSection,
  firearm: {
    type: 'bullets',
    items: ['**Add a firearm using your licence card**: Capture the firearm and licence details for renewal.'],
  } as HelpSection,
  firearmNew: {
    type: 'bullets',
    items: ['**Add your new firearm**: Capture the new firearm details so that this can be added to the application.'],
  } as HelpSection,
  membership: {
    type: 'bullets',
    items: ['**Add association membership (if required)**: Include membership proof for Section 16 applications.'],
  } as HelpSection,
  dfo: {
    type: 'paragraph',
    items: ['**IMPORTANT**: We recommend that you check with your local DFO what the requirements for your application are.'],
  } as HelpSection,
};

const welcomeStepIntro = (text: string): HelpSection => ({ type: 'paragraph', items: [text] });

const WELCOME_HELP_TOPICS: Record<string, HelpTopic> = {
  helpWelcome_demo: {
    key: 'helpWelcome_demo',
    heading: 'Demo mode',
    audience: ['holder'],
    sections: [
      welcomeStepIntro(
        'Demo mode is for exploration. You can browse sample profile data, sample vault items and create sample applications without using your own personal data.'
      ),
      {
        type: 'bullets',
        items: [
          'Create sample application: Walk through the application workflow.',
          'Explore demo profile: View sample profile and supporting information.',
          'Explore demo vault: View sample firearms and related content.',
          'Erase and reset app: Clear demo data when you want to start with your own information and applications.',
        ],
      },
    ],
  },
  helpWelcome_new_competency: {
    key: 'helpWelcome_new_competency',
    heading: 'New competency applications',
    audience: ['holder'],
    sections: [
      welcomeStepIntro('Before you can apply for your competency certificate, you will need to complete your practical and theory training using a accredited training institution.'),
      welcomeStepIntro('Once you have completed your training you will receive certificates and results confirming successfull completion.'),
      welcomeStepIntro('Then complete the following steps once you have completed your training:'),
      welcomeStepSections.profileNew,
      welcomeStepSections.id,
      welcomeStepSections.poa,
      welcomeStepSections.proficiency,
      welcomeStepSections.dfo,
    ],
  },
  helpWelcome_new_firearm: {
    key: 'helpWelcome_new_firearm',
    heading: 'New firearm applications',
    audience: ['holder'],
    sections: [
      welcomeStepIntro('Before you can apply for your new firearm, you will require a competency certificate from SAPS.'),
      welcomeStepIntro('Once you have your competency certificate, complete provide the following information that is required for your new firearm application.'),
      welcomeStepSections.profileNew,
      welcomeStepSections.id,
      welcomeStepSections.poa,
      welcomeStepSections.competency,
      welcomeStepSections.safe,
      welcomeStepSections.firearmNew,
      welcomeStepSections.dfo,
],
  },
  helpWelcome_new_both: {
    key: 'helpWelcome_new_both',
    heading: 'New competency & firearm applications',
    audience: ['holder'],
    sections: [
      welcomeStepIntro('Before you can apply for your competency certificate, you will need to complete your practical and theory training using a accredited training institution.'),
      welcomeStepIntro('Once you have completed your training you will receive certificates and results confirming successfull completion.'),
      welcomeStepIntro('You will require a competency certificate from SAPS before you can apply for a new firearm.'),
      welcomeStepIntro('Once you have your competency certificate, complete provide the following information that is required for your new firearm application.'),
      welcomeStepSections.profileNew,
      welcomeStepSections.id,
      welcomeStepSections.poa,
      welcomeStepSections.proficiency,
      welcomeStepSections.competency,
      welcomeStepSections.safe,
      welcomeStepSections.firearmNew,
      welcomeStepSections.membership,
      welcomeStepSections.dfo,
    ],
  },
  helpWelcome_renewal_competency: {
    key: 'helpWelcome_renewal_competency',
    heading: 'Competency renewals',
    audience: ['holder'],
    sections: [
      welcomeStepIntro('For competency renewals, upload the following information:'),
      welcomeStepSections.profileRenewal,
      welcomeStepSections.id,
      welcomeStepSections.poa,
      welcomeStepSections.competency,
      welcomeStepSections.dfo,
    ],
  },
  helpWelcome_renewal_firearm: {
    key: 'helpWelcome_renewal_firearm',
    heading: 'Firearm renewals',
    audience: ['holder'],
    sections: [
      welcomeStepIntro('For firearm renewals, upload the following information:'),
      welcomeStepSections.profileRenewal,
      welcomeStepSections.id,
      welcomeStepSections.poa,
      welcomeStepSections.competency,
      welcomeStepSections.safe,
      welcomeStepSections.firearm,
      welcomeStepSections.membership,
      welcomeStepSections.dfo,
    ],
  },
  helpWelcome_renewal_both: {
    key: 'helpWelcome_renewal_both',
    heading: 'Competency & firearm renewals',
    audience: ['holder'],
    sections: [
      welcomeStepIntro('For competency and firearm renewal applications, upload the following information:'),
      welcomeStepSections.profileRenewal,
      welcomeStepSections.id,
      welcomeStepSections.poa,
      welcomeStepSections.competency,
      welcomeStepSections.safe,
      welcomeStepSections.firearm,
      welcomeStepSections.membership,
      welcomeStepSections.dfo,
    ],
  },
  helpWelcome_both_competency: {
    key: 'helpWelcome_both_competency',
    heading: 'New & renewal competency applications',
    audience: ['holder'],
    sections: [
      welcomeStepIntro('Here is the information that is required for competency applications.'),
      welcomeStepIntro('For **NEW** competency applications, you will require the training certificates and statement of results.'),
      welcomeStepIntro('For **RENEWAL** competency applications, you will require your current valid competency certificate.'),
      welcomeStepSections.profileNew,
      welcomeStepSections.id,
      welcomeStepSections.poa,
      welcomeStepSections.proficiency,
      welcomeStepSections.competency,
      welcomeStepSections.dfo,
    ],
  },
  helpWelcome_both_firearm: {
    key: 'helpWelcome_both_firearm',
    heading: 'New & renewal firearm applications',
    audience: ['holder'],
    sections: [
      welcomeStepIntro('For new and renewal fiream applications, upload the following information:'),
      welcomeStepSections.profileNew,
      welcomeStepSections.id,
      welcomeStepSections.poa,
      welcomeStepSections.competency,
      welcomeStepSections.safe,
      welcomeStepSections.firearm,
      welcomeStepSections.firearmNew,
      welcomeStepSections.membership,
      welcomeStepSections.dfo,
    ],
  },
  helpWelcome_both_both: {
    key: 'helpWelcome_both_both',
    heading: 'New & renewal applications',
    audience: ['holder'],
    sections: [
      welcomeStepIntro('You use all application paths. Complete shared setup first, then follow the readiness steps shown for each application flow.'),
      welcomeStepSections.profileNew,
      welcomeStepSections.id,
      welcomeStepSections.poa,
      welcomeStepSections.proficiency,
      welcomeStepSections.competency,
      welcomeStepSections.safe,
      welcomeStepSections.firearm,
      welcomeStepSections.firearmNew,
      welcomeStepSections.membership,
      welcomeStepSections.dfo,
    ],
  },
  helpWelcome_unknown: {
    key: 'helpWelcome_unknown',
    heading: 'Welcome guidance',
    audience: ['holder'],
    sections: [
      welcomeStepIntro('Start with the core setup steps below. You can change app use preferences later in Settings.'),
      welcomeStepSections.profileRenewal,
      welcomeStepSections.id,
      welcomeStepSections.poa,
      welcomeStepSections.dfo,
    ],
  },
};

export const getHelpTopic = (key: string | null | undefined): HelpTopic | undefined => {
  if (!key) {
    return undefined;
  }
  const resolvedKey = topicAliases[key] ?? key;
  return topicsByKey[resolvedKey] ?? WELCOME_HELP_TOPICS[resolvedKey];
};

export const getWelcomeHelpTopicKey = (context: WelcomeHelpContext): string => {
  if (context.mode === 'demo') return 'helpWelcome_demo';
  if (context.welcomeFlow) {
    if (context.welcomeFlow === 'new_competency_517') return 'helpWelcome_new_competency';
    if (context.welcomeFlow === 'new_firearm_271') return 'helpWelcome_new_firearm';
    if (context.welcomeFlow === 'renew_competency_517g') return 'helpWelcome_renewal_competency';
    if (context.welcomeFlow === 'renew_firearm_518a') return 'helpWelcome_renewal_firearm';
  }
  const intent = context.applicationIntent ?? 'both';
  const type = context.applicationType ?? 'both';
  if (intent === 'new') return `helpWelcome_new_${type}`;
  if (intent === 'renewal') return `helpWelcome_renewal_${type}`;
  if (intent === 'both') return `helpWelcome_both_${type}`;
  return 'helpWelcome_unknown';
};

export const getWelcomeHelpTopic = (context: WelcomeHelpContext): HelpTopic =>
  WELCOME_HELP_TOPICS[getWelcomeHelpTopicKey(context)] ?? WELCOME_HELP_TOPICS.helpWelcome_unknown;

export const getAllHelpTopics = (): HelpTopic[] => Object.values(topicsByKey);

export const getHelpTheme = () => helpPolicy.theme ?? {};

export const getHelpPolicyMeta = () => {
  const { type, schemaVersion, jurisdiction, locale, version, effectiveFrom, lastUpdated, a11y } = helpPolicy;
  return { type, schemaVersion, jurisdiction, locale, version, effectiveFrom, lastUpdated, a11y };
};

export default helpPolicy;
