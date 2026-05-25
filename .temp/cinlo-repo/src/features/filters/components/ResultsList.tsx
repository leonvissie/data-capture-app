import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Movie } from '@/data/types';
import { TourTarget } from '@/features/tour';
import { useSurfacePalette, useWatchState } from '@/providers';
import { radii, spacing, typography } from '@/theme';

function useExpandedCardAutoScroll(listRef: React.RefObject<FlatList<Movie> | null>) {
  const cardRefs = useRef<Record<string, View | null>>({});
  const scrollOffsetRef = useRef(0);

  const setCardRef = useCallback((id: string, node: View | null) => {
    if (!node) {
      delete cardRefs.current[id];
      return;
    }
    cardRefs.current[id] = node;
  }, []);

  const onListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const ensureCardVisible = useCallback(
    (id: string) => {
      const cardNode = cardRefs.current[id];
      const flatList = listRef.current as unknown as {
        measureInWindow?: (fn: (x: number, y: number, width: number, height: number) => void) => void;
        getNativeScrollRef?: () => {
          measureInWindow?: (fn: (x: number, y: number, width: number, height: number) => void) => void;
        } | null;
        scrollToOffset: (args: { offset: number; animated?: boolean }) => void;
      } | null;
      const listNode = flatList?.getNativeScrollRef?.() ?? flatList;
      if (!cardNode || !listNode?.measureInWindow) return;

      listNode.measureInWindow((_lx, listY, _lw, listH) => {
        if (!listH) return;
        cardNode.measureInWindow((_cx, cardY, _cw, cardH) => {
          if (!cardH) return;

          const viewportTop = listY + spacing.xs;
          const viewportBottom = listY + listH - spacing.xs;
          const viewportHeight = viewportBottom - viewportTop;

          let delta = 0;
          if (cardH >= viewportHeight) {
            delta = cardY - viewportTop;
          } else if (cardY < viewportTop) {
            delta = cardY - viewportTop;
          } else if (cardY + cardH > viewportBottom) {
            delta = cardY + cardH - viewportBottom;
          }

          if (Math.abs(delta) < 1) return;
          const nextOffset = Math.max(0, scrollOffsetRef.current + delta);
          flatList?.scrollToOffset?.({ offset: nextOffset, animated: true });
          scrollOffsetRef.current = nextOffset;
        });
      });
    },
    [listRef],
  );

  const queueEnsureCardVisible = useCallback(
    (id: string) => {
      setTimeout(() => ensureCardVisible(id), 220);
      setTimeout(() => ensureCardVisible(id), 420);
    },
    [ensureCardVisible],
  );

  return { setCardRef, onListScroll, queueEnsureCardVisible };
}

export function ResultsList({ movies }: { movies: Movie[] }) {
  const palette = useSurfacePalette();
  const { hydrateForMovieIds, getWatchCountForMovie, incrementWatchCountForMovie } = useWatchState();
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const listRef = useRef<FlatList<Movie>>(null);
  const { setCardRef, onListScroll, queueEnsureCardVisible } = useExpandedCardAutoScroll(listRef);

  useEffect(() => {
    void hydrateForMovieIds(movies.map((m) => m.id));
  }, [hydrateForMovieIds, movies]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const willExpand = !prev[id];
      const next = { ...prev, [id]: willExpand };
      if (willExpand) queueEnsureCardVisible(id);
      return next;
    });
  };

  return (
    <FlatList
      ref={listRef}
      style={styles.flatList}
      data={movies}
      keyExtractor={(m) => m.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={null}
      onScroll={onListScroll}
      scrollEventThrottle={16}
      renderItem={({ item }) => (
        <MovieCard
          movie={item}
          expanded={!!expandedIds[item.id]}
          onToggle={() => toggleExpanded(item.id)}
          setContainerRef={(node) => setCardRef(item.id, node)}
          palette={palette}
          watchCount={getWatchCountForMovie(item.id)}
          onIncrementWatchCount={() => incrementWatchCountForMovie(item.id, 1)}
          onDecrementWatchCount={() => incrementWatchCountForMovie(item.id, -1)}
        />
      )}
    />
  );
}

export function ResultsListWithHeader({
  movies,
  header,
  collapseAllSignal = 0,
  scrollToTopSignal = 0,
  tourMovieId = null,
  onMovieExpandedChange,
  scrollEnabled = true,
}: {
  movies: Movie[];
  header: React.ReactElement;
  collapseAllSignal?: number;
  scrollToTopSignal?: number;
  tourMovieId?: string | null;
  onMovieExpandedChange?: (movieId: string, expanded: boolean) => void;
  scrollEnabled?: boolean;
}) {
  const palette = useSurfacePalette();
  const { hydrateForMovieIds, getWatchCountForMovie, incrementWatchCountForMovie } = useWatchState();
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const listRef = useRef<FlatList<Movie>>(null);
  const { setCardRef, onListScroll, queueEnsureCardVisible } = useExpandedCardAutoScroll(listRef);

  useEffect(() => {
    setExpandedIds({});
  }, [collapseAllSignal]);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [scrollToTopSignal]);

  useEffect(() => {
    void hydrateForMovieIds(movies.map((m) => m.id));
  }, [hydrateForMovieIds, movies]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const willExpand = !prev[id];
      const next = { ...prev, [id]: willExpand };
      onMovieExpandedChange?.(id, willExpand);
      if (willExpand) queueEnsureCardVisible(id);
      return next;
    });
  };

  return (
    <FlatList
      ref={listRef}
      style={styles.flatList}
      data={movies}
      scrollEnabled={scrollEnabled}
      keyExtractor={(m) => m.id}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
      onScroll={onListScroll}
      scrollEventThrottle={16}
      renderItem={({ item }) => (
        <MovieCard
          movie={item}
          expanded={!!expandedIds[item.id]}
          onToggle={() => toggleExpanded(item.id)}
          setContainerRef={(node) => setCardRef(item.id, node)}
          isTourMovie={tourMovieId === item.id}
          palette={palette}
          watchCount={getWatchCountForMovie(item.id)}
          onIncrementWatchCount={() => incrementWatchCountForMovie(item.id, 1)}
          onDecrementWatchCount={() => incrementWatchCountForMovie(item.id, -1)}
        />
      )}
    />
  );
}

function MovieCard({
  movie,
  expanded,
  onToggle,
  palette,
  watchCount,
  onIncrementWatchCount,
  onDecrementWatchCount,
  setContainerRef,
  isTourMovie = false,
}: {
  movie: Movie;
  expanded: boolean;
  onToggle: () => void;
  palette: ReturnType<typeof useSurfacePalette>;
  watchCount: number;
  onIncrementWatchCount: () => Promise<number>;
  onDecrementWatchCount: () => Promise<number>;
  setContainerRef?: (node: View | null) => void;
  isTourMovie?: boolean;
}) {
  const rotateAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: expanded ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [expanded, rotateAnim]);

  const awardsByBody = useMemo(() => {
    const grouped: Record<string, { won: string[]; nominated: string[] }> = {};
    for (const award of movie.awards ?? []) {
      const slot = grouped[award.awardShortName] ?? { won: [], nominated: [] };
      for (const n of award.nominations ?? []) {
        if (n.result === 'won') {
          if (!slot.won.includes(n.normalizedCategory)) slot.won.push(n.normalizedCategory);
        } else {
          if (!slot.nominated.includes(n.normalizedCategory)) slot.nominated.push(n.normalizedCategory);
        }
      }
      grouped[award.awardShortName] = slot;
    }
    return grouped;
  }, [movie.awards]);
  const expandLabel = expanded ? `Collapse details for ${movie.title}` : `Expand details for ${movie.title}`;

  return (
    <View>
      {isTourMovie ? (
        <TourTarget targetId="movie-card-basic-info">
          <View ref={setContainerRef} style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.headerWrap}>
              <View style={styles.headerRow}>
                {isTourMovie ? (
                  <TourTarget targetId="movie-expand-toggle">
                    <Pressable
                      onPress={onToggle}
                      accessibilityRole="button"
                      accessibilityLabel={expandLabel}
                      accessibilityHint="Shows or hides award details for this film"
                      accessibilityState={{ expanded }}
                      style={styles.titleCont}
                    >
                      <Text style={[styles.title, styles.titleText, { color: palette.text }]}>{movie.title}</Text>
                      <Animated.View
                        style={{
                          marginTop: 2,
                          transform: [
                            {
                              rotate: rotateAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0deg', '180deg'],
                              }),
                            },
                          ],
                        }}
                      >
                        <Ionicons name="chevron-down" size={18} color={palette.textMuted} />
                      </Animated.View>
                    </Pressable>
                  </TourTarget>
                ) : (
                  <Pressable
                    onPress={onToggle}
                    accessibilityRole="button"
                    accessibilityLabel={expandLabel}
                    accessibilityHint="Shows or hides award details for this film"
                    accessibilityState={{ expanded }}
                    style={styles.titleCont}
                  >
                    <Text style={[styles.title, styles.titleText, { color: palette.text }]}>{movie.title}</Text>
                    <Animated.View
                      style={{
                        marginTop: 2,
                        transform: [
                          {
                            rotate: rotateAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0deg', '180deg'],
                            }),
                          },
                        ],
                      }}
                    >
                      <Ionicons name="chevron-down" size={18} color={palette.textMuted} />
                    </Animated.View>
                  </Pressable>
                )}
                {isTourMovie ? (
                  <TourTarget targetId="movie-watch-plus">
                    <View style={styles.counterCont}>
                      <Text style={[styles.watchLabel, styles.watchRowRight, { color: palette.textMuted }]}>Watch count:</Text>
                      <View style={styles.controlsRowRight}>
                        <Pressable
                          disabled={watchCount <= 0}
                          accessibilityRole="button"
                          accessibilityLabel={`Decrease watch count for ${movie.title}`}
                          accessibilityHint="Decreases the number of times you watched this film"
                          accessibilityState={{ disabled: watchCount <= 0 }}
                          onPress={() => { void onDecrementWatchCount(); }}
                          style={({ pressed }) => [
                            styles.watchAction,
                            { borderColor: palette.border },
                            pressed && styles.watchActionPressed,
                            watchCount <= 0 && styles.watchActionDisabled,
                          ]}
                        >
                        <Ionicons name="remove" size={16} color={watchCount <= 0 ? palette.textMuted : palette.text} />
                        </Pressable>
                        <Text style={[styles.watchCountLabel, { color: watchCount > 0 ? palette.text : palette.textMuted }]}>{watchCount}</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Increase watch count for ${movie.title}`}
                          accessibilityHint="Increases the number of times you watched this film"
                          onPress={() => { void onIncrementWatchCount(); }}
                          style={({ pressed }) => [styles.watchAction, { borderColor: palette.border }, pressed && styles.watchActionPressed]}
                        >
                          <Ionicons name="add" size={16} color={palette.text} />
                        </Pressable>
                      </View>
                    </View>
                  </TourTarget>
                ) : (
                  <View style={styles.counterCont}>
                    <Text style={[styles.watchLabel, styles.watchRowRight, { color: palette.textMuted }]}>Watch count:</Text>
                    <View style={styles.controlsRowRight}>
                      <Pressable
                        disabled={watchCount <= 0}
                        accessibilityRole="button"
                        accessibilityLabel={`Decrease watch count for ${movie.title}`}
                        accessibilityHint="Decreases the number of times you watched this film"
                        accessibilityState={{ disabled: watchCount <= 0 }}
                        onPress={() => { void onDecrementWatchCount(); }}
                        style={({ pressed }) => [
                          styles.watchAction,
                          { borderColor: palette.border },
                          pressed && styles.watchActionPressed,
                          watchCount <= 0 && styles.watchActionDisabled,
                        ]}
                      >
                      <Ionicons name="remove" size={16} color={watchCount <= 0 ? palette.textMuted : palette.text} />
                      </Pressable>
                      <Text style={[styles.watchCountLabel, { color: watchCount > 0 ? palette.text : palette.textMuted }]}>{watchCount}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Increase watch count for ${movie.title}`}
                        accessibilityHint="Increases the number of times you watched this film"
                        onPress={() => { void onIncrementWatchCount(); }}
                        style={({ pressed }) => [styles.watchAction, { borderColor: palette.border }, pressed && styles.watchActionPressed]}
                      >
                        <Ionicons name="add" size={16} color={palette.text} />
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            </View>
            <Text style={[styles.meta, { color: palette.textMuted }]} numberOfLines={expanded ? 0 : 2}>
              <Text style={styles.metaStrong}>{movie.releaseYear}</Text>
              <Text> • </Text>
              <Text style={styles.metaStrong}>{movie.director ?? 'Unknown director'}</Text>
              <Text style={styles.metaItalic}>
                {' '}
                ({movie.genres?.length ? movie.genres.join(', ') : 'No genres'})
              </Text>
            </Text>
            <Text style={[styles.meta, { color: palette.textMuted }]} numberOfLines={expanded ? 0 : 2}>
              <Text style={styles.metaStrong}>Cast:</Text>
              <Text> {movie.cast?.length ? movie.cast.join(', ') : 'unavailable'}</Text>
            </Text>

            {expanded ? (
              isTourMovie ? (
                <TourTarget targetId="movie-awards-panel">
                  <View style={styles.awardBodies}>
                    {Object.entries(awardsByBody).map(([body, data]) => (
                      <View key={body} style={[styles.awardCard, { borderColor: palette.border, backgroundColor: palette.background }]}>
                        <Text style={[styles.awardTitle, { color: palette.text }]}>{body}</Text>
                        <View style={styles.pillRow}>
                          {data.won.map((label) => (
                            <View key={`${body}-won-${label}`} style={[styles.pill, styles.wonPill]}>
                              <Text style={styles.wonPillText}>{label}</Text>
                            </View>
                          ))}
                          {data.nominated.map((label) => (
                            <View key={`${body}-nom-${label}`} style={[styles.pill, styles.nomPill]}>
                              <Text style={styles.nomPillText}>{label}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                </TourTarget>
              ) : (
                <View style={styles.awardBodies}>
                  {Object.entries(awardsByBody).map(([body, data]) => (
                    <View key={body} style={[styles.awardCard, { borderColor: palette.border, backgroundColor: palette.background }]}>
                      <Text style={[styles.awardTitle, { color: palette.text }]}>{body}</Text>
                      <View style={styles.pillRow}>
                        {data.won.map((label) => (
                          <View key={`${body}-won-${label}`} style={[styles.pill, styles.wonPill]}>
                            <Text style={styles.wonPillText}>{label}</Text>
                          </View>
                        ))}
                        {data.nominated.map((label) => (
                          <View key={`${body}-nom-${label}`} style={[styles.pill, styles.nomPill]}>
                            <Text style={styles.nomPillText}>{label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              )
            ) : null}
          </View>
        </TourTarget>
      ) : (
      <View ref={setContainerRef} style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
        <View style={styles.headerWrap}>
          <View style={styles.headerRow}>
            {isTourMovie ? (
              <TourTarget targetId="movie-expand-toggle">
                <Pressable
                  onPress={onToggle}
                  accessibilityRole="button"
                  accessibilityLabel={expandLabel}
                  accessibilityHint="Shows or hides award details for this film"
                  accessibilityState={{ expanded }}
                  style={styles.titleCont}
                >
                  <Text style={[styles.title, styles.titleText, { color: palette.text }]}>{movie.title}</Text>
                  <Animated.View
                    style={{
                      marginTop: 2,
                      transform: [
                        {
                          rotate: rotateAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '180deg'],
                          }),
                        },
                      ],
                    }}
                  >
                    <Ionicons name="chevron-down" size={18} color={palette.textMuted} />
                  </Animated.View>
                </Pressable>
              </TourTarget>
            ) : (
              <Pressable
                onPress={onToggle}
                accessibilityRole="button"
                accessibilityLabel={expandLabel}
                accessibilityHint="Shows or hides award details for this film"
                accessibilityState={{ expanded }}
                style={styles.titleCont}
              >
                <Text style={[styles.title, styles.titleText, { color: palette.text }]}>{movie.title}</Text>
                <Animated.View
                  style={{
                    marginTop: 2,
                    transform: [
                      {
                        rotate: rotateAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', '180deg'],
                        }),
                      },
                    ],
                  }}
                >
                  <Ionicons name="chevron-down" size={18} color={palette.textMuted} />
                </Animated.View>
              </Pressable>
            )}
            {isTourMovie ? (
              <TourTarget targetId="movie-watch-plus">
                <View style={styles.counterCont}>
                  <Text style={[styles.watchLabel, styles.watchRowRight, { color: palette.textMuted }]}>Watch count:</Text>
                  <View style={styles.controlsRowRight}>
                    <Pressable
                      disabled={watchCount <= 0}
                      accessibilityRole="button"
                      accessibilityLabel={`Decrease watch count for ${movie.title}`}
                      accessibilityHint="Decreases the number of times you watched this film"
                      accessibilityState={{ disabled: watchCount <= 0 }}
                      onPress={() => { void onDecrementWatchCount(); }}
                      style={({ pressed }) => [
                        styles.watchAction,
                        { borderColor: palette.border },
                        pressed && styles.watchActionPressed,
                        watchCount <= 0 && styles.watchActionDisabled,
                      ]}
                    >
                    <Ionicons name="remove" size={16} color={watchCount <= 0 ? palette.textMuted : palette.text} />
                    </Pressable>
                    <Text style={[styles.watchCountLabel, { color: watchCount > 0 ? palette.text : palette.textMuted }]}>{watchCount}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Increase watch count for ${movie.title}`}
                      accessibilityHint="Increases the number of times you watched this film"
                      onPress={() => { void onIncrementWatchCount(); }}
                      style={({ pressed }) => [styles.watchAction, { borderColor: palette.border }, pressed && styles.watchActionPressed]}
                    >
                      <Ionicons name="add" size={16} color={palette.text} />
                    </Pressable>
                  </View>
                </View>
              </TourTarget>
            ) : (
              <View style={styles.counterCont}>
                <Text style={[styles.watchLabel, styles.watchRowRight, { color: palette.textMuted }]}>Watch count:</Text>
                <View style={styles.controlsRowRight}>
                  <Pressable
                    disabled={watchCount <= 0}
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease watch count for ${movie.title}`}
                    accessibilityHint="Decreases the number of times you watched this film"
                    accessibilityState={{ disabled: watchCount <= 0 }}
                    onPress={() => { void onDecrementWatchCount(); }}
                    style={({ pressed }) => [
                      styles.watchAction,
                      { borderColor: palette.border },
                      pressed && styles.watchActionPressed,
                      watchCount <= 0 && styles.watchActionDisabled,
                    ]}
                  >
                  <Ionicons name="remove" size={16} color={watchCount <= 0 ? palette.textMuted : palette.text} />
                  </Pressable>
                  <Text style={[styles.watchCountLabel, { color: watchCount > 0 ? palette.text : palette.textMuted }]}>{watchCount}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Increase watch count for ${movie.title}`}
                    accessibilityHint="Increases the number of times you watched this film"
                    onPress={() => { void onIncrementWatchCount(); }}
                    style={({ pressed }) => [styles.watchAction, { borderColor: palette.border }, pressed && styles.watchActionPressed]}
                  >
                    <Ionicons name="add" size={16} color={palette.text} />
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
        <Text style={[styles.meta, { color: palette.textMuted }]} numberOfLines={expanded ? 0 : 2}>
          <Text style={styles.metaStrong}>{movie.releaseYear}</Text>
          <Text> • </Text>
          <Text style={styles.metaStrong}>{movie.director ?? 'Unknown director'}</Text>
          <Text style={styles.metaItalic}>
            {' '}
            ({movie.genres?.length ? movie.genres.join(', ') : 'No genres'})
          </Text>
        </Text>
        <Text style={[styles.meta, { color: palette.textMuted }]} numberOfLines={expanded ? 0 : 2}>
          <Text style={styles.metaStrong}>Cast:</Text>
          <Text> {movie.cast?.length ? movie.cast.join(', ') : 'unavailable'}</Text>
        </Text>

        {expanded ? (
          isTourMovie ? (
            <TourTarget targetId="movie-awards-panel">
              <View style={styles.awardBodies}>
                {Object.entries(awardsByBody).map(([body, data]) => (
                  <View key={body} style={[styles.awardCard, { borderColor: palette.border, backgroundColor: palette.background }]}>
                    <Text style={[styles.awardTitle, { color: palette.text }]}>{body}</Text>
                    <View style={styles.pillRow}>
                      {data.won.map((label) => (
                        <View key={`${body}-won-${label}`} style={[styles.pill, styles.wonPill]}>
                          <Text style={styles.wonPillText}>{label}</Text>
                        </View>
                      ))}
                      {data.nominated.map((label) => (
                        <View key={`${body}-nom-${label}`} style={[styles.pill, styles.nomPill]}>
                          <Text style={styles.nomPillText}>{label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </TourTarget>
          ) : (
            <View style={styles.awardBodies}>
              {Object.entries(awardsByBody).map(([body, data]) => (
                <View key={body} style={[styles.awardCard, { borderColor: palette.border, backgroundColor: palette.background }]}>
                  <Text style={[styles.awardTitle, { color: palette.text }]}>{body}</Text>
                  <View style={styles.pillRow}>
                    {data.won.map((label) => (
                      <View key={`${body}-won-${label}`} style={[styles.pill, styles.wonPill]}>
                        <Text style={styles.wonPillText}>{label}</Text>
                      </View>
                    ))}
                    {data.nominated.map((label) => (
                      <View key={`${body}-nom-${label}`} style={[styles.pill, styles.nomPill]}>
                        <Text style={styles.nomPillText}>{label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )
        ) : null}
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flatList: { flex: 1 },
  list: { gap: spacing.sm, paddingBottom: spacing['4xl'] },
  card: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  headerWrap: {
    width: '100%',
  },
  title: { ...typography.cardTitle },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    width: '100%',
  },
  titleText: {
    flexShrink: 1,
    minWidth: 0,
  },
  titleCont: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.xs,
  },
  counterCont: {
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
    minWidth: 85,
    maxWidth: 95,
  },
  watchRowRight: { alignSelf: 'center' },
  controlsRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'center',
  },
  watchLabel: {
    ...typography.bodySmallStrong,
  },
  watchAction: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchActionPressed: {
    opacity: 0.8,
  },
  watchActionDisabled: {
    opacity: 0.45,
  },
  watchCountLabel: {
    ...typography.bodySmallStrong,
    minWidth: 16,
    textAlign: 'center',
  },
  meta: { ...typography.bodySmall },
  metaStrong: { ...typography.bodySmallStrong },
  metaItalic: {
    ...typography.bodySmall,
    fontStyle: 'italic',
  },
  awardBodies: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  awardCard: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  awardTitle: {
    ...typography.bodyStrong,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  wonPill: {
    backgroundColor: 'transparent',
    borderColor: '#86EFAC',
    borderWidth: 1,
  },
  wonPillText: {
    ...typography.bodySmallStrong,
    color: '#86EFAC',
  },
  nomPill: {
    backgroundColor: 'transparent',
    borderColor: '#F9C971',
    borderWidth: 1,
  },
  nomPillText: {
    ...typography.bodySmallStrong,
    color: '#F9C971',
  },
});
