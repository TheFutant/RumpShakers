import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, TopWebNavInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  friendlyMessage,
  hasApiKey,
  searchSongs,
  toSongDraft,
  type SongSearchResult,
} from '@/lib/api/getsongbpm';
import { packParam } from '@/lib/router-params';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'results'; results: SongSearchResult[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };

export default function SearchScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const apiKeyPresent = hasApiKey();

  const canSearch = apiKeyPresent && title.trim().length > 0 && state.status !== 'loading';

  const runSearch = async () => {
    if (!canSearch) return;
    Keyboard.dismiss();
    setState({ status: 'loading' });
    try {
      const results = await searchSongs(title, artist || undefined);
      setState(results.length > 0 ? { status: 'results', results } : { status: 'empty' });
    } catch (error) {
      setState({ status: 'error', message: friendlyMessage(error) });
    }
  };

  const openScoring = (result: SongSearchResult) => {
    router.push({
      pathname: '/score',
      params: { draft: packParam(JSON.stringify(toSongDraft(result))) },
    });
  };

  const addManually = () => {
    router.push({
      pathname: '/score',
      params: { manual: '1', title: packParam(title.trim()), artist: packParam(artist.trim()) },
    });
  };

  const header = (
    <View style={styles.header}>
      <ThemedText type="subtitle">Find a song</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Search GetSongBPM for tempo, key, and danceability, then score it against the rubric.
      </ThemedText>

      {!apiKeyPresent && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Connect GetSongBPM</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Search needs a free API key:{'\n'}
            1. Get one at getsongbpm.com/api{'\n'}
            2. Paste it into .env as EXPO_PUBLIC_GETSONGBPM_API_KEY{'\n'}
            3. Restart the dev server
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            You can still add songs manually below.
          </ThemedText>
        </ThemedView>
      )}

      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholder="Song title"
        placeholderTextColor={theme.textSecondary}
        value={title}
        onChangeText={setTitle}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={runSearch}
      />
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholder="Artist (optional)"
        placeholderTextColor={theme.textSecondary}
        value={artist}
        onChangeText={setArtist}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={runSearch}
      />
      <Pressable
        onPress={runSearch}
        disabled={!canSearch}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.tint },
          (!canSearch || pressed) && styles.buttonDimmed,
        ]}>
        {state.status === 'loading' ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <ThemedText type="smallBold" style={styles.buttonLabel}>
            Search
          </ThemedText>
        )}
      </Pressable>

      {state.status === 'error' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small">{state.message}</ThemedText>
        </ThemedView>
      )}
      {state.status === 'empty' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small">
            No matches on GetSongBPM — add it manually below and enter the tempo yourself.
          </ThemedText>
        </ThemedView>
      )}
      {state.status === 'results' && (
        <ThemedText type="smallBold" themeColor="textSecondary">
          {state.results.length} result{state.results.length === 1 ? '' : 's'} — tap one to score it
        </ThemedText>
      )}
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      <Pressable
        onPress={addManually}
        style={({ pressed }) => [
          styles.button,
          styles.buttonSecondary,
          { backgroundColor: theme.backgroundElement },
          pressed && styles.buttonDimmed,
        ]}>
        <ThemedText type="smallBold">Add a song manually</ThemedText>
      </Pressable>
      <ExternalLink href="https://getsongbpm.com" style={styles.attribution}>
        <ThemedText type="link" themeColor="textSecondary">
          Song data by GetSongBPM.com
        </ThemedText>
      </ExternalLink>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          data={state.status === 'results' ? state.results : []}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable onPress={() => openScoring(item)}>
              {({ pressed }) => (
                <ThemedView
                  type={pressed ? 'backgroundSelected' : 'backgroundElement'}
                  style={styles.resultRow}>
                  <View style={styles.resultText}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {item.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {item.artist}
                      {item.albumYear ? ` · ${item.albumYear}` : ''}
                    </ThemedText>
                  </View>
                  <View style={styles.resultMeta}>
                    <ThemedText type="code">
                      {item.tempoBpm != null ? `${Math.round(item.tempoBpm)} BPM` : '— BPM'}
                    </ThemedText>
                    <ThemedText type="code" themeColor="textSecondary">
                      {item.key ?? '—'}
                    </ThemedText>
                  </View>
                </ThemedView>
              )}
            </Pressable>
          )}
        />
      </SafeAreaView>
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
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four + TopWebNavInset,
    // No BottomTabInset here: SDK 57 native tabs auto-apply the bottom inset to
    // the first nested scroll view (this FlatList), so adding it manually would
    // double-count and leave dead space above the tab bar. Web pads the top.
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  button: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    marginTop: Spacing.three,
  },
  buttonDimmed: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: '#ffffff',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  resultText: {
    flex: 1,
    gap: Spacing.half,
  },
  resultMeta: {
    alignItems: 'flex-end',
    gap: Spacing.half,
  },
  footer: {
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  attribution: {
    alignSelf: 'center',
  },
});
