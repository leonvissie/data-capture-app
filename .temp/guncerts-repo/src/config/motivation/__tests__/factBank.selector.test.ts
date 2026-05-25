import { describe, expect, test } from '@jest/globals';

import { getFactsForContext } from '../factBank.selector';

describe('factBank selector', () => {
  test('selects the best available self-defence technical fact for S10', () => {
    const facts = getFactsForContext({
      sectionId: 'S10',
      sectionType: 's13',
      contextType: 'self_defence',
      calibre: '9mm',
      firearmType: 'handgun',
    });

    expect(facts[0]?.id).toBe('handgun_platform_self_defence');
    expect(facts).toHaveLength(1);
  });

  test('suppresses technical facts when no strong technical match exists', () => {
    const facts = getFactsForContext({
      sectionId: 'S12',
      sectionType: 's16',
      contextType: 'sport_shooting',
      calibre: '.308 Win',
      firearmType: 'handgun',
    });

    expect(facts).toEqual([]);
  });

  test('prefers province-sensitive self-defence facts when the applicant region matches', () => {
    const facts = getFactsForContext({
      sectionId: 'S9',
      sectionType: 's13',
      contextType: 'self_defence',
      regionCode: 'gp',
      firearmType: 'handgun',
    });

    expect(facts[0]?.id).toBe('crime_gp_violent_crime_context');
  });

  test('falls back to the national self-defence fact when no province match exists', () => {
    const facts = getFactsForContext({
      sectionId: 'S9',
      sectionType: 's13',
      contextType: 'self_defence',
      regionCode: 'wc',
      firearmType: 'handgun',
    });

    expect(facts[0]?.id).toBe('crime_wc_violent_crime_context');
  });

  test('normalizes province labels when selecting self-defence crime facts', () => {
    const facts = getFactsForContext({
      sectionId: 'S9',
      sectionType: 's13',
      contextType: 'self_defence',
      regionCode: 'Gauteng',
      firearmType: 'handgun',
    });

    expect(facts[0]?.id).toBe('crime_gp_violent_crime_context');
  });

  test('falls back to the national self-defence fact when no province is supplied', () => {
    const facts = getFactsForContext({
      sectionId: 'S9',
      sectionType: 's13',
      contextType: 'self_defence',
      firearmType: 'handgun',
    });

    expect(facts[0]?.id).toBe('crime_sa_national_violent_crime_context');
  });

  test('adds the female-sensitive self-defence context fact for female applicants', () => {
    const facts = getFactsForContext({
      sectionId: 'S9',
      sectionType: 's13',
      contextType: 'self_defence',
      regionCode: 'gp',
      applicantSex: 'female',
      firearmType: 'handgun',
    });

    expect(facts.map((fact) => fact.id)).toEqual([
      'crime_gp_violent_crime_context',
      'crime_sa_female_self_defence_context',
    ]);
  });
});
