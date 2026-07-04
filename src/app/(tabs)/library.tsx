import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, TopWebNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { exportLibrary } from '@/lib/library-export';
import { importLibrary } from '@/lib/library-import';
import { TIER_INFO } from '@/lib/scoring';
import { useSongStore } from '@/lib/song-store';
import { MAX_TOTAL_SCORE, type ScoredSong, type Tier } from '@/lib/types';

type SortKey = 'score' | 'tempo' | 'title';
type TierFilter = 'all' | Tier;

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'tempo', label: 'Tempo' },
  { key: 'title', label: 'Title' },
];

const TIER_FILTERS: { key: TierFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'keeper', label: 'Keeper' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'cut', label: 'Cut' },
];

export default function LibraryScreen() {
  const store = useSongStore();
  const router = useRouter();
  const theme = useTheme();
  // null = still loading (first paint), [] = loaded-but-empty.
  const [songs, setSongs] = useState<ScoredSong[] | null>(null);
  const [sort, setSort] = useState<SortKey>('score');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const busy = exporting || importing;

  // Reload every time the tab regains focus so saves/edits/deletes from the
  // score screen are reflected the moment we land back here.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      store
        .getAll()
        .then((all) => {
          if (active) setSongs(all);
        })
        .catch(() => {
          if (active) setSongs([]);
        });
      return () => {
        active = false;
      };
    }, [store])
  );

  const genres = useMemo(() => {
    const set = new Set<string>();
    (songs ?? []).forEach((s) => {
      if (s.genre) set.add(s.genre);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [songs]);

  const visible = useMemo(() => {
    let list = songs ?? [];
    if (tierFilter !== 'all') list = list.filter((s) => s.tier === tierFilter);
    // Guard against a stale genre filter (e.g. the last song of a genre was deleted).
    if (genreFilter !== 'all' && genres.includes(genreFilter)) {
      list = list.filter((s) => s.genre === genreFilter);
    }
    return [...list].sort((a, b) => {
      if (sort === 'score') return b.totalScore - a.totalScore || a.title.localeCompare(b.title);
      if (sort === 'tempo') {
        const at = a.tempoBpm ?? Infinity;
        const bt = b.tempoBpm ?? Infinity;
        return at - bt || a.title.localeCompare(b.title);
      }
      return a.title.localeCompare(b.title);
    });
  }, [songs, sort, tierFilter, genreFilter, genres]);

  const openSong = (song: ScoredSong) =>
    router.push({ pathname: '/song/[id]', params: { id: song.id } });

  // Exports the whole library (not the filtered view). Native shares the file;
  // web downloads it.
  const onExport = async () => {
    if (songs == null || songs.length === 0 || busy) return;
    setExporting(true);
    setStatusMsg(null);
    try {
      const result = await exportLibrary(songs);
      const plural = result.songCount === 1 ? '' : 's';
      setStatusMsg({
        tone: 'ok',
        text: result.shared
          ? `Exported ${result.songCount} song${plural}.`
          : `Downloaded ${result.filename} (${result.songCount} song${plural}).`,
      });
    } catch {
      setStatusMsg({ tone: 'err', text: 'Export failed — please try again.' });
    } finally {
      setExporting(false);
    }
  };

  // Imports a JSON export, merging by id (last-write-wins). Adds/updates only —
  // never deletes local songs. Reloads the list on success.
  const onImport = async () => {
    if (songs == null || busy) return;
    setImporting(true);
    setStatusMsg(null);
    try {
      const outcome = await importLibrary(store);
      if (outcome.status === 'cancelled') return;
      if (outcome.status === 'error') {
        setStatusMsg({ tone: 'err', text: outcome.message });
        return;
      }
      setSongs(await store.getAll());
      const parts = [`${outcome.added} added`, `${outcome.updated} updated`];
      if (outcome.skippedOlder > 0) parts.push(`${outcome.skippedOlder} older skipped`);
      if (outcome.invalid > 0) parts.push(`${outcome.invalid} invalid`);
      setStatusMsg({ tone: 'ok', text: `Import: ${parts.join(', ')}.` });
    } catch {
      setStatusMsg({ tone: 'err', text: 'Import failed — please try again.' });
    } finally {
      setImporting(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <ThemedText type="subtitle">Library</ThemedText>
        {songs != null && (
          <View style={styles.headerActions}>
            <ActionButton
              label={importing ? 'Importing…' : 'Import'}
              onPress={onImport}
              disabled={busy}
              theme={theme}
            />
            {songs.length > 0 && (
              <ActionButton
                label={exporting ? 'Exporting…' : 'Export'}
                onPress={onExport}
                disabled={busy}
                theme={theme}
              />
            )}
          </View>
        )}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {songs == null
          ? 'Loading…'
          : songs.length === 0
            ? 'No scored songs yet — score one on the Search tab, or import a library.'
            : visible.length === songs.length
              ? `${songs.length} scored song${songs.length === 1 ? '' : 's'} · tap to view or edit`
              : `Showing ${visible.length} of ${songs.length}`}
      </ThemedText>
      {statusMsg && (
        <ThemedText
          type="small"
          style={{ color: statusMsg.tone === 'err' ? TIER_INFO.cut.color : theme.tint }}>
          {statusMsg.text}
        </ThemedText>
      )}

      {songs != null && songs.length > 0 && (
        <View style={styles.controls}>
          <FilterGroup label="Sort">
            {SORTS.map((s) => (
              <Pill
                key={s.key}
                label={s.label}
                active={sort === s.key}
                onPress={() => setSort(s.key)}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Tier">
            {TIER_FILTERS.map((t) => (
              <Pill
                key={t.key}
                label={t.label}
                active={tierFilter === t.key}
                activeColor={t.key === 'all' ? undefined : TIER_INFO[t.key].color}
                onPress={() => setTierFilter(t.key)}
              />
            ))}
          </FilterGroup>

          {genres.length > 0 && (
            <FilterGroup label="Genre">
              <Pill label="All" active={genreFilter === 'all'} onPress={() => setGenreFilter('all')} />
              {genres.map((g) => (
                <Pill
                  key={g}
                  label={g}
                  active={genreFilter === g}
                  onPress={() => setGenreFilter(g)}
                />
              ))}
            </FilterGroup>
          )}
        </View>
      )}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <SongRow song={item} onPress={() => openSong(item)} />}
          ListEmptyComponent={
            songs == null ? (
              <ActivityIndicator style={styles.loading} />
            ) : songs.length > 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                No songs match these filters.
              </ThemedText>
            ) : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterGroup}>
      <ThemedText type="code" themeColor="textSecondary" style={styles.filterLabel}>
        {label}
      </ThemedText>
      <View style={styles.pillRow}>{children}</View>
    </View>
  );
}

function Pill({
  label,
  active,
  onPress,
  activeColor,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: active ? (activeColor ?? theme.tint) : theme.backgroundElement },
        pressed && styles.pillPressed,
      ]}>
      <ThemedText type="smallBold" style={{ color: active ? '#ffffff' : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  theme,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: theme.backgroundElement },
        (disabled || pressed) && styles.pillPressed,
      ]}>
      <ThemedText type="smallBold" style={{ color: theme.tint }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function SongRow({ song, onPress }: { song: ScoredSong; onPress: () => void }) {
  const info = TIER_INFO[song.tier];
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <ThemedView
          type={pressed ? 'backgroundSelected' : 'backgroundElement'}
          style={styles.row}>
          <View style={styles.rowText}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {song.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {song.artist}
              {song.tempoBpm != null ? ` · ${Math.round(song.tempoBpm)} BPM` : ''}
              {song.key ? ` · ${song.key}` : ''}
              {song.genre ? ` · ${song.genre}` : ''}
            </ThemedText>
          </View>
          <View style={styles.rowMeta}>
            <ThemedText type="smallBold">
              {song.totalScore}/{MAX_TOTAL_SCORE}
            </ThemedText>
            <View style={[styles.tierBadge, { backgroundColor: info.color }]}>
              <ThemedText type="code" style={styles.tierText}>
                {info.label}
              </ThemedText>
            </View>
          </View>
        </ThemedView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four + TopWebNavInset,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionButton: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  controls: {
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  filterGroup: {
    gap: Spacing.one,
  },
  filterLabel: {
    textTransform: 'uppercase',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 1,
  },
  pillPressed: {
    opacity: 0.7,
  },
  loading: {
    marginTop: Spacing.four,
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  rowMeta: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  tierBadge: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  tierText: {
    color: '#ffffff',
  },
});
