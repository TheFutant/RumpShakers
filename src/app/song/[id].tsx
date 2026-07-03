import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ScoreForm } from '@/components/score-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { readParam } from '@/lib/router-params';
import { useSongStore } from '@/lib/song-store';
import type { ScoredSong, SongDraft } from '@/lib/types';

/** Detail + edit screen for a song already in the library. */
export default function SongDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = readParam(params.id);
  const store = useSongStore();

  // undefined = loading, null = not found, ScoredSong = loaded.
  const [song, setSong] = useState<ScoredSong | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    store
      .getById(id)
      .then((s) => {
        if (active) setSong(s);
      })
      .catch(() => {
        if (active) setSong(null);
      });
    return () => {
      active = false;
    };
  }, [id, store]);

  if (song === undefined) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (song === null) {
    return (
      <ThemedView style={styles.center}>
        <View style={styles.notFound}>
          <ThemedText type="subtitle">Song not found</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            It may have been deleted from the library.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  const initialDraft: SongDraft = {
    title: song.title,
    artist: song.artist,
    genre: song.genre,
    tempoBpm: song.tempoBpm,
    key: song.key,
    timeSignature: song.timeSignature,
    danceabilityRaw: song.danceabilityRaw,
    acousticnessRaw: song.acousticnessRaw,
    dataSource: song.dataSource,
    sourceSongId: song.sourceSongId,
  };

  return (
    <ScoreForm
      mode="edit"
      initialDraft={initialDraft}
      initialScores={song.rubricScores}
      initialNotes={song.notes}
      existing={{
        id: song.id,
        dateAdded: song.dateAdded,
        dateLastScored: song.dateLastScored,
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  notFound: {
    alignItems: 'center',
    gap: Spacing.two,
  },
});
