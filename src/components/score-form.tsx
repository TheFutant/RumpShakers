/**
 * The scoring form — shared by the "new song" flow (`/score`) and the
 * "edit existing song" detail screen (`/song/[id]`).
 *
 * `mode="new"`  → metadata comes from a search draft or the manual-entry card;
 *                 Groove / Tempo Fit auto-suggest from metadata until tapped.
 * `mode="edit"` → metadata is read-only, all seven scores + notes are
 *                 pre-loaded from the saved song, and a delete action appears.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { autoGrooveScore, autoTempoFitScore, TIER_INFO } from '@/lib/scoring';
import { useSongStore } from '@/lib/song-store';
import { buildScoredSong } from '@/lib/song-store-shared';
import {
  MAX_TOTAL_SCORE,
  RUBRIC_CATEGORIES,
  type RubricCategoryKey,
  type RubricScore,
  type RubricScores,
  type SongDraft,
} from '@/lib/types';

const TIER_BLURB: Record<string, string> = {
  keeper: 'Keeps the floor full — add it to the book.',
  maybe: 'On the bubble — worth a band discussion.',
  cut: 'Probably a pass for this crowd.',
};

function tierKeyForTotal(total: number): 'keeper' | 'maybe' | 'cut' {
  return total >= 10 ? 'keeper' : total >= 7 ? 'maybe' : 'cut';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export interface ScoreFormProps {
  mode: 'new' | 'edit';
  initialDraft: SongDraft;
  /** Edit mode pre-loads all seven; new mode leaves this undefined. */
  initialScores?: Partial<Record<RubricCategoryKey, RubricScore>>;
  initialNotes?: string;
  /** Present in edit mode — preserves id + date_added on save, enables delete. */
  existing?: { id: string; dateAdded: string; dateLastScored: string };
}

export function ScoreForm({
  mode,
  initialDraft,
  initialScores,
  initialNotes,
  existing,
}: ScoreFormProps) {
  const theme = useTheme();
  const router = useRouter();
  const store = useSongStore();

  const [draft, setDraft] = useState(initialDraft);
  // Tempo needs its own text state so partial input ("12") doesn't fight the parser.
  const [tempoText, setTempoText] = useState(
    initialDraft.tempoBpm != null ? String(initialDraft.tempoBpm) : ''
  );
  // Categories the band has explicitly set. In new mode Groove/Tempo Fit fall
  // back to their metadata suggestion until tapped; edit mode seeds all seven.
  const [manualScores, setManualScores] = useState<
    Partial<Record<RubricCategoryKey, RubricScore>>
  >(initialScores ?? {});
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isManualNew = mode === 'new' && draft.dataSource === 'manual';

  const setField = <K extends keyof SongDraft>(field: K, value: SongDraft[K]) =>
    setDraft((d) => ({ ...d, [field]: value }));

  const onTempoChange = (text: string) => {
    setTempoText(text);
    const parsed = parseFloat(text);
    setField('tempoBpm', Number.isFinite(parsed) && parsed > 0 ? parsed : null);
  };

  const autoGroove = autoGrooveScore(draft.danceabilityRaw);
  const autoTempoFit = autoTempoFitScore(draft.tempoBpm);
  const autoFor = (key: RubricCategoryKey): RubricScore | null =>
    key === 'groove' ? autoGroove : key === 'tempo_fit' ? autoTempoFit : null;

  const scoreFor = (key: RubricCategoryKey): RubricScore | null =>
    key in manualScores ? manualScores[key]! : autoFor(key);

  const setScore = (key: RubricCategoryKey, value: RubricScore) =>
    setManualScores((m) => ({ ...m, [key]: value }));

  const scoredCount = RUBRIC_CATEGORIES.filter((c) => scoreFor(c.key) != null).length;
  const liveTotal = RUBRIC_CATEGORIES.reduce((sum, c) => sum + (scoreFor(c.key) ?? 0), 0);
  const allScored = scoredCount === RUBRIC_CATEGORIES.length;
  const tierKey = allScored ? tierKeyForTotal(liveTotal) : null;
  const tier = tierKey ? TIER_INFO[tierKey] : null;

  const canSave =
    allScored && draft.title.trim().length > 0 && draft.artist.trim().length > 0 && !saving;

  const onSave = async () => {
    if (!canSave) return;
    const finalScores = Object.fromEntries(
      RUBRIC_CATEGORIES.map((c) => [c.key, scoreFor(c.key)!])
    ) as RubricScores;
    setSaving(true);
    setError(null);
    try {
      await store.save(
        buildScoredSong(
          draft,
          finalScores,
          notes,
          existing ? { id: existing.id, dateAdded: existing.dateAdded } : undefined
        )
      );
      router.replace('/library');
    } catch {
      setSaving(false);
      setError('Could not save to the library — please try again.');
    }
  };

  const onDelete = async () => {
    if (!existing || saving) return;
    setSaving(true);
    setError(null);
    try {
      await store.remove(existing.id);
      router.replace('/library');
    } catch {
      setSaving(false);
      setError('Could not delete — please try again.');
    }
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement },
  ];

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {isManualNew ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Manual entry</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Not on GetSongBPM — enter what the band knows.
            </ThemedText>
            <TextInput
              style={inputStyle}
              placeholder="Song title"
              placeholderTextColor={theme.textSecondary}
              value={draft.title}
              onChangeText={(t) => setField('title', t)}
              autoCapitalize="words"
            />
            <TextInput
              style={inputStyle}
              placeholder="Artist"
              placeholderTextColor={theme.textSecondary}
              value={draft.artist}
              onChangeText={(t) => setField('artist', t)}
              autoCapitalize="words"
            />
            <TextInput
              style={inputStyle}
              placeholder="Tempo (BPM)"
              placeholderTextColor={theme.textSecondary}
              value={tempoText}
              onChangeText={onTempoChange}
              keyboardType="numeric"
            />
            <TextInput
              style={inputStyle}
              placeholder="Key (e.g. Am)"
              placeholderTextColor={theme.textSecondary}
              value={draft.key ?? ''}
              onChangeText={(t) => setField('key', t.trim() ? t : null)}
              autoCapitalize="characters"
            />
            <TextInput
              style={inputStyle}
              placeholder="Genre"
              placeholderTextColor={theme.textSecondary}
              value={draft.genre ?? ''}
              onChangeText={(t) => setField('genre', t.trim() ? t : null)}
              autoCapitalize="words"
            />
          </ThemedView>
        ) : (
          <View style={styles.titleBlock}>
            <ThemedText type="subtitle">{draft.title}</ThemedText>
            <ThemedText themeColor="textSecondary">{draft.artist}</ThemedText>
          </View>
        )}

        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.cardHeader}>
            <ThemedText type="smallBold">Metadata</ThemedText>
            <ThemedText type="code" themeColor="textSecondary">
              {draft.dataSource === 'getsongbpm' ? 'via GetSongBPM' : 'manual'}
            </ThemedText>
          </View>
          <View style={styles.metaGrid}>
            <MetaItem
              label="Tempo"
              value={draft.tempoBpm != null ? `${Math.round(draft.tempoBpm)} BPM` : '—'}
            />
            <MetaItem label="Key" value={draft.key ?? '—'} />
            <MetaItem label="Time sig" value={draft.timeSignature ?? '—'} />
            <MetaItem label="Genre" value={draft.genre ?? '—'} />
            <MetaItem
              label="Danceability"
              value={draft.danceabilityRaw != null ? `${draft.danceabilityRaw}/100` : '—'}
            />
            <MetaItem
              label="Acousticness"
              value={draft.acousticnessRaw != null ? `${draft.acousticnessRaw}/100` : '—'}
            />
          </View>
        </ThemedView>

        {/* Live verdict */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.summaryRow}>
            <View style={styles.totalLine}>
              <ThemedText style={styles.totalNumber}>{liveTotal}</ThemedText>
              <ThemedText type="subtitle" themeColor="textSecondary">
                {' '}
                / {MAX_TOTAL_SCORE}
              </ThemedText>
            </View>
            {tier && tierKey ? (
              <View style={[styles.tierBadge, { backgroundColor: tier.color }]}>
                <ThemedText type="smallBold" style={styles.tierText}>
                  {tier.label}
                </ThemedText>
              </View>
            ) : (
              <View style={styles.progressPill}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {scoredCount}/{RUBRIC_CATEGORIES.length} scored
                </ThemedText>
              </View>
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {tierKey ? TIER_BLURB[tierKey] : 'Score all seven categories to reveal the verdict.'}
          </ThemedText>
        </ThemedView>

        {/* Rubric */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Rubric</ThemedText>
          {RUBRIC_CATEGORIES.map((cat, index) => {
            const value = scoreFor(cat.key);
            const auto = autoFor(cat.key);
            const isAutoCat = cat.key === 'groove' || cat.key === 'tempo_fit';
            const touched = cat.key in manualScores;

            let chip: string | null = null;
            if (isAutoCat) {
              if (auto == null) {
                chip = cat.key === 'groove' ? 'No danceability data — band call' : 'No tempo — band call';
              } else if (!touched) {
                chip = `Auto-suggested ${auto}/2`;
              } else if (value !== auto) {
                chip = `Overridden · auto was ${auto}/2`;
              } else {
                chip = `Matches auto ${auto}/2`;
              }
            }

            return (
              <View
                key={cat.key}
                style={[styles.rubricRow, index > 0 && { borderTopColor: theme.background, borderTopWidth: 1 }]}>
                <View style={styles.rubricText}>
                  <ThemedText type="smallBold">{cat.label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {cat.hint}
                  </ThemedText>
                  {cat.key === 'transition' && (
                    <ThemedText type="code" themeColor="textSecondary">
                      This song: {draft.tempoBpm != null ? `${Math.round(draft.tempoBpm)} BPM` : '— BPM'}
                      {' · '}
                      {draft.key ?? '—'}
                    </ThemedText>
                  )}
                  {chip && (
                    <View style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
                      <ThemedText type="code" themeColor="textSecondary">
                        {chip}
                      </ThemedText>
                    </View>
                  )}
                </View>
                <ScoreSelector
                  value={value}
                  onChange={(v) => setScore(cat.key, v)}
                  tint={theme.tint}
                  trackColor={theme.background}
                  idleColor={theme.textSecondary}
                />
              </View>
            );
          })}
        </ThemedView>

        {/* Notes */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Notes</ThemedText>
          <TextInput
            style={[inputStyle, styles.notesInput]}
            placeholder="Arrangement ideas, who sings lead, key change for our range…"
            placeholderTextColor={theme.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
          />
        </ThemedView>

        <Pressable
          onPress={onSave}
          disabled={!canSave}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.tint },
            (!canSave || pressed) && styles.buttonDimmed,
          ]}>
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <ThemedText type="smallBold" style={styles.buttonLabel}>
              {mode === 'edit' ? 'Save changes' : 'Save to library'}
            </ThemedText>
          )}
        </Pressable>
        {!allScored && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Score all {RUBRIC_CATEGORIES.length} categories to save.
          </ThemedText>
        )}
        {error && (
          <ThemedText type="small" style={[styles.hint, { color: TIER_INFO.cut.color }]}>
            {error}
          </ThemedText>
        )}

        {mode === 'edit' && existing && (
          <View style={styles.editFooter}>
            <ThemedText type="code" themeColor="textSecondary" style={styles.hint}>
              Added {formatDate(existing.dateAdded)} · Last scored {formatDate(existing.dateLastScored)}
            </ThemedText>
            {confirmingDelete ? (
              <View style={styles.deleteRow}>
                <Pressable
                  onPress={onDelete}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.button,
                    styles.deleteConfirm,
                    { backgroundColor: TIER_INFO.cut.color },
                    (saving || pressed) && styles.buttonDimmed,
                  ]}>
                  <ThemedText type="smallBold" style={styles.buttonLabel}>
                    Delete forever
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => setConfirmingDelete(false)}
                  style={({ pressed }) => [
                    styles.button,
                    styles.deleteCancel,
                    { backgroundColor: theme.backgroundElement },
                    pressed && styles.buttonDimmed,
                  ]}>
                  <ThemedText type="smallBold">Cancel</ThemedText>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setConfirmingDelete(true)} style={styles.deleteLink}>
                <ThemedText type="smallBold" style={{ color: TIER_INFO.cut.color }}>
                  Delete from library
                </ThemedText>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function ScoreSelector({
  value,
  onChange,
  tint,
  trackColor,
  idleColor,
}: {
  value: RubricScore | null;
  onChange: (value: RubricScore) => void;
  tint: string;
  trackColor: string;
  idleColor: string;
}) {
  return (
    <View style={[styles.selector, { backgroundColor: trackColor }]}>
      {([0, 1, 2] as const).map((n) => {
        const selected = value === n;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            hitSlop={6}
            style={[styles.segment, selected && { backgroundColor: tint }]}>
            <ThemedText type="smallBold" style={{ color: selected ? '#ffffff' : idleColor }}>
              {n}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <ThemedText type="code" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  titleBlock: {
    gap: Spacing.half,
    marginTop: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.three,
  },
  metaItem: {
    width: '33.33%',
    gap: Spacing.half,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  totalNumber: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '800',
  },
  tierBadge: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  tierText: {
    color: '#ffffff',
  },
  progressPill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  rubricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  rubricText: {
    flex: 1,
    gap: Spacing.half,
    alignItems: 'flex-start',
  },
  chip: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    marginTop: Spacing.half,
  },
  selector: {
    flexDirection: 'row',
    borderRadius: Spacing.two,
    padding: 3,
    gap: 3,
  },
  segment: {
    width: 36,
    height: 36,
    borderRadius: Spacing.one + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  notesInput: {
    minHeight: 88,
  },
  button: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDimmed: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: '#ffffff',
  },
  hint: {
    textAlign: 'center',
  },
  editFooter: {
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  deleteRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  deleteConfirm: {
    flex: 1,
  },
  deleteCancel: {
    flex: 1,
  },
  deleteLink: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
});
