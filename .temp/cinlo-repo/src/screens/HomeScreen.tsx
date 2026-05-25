import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

import { RoundIconButton, Screen, SearchInput } from '@/components';
import { AppModal, Button } from '@/components';
import { useSurfacePalette, useThemeMode, useTour, useWatchState } from '@/providers';
import { useMovieFilters } from '@/features/filters/hooks/useMovieFilters';
import { FacetInlinePicker } from '@/features/filters/components/FacetInlinePicker';
import { FilterPillRow, type FilterPillKey } from '@/features/filters/components/FilterPillRow';
import { ResultsListWithHeader } from '@/features/filters/components/ResultsList';
import { GeneralInlinePicker } from '@/features/filters/components/GeneralInlinePicker';
import { DecadeYearInlinePicker } from '@/features/filters/components/DecadeYearInlinePicker';
import { HOME_TOUR_STEPS, TourTarget } from '@/features/tour';
import { spacing, typography } from '@/theme';
import type { FilterKey, OutcomeFilter, WatchStatusFilter } from '@/features/filters/lib/filtering';

function movieMatchesFacetValue(movie: { releaseYear: number; genres: string[]; director: string | null; cast: string[]; awards: Array<{ awardShortName: string; ceremonyYear: number; nominations: Array<{ normalizedCategory: string }> }> }, key: FilterKey, value: string): boolean {
  switch (key) {
    case 'decade': {
      const ranges: Record<string, [number, number]> = {
        '1970s': [1970, 1979],
        '1980s': [1980, 1989],
        '1990s': [1990, 1999],
        '2000s': [2000, 2009],
        '2010s': [2010, 2019],
        '2020s': [2020, 2029],
      };
      const range = ranges[value];
      return !!range && movie.releaseYear >= range[0] && movie.releaseYear <= range[1];
    }
    case 'genre':
      return movie.genres.includes(value);
    case 'year':
      return String(movie.releaseYear) === value;
    case 'award':
      return movie.awards.some((award) => award.awardShortName === value);
    case 'director':
      return movie.director === value;
    case 'actor':
      return movie.cast.includes(value);
    case 'normalizedCategory':
      return movie.awards.some((award) => award.nominations.some((n) => n.normalizedCategory === value));
    case 'ceremonyYear':
      return movie.awards.some((award) => String(award.ceremonyYear) === value);
    default:
      return false;
  }
}

function yearBelongsToSelectedDecades(year: string, decades: string[]) {
  const y = Number(year);
  if (!Number.isFinite(y)) return false;
  const ranges: Record<string, [number, number]> = {
    '1970s': [1970, 1979],
    '1980s': [1980, 1989],
    '1990s': [1990, 1999],
    '2000s': [2000, 2009],
    '2010s': [2010, 2019],
    '2020s': [2020, 2029],
  };
  return decades.some((d) => {
    const r = ranges[d];
    return !!r && y >= r[0] && y <= r[1];
  });
}

export default function HomeScreen() {
  const palette = useSurfacePalette();
  const { screenMode, setScreenMode } = useThemeMode();
  const { getWatchCountForMovie } = useWatchState();
  const {
    shouldAutoStart,
    isActive: isTourActive,
    hasCompleted: hasCompletedTour,
    currentStepIndex,
    currentStep,
    setStepReady,
    startTour,
    nextStep,
    resetTour,
  } =
    useTour();
  const { state, results, selectedCount, toggleValue, toggleOutcome, toggleWatchStatus, clearAll, clearKey, getFacetValues } =
    useMovieFilters();
  const appVersion = Constants.expoConfig?.version ?? 'unknown';

  const [activeFilter, setActiveFilter] = useState<FilterPillKey | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferencesCollapsed, setPreferencesCollapsed] = useState(false);
  const [collapseAllSignal, setCollapseAllSignal] = useState(0);
  const [scrollToTopSignal, setScrollToTopSignal] = useState(0);
  const [scrollFilterRowToStartSignal, setScrollFilterRowToStartSignal] = useState(0);
  const [titleSearchQuery, setTitleSearchQuery] = useState('');
  const [expandedMovieIds, setExpandedMovieIds] = useState<Record<string, boolean>>({});
  const [resetActionCount, setResetActionCount] = useState(0);
  const [generalClearActionCount, setGeneralClearActionCount] = useState(0);
  const [filterRowScrollCount, setFilterRowScrollCount] = useState(0);
  const [filterRowCanScrollHorizontally, setFilterRowCanScrollHorizontally] = useState(true);
  const initialFilterQueries: Record<Exclude<FilterKey, 'award' | 'year'>, string> = {
    decade: '',
    genre: '',
    director: '',
    actor: '',
    normalizedCategory: '',
    ceremonyYear: '',
  };
  const [filterQueries, setFilterQueries] = useState<Record<Exclude<FilterKey, 'award' | 'year'>, string>>({
    ...initialFilterQueries,
  });
  const didAutoStartTour = useRef(false);
  const didAutoAdvanceExpandStep = useRef(false);
  const didAutoAdvanceResetStep = useRef(false);
  const didAutoAdvanceGeneralStep = useRef(false);
  const didAutoAdvanceGeneralClearStep = useRef(false);
  const resetStepBaselineRef = useRef<number | null>(null);
  const generalClearStepBaselineRef = useRef<number | null>(null);
  const filterRowScrollBaselineRef = useRef<number | null>(null);
  const pendingTourStartRef = useRef<{ fromStep?: number; resumeSavedStep?: boolean; autoStart?: boolean } | null>(null);

  useEffect(() => {
    if (didAutoStartTour.current) return;
    if (!shouldAutoStart || isTourActive) return;
    didAutoStartTour.current = true;
    void startTour(HOME_TOUR_STEPS, { fromStep: 0, autoStart: true });
  }, [isTourActive, shouldAutoStart, startTour]);

  useEffect(() => {
    if (!isTourActive || currentStep?.id !== 'global-search-aliens') return;
    setActiveFilter(null);
    const normalizedQuery = titleSearchQuery.trim().toLowerCase();
    const isReady = normalizedQuery.includes('aliens');
    setStepReady('global-search-aliens', isReady);
  }, [currentStep?.id, currentStepIndex, isTourActive, setStepReady, titleSearchQuery]);

  useEffect(() => {
    if (!isTourActive) return;
    if (currentStepIndex <= 1 || currentStepIndex >= 6) return;
    const normalizedQuery = titleSearchQuery.trim().toLowerCase();
    if (normalizedQuery.includes('aliens')) return;
    setTitleSearchQuery('aliens');
  }, [currentStepIndex, isTourActive, titleSearchQuery]);

  const counts = useMemo(
    () => ({
      decade: state.decade.length + state.year.length,
      genre: state.genre.length,
      director: state.director.length,
      actor: state.actor.length,
      normalizedCategory: state.normalizedCategory.length,
      ceremonyYear: state.ceremonyYear.length,
      general: state.award.length + state.outcome.length + state.watchStatus.length,
    }),
    [state],
  );

  const activeSelected = activeFilter && activeFilter !== 'general' ? state[activeFilter] : [];
  const trimmedTitleQuery = titleSearchQuery.trim().toLowerCase();

  const visibleResults = useMemo(() => {
    if (trimmedTitleQuery.length < 2) return results;
    return results.filter((movie) => movie.title.toLowerCase().includes(trimmedTitleQuery));
  }, [results, trimmedTitleQuery]);
  const tourMovieId = visibleResults[0]?.id ?? null;
  const activeValues = useMemo(() => {
    if (!activeFilter || activeFilter === 'general' || activeFilter === 'decade') return [];
    const baseValues = getFacetValues(activeFilter);
    const selectedValues = state[activeFilter] ?? [];
    const narrowed = baseValues.filter((value) => visibleResults.some((movie) => movieMatchesFacetValue(movie, activeFilter, value)));
    for (const value of selectedValues) {
      if (!narrowed.includes(value)) narrowed.push(value);
    }
    return narrowed;
  }, [activeFilter, getFacetValues, state, visibleResults]);

  const decadeValues = useMemo(() => {
    const baseValues = getFacetValues('decade');
    const values = [...baseValues];
    for (const value of state.decade) {
      if (!values.includes(value)) values.push(value);
    }
    return values;
  }, [getFacetValues, state.decade]);

  const yearValues = useMemo(() => {
    const baseValues = getFacetValues('year');
    const values = [...baseValues];
    for (const value of state.year) {
      if (!values.includes(value)) values.push(value);
    }
    return values.sort((a, b) => Number(a) - Number(b));
  }, [getFacetValues, state.year]);

  const generalAwardValues = useMemo(() => {
    const baseValues = getFacetValues('award');
    const narrowed = baseValues.filter((value) => visibleResults.some((movie) => movie.awards.some((a) => a.awardShortName === value)));
    for (const value of state.award) {
      if (!narrowed.includes(value)) narrowed.push(value);
    }
    return narrowed;
  }, [getFacetValues, state.award, visibleResults]);

  const generalOutcomeValues = useMemo(() => {
    const available: OutcomeFilter[] = [];
    if (visibleResults.some((movie) => movie.awards.some((a) => a.nominations.some((n) => n.result === 'won')))) {
      available.push('winner');
    }
    if (visibleResults.some((movie) => movie.awards.some((a) => a.nominations.some((n) => n.result === 'nominated')))) {
      available.push('nominee');
    }
    for (const value of state.outcome) {
      if (!available.includes(value)) available.push(value);
    }
    return available;
  }, [state.outcome, visibleResults]);

  const generalWatchValues = useMemo(() => ['watched', 'not_watched'] as WatchStatusFilter[], []);
  const allowVerticalScroll = !isTourActive;
  const allowHorizontalPillScroll = !isTourActive || currentStep?.id === 'scroll-filter-pills';

  const performClearAll = () => {
    clearAll();
    setFilterQueries(initialFilterQueries);
    setTitleSearchQuery('');
    setActiveFilter(null);
    setCollapseAllSignal((v) => v + 1);
    setExpandedMovieIds({});
    setResetActionCount((v) => v + 1);
  };

  const requestClearAll = () => {
    Alert.alert('Reset current filters?', 'This will remove all selected filters and reset all filter search text.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: performClearAll,
      },
    ]);
  };

  useEffect(() => {
    if (currentStep?.id !== 'expand-card') {
      didAutoAdvanceExpandStep.current = false;
    }
  }, [currentStep?.id]);

  useEffect(() => {
    if (currentStep?.id !== 'reset-current-filters') {
      didAutoAdvanceResetStep.current = false;
    }
  }, [currentStep?.id]);

  useEffect(() => {
    if (currentStep?.id !== 'select-general-filter') {
      didAutoAdvanceGeneralStep.current = false;
      return;
    }
    setScrollFilterRowToStartSignal((v) => v + 1);
    const raf = requestAnimationFrame(() => {
      setScrollFilterRowToStartSignal((v) => v + 1);
    });
    const id = setTimeout(() => {
      setScrollFilterRowToStartSignal((v) => v + 1);
    }, 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(id);
    };
  }, [currentStep?.id, currentStepIndex, isTourActive]);

  useEffect(() => {
    if (!isTourActive) return;
    if (currentStep?.id !== 'scroll-filter-pills') return;
    setScrollFilterRowToStartSignal((v) => v + 1);
    const raf = requestAnimationFrame(() => {
      setScrollFilterRowToStartSignal((v) => v + 1);
    });
    const id = setTimeout(() => {
      setScrollFilterRowToStartSignal((v) => v + 1);
    }, 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(id);
    };
  }, [currentStep?.id, currentStepIndex, isTourActive]);

  const launchTourFromSettings = (options: { fromStep?: number; resumeSavedStep?: boolean; autoStart?: boolean }) => {
    pendingTourStartRef.current = options;
    setSettingsOpen(false);
  };

  useEffect(() => {
    if (settingsOpen) return;
    const pending = pendingTourStartRef.current;
    if (!pending) return;
    pendingTourStartRef.current = null;
    const id = setTimeout(() => {
      void startTour(HOME_TOUR_STEPS, pending);
    }, 0);

    return () => {
      clearTimeout(id);
    };
  }, [settingsOpen, startTour]);

  useEffect(() => {
    if (currentStep?.id !== 'general-clear-filter') {
      didAutoAdvanceGeneralClearStep.current = false;
    }
  }, [currentStep?.id]);

  useEffect(() => {
    if (currentStep?.id !== 'scroll-filter-pills') {
      filterRowScrollBaselineRef.current = null;
      return;
    }
    if (filterRowScrollBaselineRef.current === null) {
      filterRowScrollBaselineRef.current = filterRowScrollCount;
    }
  }, [currentStep?.id, filterRowScrollCount]);

  useEffect(() => {
    if (currentStep?.id !== 'reset-current-filters') {
      resetStepBaselineRef.current = null;
      return;
    }
    if (resetStepBaselineRef.current === null) {
      resetStepBaselineRef.current = resetActionCount;
    }
  }, [currentStep?.id, resetActionCount]);

  useEffect(() => {
    if (currentStep?.id !== 'general-clear-filter') {
      generalClearStepBaselineRef.current = null;
      return;
    }
    if (generalClearStepBaselineRef.current === null) {
      generalClearStepBaselineRef.current = generalClearActionCount;
    }
  }, [currentStep?.id, generalClearActionCount]);

  useEffect(() => {
    if (!isTourActive || currentStep?.id !== 'movie-basic-info') return;
    setCollapseAllSignal((v) => v + 1);
    setExpandedMovieIds({});
  }, [currentStep?.id, isTourActive]);

  useEffect(() => {
    if (!isTourActive || !currentStep?.id) return;

    if (
      currentStep.id === 'global-search-aliens' ||
      currentStep.id === 'movie-basic-info' ||
      currentStep.id === 'watch-plus' ||
      currentStep.id === 'expand-card' ||
      currentStep.id === 'award-pill-colors' ||
      currentStep.id === 'reset-current-filters' ||
      currentStep.id === 'general-select-oscars-winner' ||
      currentStep.id === 'general-results-count' ||
      currentStep.id === 'general-clear-filter' ||
      currentStep.id === 'scroll-filter-pills'
    ) {
      if (
        currentStep.id === 'general-select-oscars-winner' ||
        currentStep.id === 'general-results-count' ||
        currentStep.id === 'general-clear-filter'
      ) {
        setActiveFilter('general');
      } else {
        setActiveFilter(null);
      }
    }

    if (currentStep.id === 'watch-plus') {
      const isReady = !!tourMovieId && getWatchCountForMovie(tourMovieId) > 0;
      setStepReady('watch-plus', isReady);
      return;
    }

    if (currentStep.id === 'expand-card') {
      const isReady = !!tourMovieId && !!expandedMovieIds[tourMovieId];
      setStepReady('expand-card', isReady);
      if (isReady && !didAutoAdvanceExpandStep.current) {
        didAutoAdvanceExpandStep.current = true;
        void nextStep();
      }
      return;
    }

    if (currentStep.id === 'award-pill-colors') {
      const isReady = !!tourMovieId && !!expandedMovieIds[tourMovieId];
      setStepReady('award-pill-colors', isReady);
      return;
    }

    if (currentStep.id === 'reset-current-filters') {
      const baseline = resetStepBaselineRef.current ?? resetActionCount;
      const isReady = resetActionCount > baseline;
      setStepReady('reset-current-filters', isReady);
      if (isReady && !didAutoAdvanceResetStep.current) {
        didAutoAdvanceResetStep.current = true;
        void nextStep();
      }
      return;
    }

    if (currentStep.id === 'select-general-filter') {
      const isReady = activeFilter === 'general';
      setStepReady('select-general-filter', isReady);
      if (isReady && !didAutoAdvanceGeneralStep.current) {
        didAutoAdvanceGeneralStep.current = true;
        void nextStep();
      }
      return;
    }

    if (currentStep.id === 'general-select-oscars-winner') {
      const hasOscars = state.award.includes('Oscars');
      const hasWinner = state.outcome.includes('winner');
      setStepReady('general-select-oscars-winner', hasOscars && hasWinner);
      return;
    }

    if (currentStep.id === 'general-results-count') {
      setStepReady('general-results-count', true);
      return;
    }

    if (currentStep.id === 'general-clear-filter') {
      const baseline = generalClearStepBaselineRef.current ?? generalClearActionCount;
      const isCleared = state.award.length === 0 && state.outcome.length === 0 && state.watchStatus.length === 0;
      const isReady = generalClearActionCount > baseline && isCleared;
      setStepReady('general-clear-filter', isReady);
      if (isReady && !didAutoAdvanceGeneralClearStep.current) {
        didAutoAdvanceGeneralClearStep.current = true;
        void nextStep();
      }
      return;
    }

    if (currentStep.id === 'scroll-filter-pills') {
      if (!filterRowCanScrollHorizontally) {
        setStepReady('scroll-filter-pills', true);
        return;
      }
      const baseline = filterRowScrollBaselineRef.current ?? filterRowScrollCount;
      setStepReady('scroll-filter-pills', filterRowScrollCount > baseline);
      return;
    }

    if (currentStep.id === 'tour-complete') {
      setStepReady('tour-complete', true);
    }
  }, [
    activeFilter,
    currentStep?.id,
    expandedMovieIds,
    filterRowCanScrollHorizontally,
    filterRowScrollCount,
    getWatchCountForMovie,
    generalClearActionCount,
    isTourActive,
    nextStep,
    resetActionCount,
    state.award,
    state.outcome,
    state.watchStatus,
    setStepReady,
    tourMovieId,
  ]);

  return (
    <Screen>
      <View style={styles.stickyTop}>
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <View style={styles.titleRow}>
              <Image source={require('../../assets/icons/canonical/cinlo_1024.png')} style={styles.titleIcon} />
              <Text style={[styles.title, { color: palette.text }]}>Cinlo</Text>
            </View>
            <Text style={[styles.subtitle, { color: palette.textMuted }]}>
              Pick filters, then browse award-nominated films.
            </Text>
          </View>
          <TourTarget targetId="settings-gear-button">
            <RoundIconButton buttonType="settings" accessibilityLabel="Open settings" onPress={() => setSettingsOpen(true)} />
          </TourTarget>
        </View>

        <FilterPillRow
          activeKey={activeFilter}
          counts={counts}
          scrollEnabled={allowHorizontalPillScroll}
          scrollToStartSignal={scrollFilterRowToStartSignal}
          onHorizontalScrollAvailabilityChange={setFilterRowCanScrollHorizontally}
          showClearAll={selectedCount > 0}
          onPressClearAll={requestClearAll}
          onHorizontalScrolled={() => setFilterRowScrollCount((v) => v + 1)}
          onPress={(key) => {
            setActiveFilter((prev) => (prev === key ? null : key));
            setScrollToTopSignal((v) => v + 1);
          }}
        />
      </View>

      <ResultsListWithHeader
        movies={visibleResults}
        scrollEnabled={allowVerticalScroll}
        collapseAllSignal={collapseAllSignal}
        scrollToTopSignal={scrollToTopSignal}
        tourMovieId={tourMovieId}
        onMovieExpandedChange={(movieId, expanded) => {
          setExpandedMovieIds((prev) => ({ ...prev, [movieId]: expanded }));
        }}
        header={
          <View>
        {!activeFilter ? (
          <View style={styles.globalSearchWrap}>
            <TourTarget targetId="global-search-input">
              <SearchInput
                value={titleSearchQuery}
                onChangeText={setTitleSearchQuery}
                placeholder="Search movie title..."
              />
            </TourTarget>
          </View>
        ) : null}

        {activeFilter === 'decade' ? (
          <DecadeYearInlinePicker
            decadeValues={decadeValues}
            selectedDecades={state.decade}
            yearValues={yearValues}
            selectedYears={state.year}
            onToggleDecade={(value) => {
              const isSelected = state.decade.includes(value);
              const nextDecades = isSelected ? state.decade.filter((d) => d !== value) : [...state.decade, value];
              toggleValue('decade', value);

              if (!nextDecades.length) {
                if (state.year.length) clearKey('year');
                return;
              }

              const staleYears = state.year.filter((y) => !yearBelongsToSelectedDecades(y, nextDecades));
              for (const y of staleYears) toggleValue('year', y);
            }}
            onToggleYear={(value) => toggleValue('year', value)}
            onClear={() => {
              clearKey('decade');
              clearKey('year');
            }}
          />
        ) : activeFilter && activeFilter !== 'general' ? (
          <FacetInlinePicker
            filterKey={activeFilter}
            values={activeValues}
            selected={activeSelected}
            query={filterQueries[activeFilter] ?? ''}
            onQueryChange={(value) =>
              setFilterQueries((prev) => ({
                ...prev,
                [activeFilter]: value,
              }))
            }
            onToggle={(value) => toggleValue(activeFilter, value)}
            onClear={() => clearKey(activeFilter)}
          />
        ) : activeFilter === 'general' ? (
          <GeneralInlinePicker
            awardValues={generalAwardValues}
            selectedAwards={state.award}
            outcomeValues={generalOutcomeValues}
            selectedOutcomes={state.outcome}
            watchValues={generalWatchValues}
            selectedWatchStatuses={state.watchStatus}
            onToggleAward={(value) => toggleValue('award', value)}
            onToggleOutcome={toggleOutcome}
            onToggleWatchStatus={toggleWatchStatus}
            onClear={() => {
              clearKey('award');
              clearKey('outcome');
              clearKey('watchStatus');
              setGeneralClearActionCount((v) => v + 1);
            }}
          />
        ) : null}

        <View style={styles.summaryRow}>
          <TourTarget targetId="results-summary-row">
            <Text style={[styles.summaryText, { color: palette.textMuted }]}>
              {selectedCount} filters selected • {visibleResults.length} results
            </Text>
          </TourTarget>
          <TourTarget targetId="reset-filters-button">
            <Button label="Reset" tone="red" variant="ghost" onPress={requestClearAll} />
          </TourTarget>
        </View>
          </View>
        }
      />

      <AppModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={`Settings (version: ${appVersion})`}
      >
        <View style={styles.settingsHeaderRow}>
          <Text style={[styles.settingsHeading, { color: palette.tones.purple.base }]}>Preferences</Text>
          <Button
            label={preferencesCollapsed ? 'Expand' : 'Collapse'}
            tone="purple"
            variant="outline"
            onPress={() => setPreferencesCollapsed((v) => !v)}
          />
        </View>

        {!preferencesCollapsed ? (
          <View style={styles.settingsStack}>
            <View style={[styles.settingsCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.settingsCardTitle, { color: palette.text }]}>Screen mode</Text>
              <Text style={[styles.settingsText, { color: palette.textMuted }]}>
                Choose whether this app follows your system appearance or forces a mode.
              </Text>
              <View style={styles.modeRow}>
                <Button
                  label="System"
                  tone="teal"
                  variant="outline"
                  selected={screenMode === 'system'}
                  onPress={() => setScreenMode('system')}
                  style={styles.modeButton}
                />
                <Button
                  label="Light"
                  tone="teal"
                  variant="outline"
                  selected={screenMode === 'light'}
                  onPress={() => setScreenMode('light')}
                  style={styles.modeButton}
                />
                <Button
                  label="Dark"
                  tone="teal"
                  variant="outline"
                  selected={screenMode === 'dark'}
                  onPress={() => setScreenMode('dark')}
                  style={styles.modeButton}
                />
              </View>
            </View>

            <View style={[styles.settingsCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.settingsCardTitle, { color: palette.text }]}>Welcome Tour</Text>
              <Text style={[styles.settingsText, { color: palette.textMuted }]}>
                Learn Cinlo basics with a short guided walkthrough.
              </Text>
              <View style={styles.tourButtonRow}>
                {hasCompletedTour ? (
                  <>
                    <Button
                      label="Replay search"
                      tone="teal"
                      variant="outline"
                      onPress={() => {
                        launchTourFromSettings({ fromStep: 1 });
                      }}
                    />
                    <Button
                      label="Replay filter"
                      tone="teal"
                      variant="outline"
                      onPress={() => {
                        launchTourFromSettings({ fromStep: 6 });
                      }}
                    />
                  </>
                ) : null}
                <Button
                  label="Start over"
                  tone="blue"
                  variant="outline"
                  onPress={() => {
                    launchTourFromSettings({ fromStep: 0 });
                  }}
                />
                {!hasCompletedTour ? (
                  <Button
                    label="Continue"
                    tone="teal"
                    variant="solid"
                    onPress={() => {
                      launchTourFromSettings({ resumeSavedStep: true, fromStep: 0 });
                    }}
                  />
                ) : null}
              </View>
            </View>
          </View>
        ) : null}
      </AppModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  titleWrap: { flex: 1, gap: spacing.sm },
  stickyTop: {
    marginBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  title: { ...typography.pageTitle },
  subtitle: { ...typography.body },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  summaryText: { ...typography.bodySmallStrong },
  globalSearchWrap: {
    marginBottom: spacing.sm,
  },
  settingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  settingsHeading: { ...typography.pageTitle, fontSize: 20 },
  settingsCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
  },
  settingsCardTitle: { ...typography.sectionTitle },
  settingsText: { ...typography.body },
  settingsStack: {
    gap: spacing.md,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeButton: {
    flex: 1,
  },
  tourButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
