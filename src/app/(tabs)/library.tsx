import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, TopWebNavInset } from '@/constants/theme';
import { TIER_INFO } from '@/lib/scoring';
import { useSongStore } from '@/lib/song-store';
import { MAX_TOTAL_SCORE, type ScoredSong } from '@/lib/types';

export default function LibraryScreen() {
  const store = useSongStore();
  // null = still loading (first paint), [] = loaded-but-empty.
  const [songs, setSongs] = useState<ScoredSong[] | null>(null);

  // Reload every time the tab regains focus so a song saved on the score screen
  // shows up the moment we land back here.
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

  const header = (
    <View style={styles.header}>
      <ThemedText type="subtitle">Library</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {songs == null
          ? 'Loading…'
          : songs.length === 0
            ? 'No scored songs yet — score one on the Search tab and it lands here.'
            : `${songs.length} scored song${songs.length === 1 ? '' : 's'}, newest first`}
      </ThemedText>
      <ThemedText type="code" themeColor="textSecondary">
        sorting, filtering, detail & export arrive in milestones 3–4
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          data={songs ?? []}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <SongRow song={item} />}
          ListEmptyComponent={
            songs == null ? <ActivityIndicator style={styles.loading} /> : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function SongRow({ song }: { song: ScoredSong }) {
  const info = TIER_INFO[song.tier];
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {song.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {song.artist}
          {song.tempoBpm != null ? ` · ${Math.round(song.tempoBpm)} BPM` : ''}
          {song.key ? ` · ${song.key}` : ''}
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
  loading: {
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
