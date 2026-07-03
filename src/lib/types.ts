/**
 * Core domain types for Setlist Litmus Test.
 *
 * A "draft" is a song plus its metadata (from GetSongBPM or manual entry)
 * that hasn't been scored yet. A ScoredSong is what gets persisted to the
 * library. Field names here map 1:1 to the exported JSON schema documented
 * in SCHEMA.md — change them in both places or not at all.
 */

export type DataSource = 'getsongbpm' | 'manual';

export type Tier = 'keeper' | 'maybe' | 'cut';

/** Every rubric category is scored 0, 1, or 2. */
export type RubricScore = 0 | 1 | 2;

export type RubricCategoryKey =
  | 'recognition'
  | 'groove'
  | 'tempo_fit'
  | 'audience_fit'
  | 'transition'
  | 'band_execution'
  | 'repeat_value';

export type RubricScores = Record<RubricCategoryKey, RubricScore>;

export interface RubricCategory {
  key: RubricCategoryKey;
  label: string;
  /** Short prompt shown under the label to anchor the band's judgment. */
  hint: string;
  /** Which metadata field (if any) can pre-fill this category's score. */
  auto: 'danceability' | 'tempo' | null;
}

export const RUBRIC_CATEGORIES: readonly RubricCategory[] = [
  {
    key: 'recognition',
    label: 'Recognition',
    hint: 'Does the crowd know it within the first few bars?',
    auto: null,
  },
  {
    key: 'groove',
    label: 'Groove',
    hint: 'Does it make people move?',
    auto: 'danceability',
  },
  {
    key: 'tempo_fit',
    label: 'Tempo Fit',
    hint: 'Is it in the dance-floor tempo sweet spot?',
    auto: 'tempo',
  },
  {
    key: 'audience_fit',
    label: 'Audience Fit',
    hint: 'Right for the crowds we actually play to?',
    auto: null,
  },
  {
    key: 'transition',
    label: 'Transition',
    hint: 'Fits next to other setlist songs on tempo and key?',
    auto: null,
  },
  {
    key: 'band_execution',
    label: 'Band Execution',
    hint: 'Can the six of us pull it off convincingly?',
    auto: null,
  },
  {
    key: 'repeat_value',
    label: 'Repeat Value',
    hint: 'Will it stay fresh gig after gig?',
    auto: null,
  },
] as const;

export const MAX_TOTAL_SCORE = RUBRIC_CATEGORIES.length * 2; // 14

/**
 * Song metadata as it flows from search (or manual entry) into scoring.
 * Nullable fields are simply unknown — the scoring screen renders them
 * as em-dashes and the band scores without them.
 */
export interface SongDraft {
  title: string;
  artist: string;
  genre: string | null;
  tempoBpm: number | null;
  key: string | null;
  timeSignature: string | null;
  /** GetSongBPM danceability, 0-100, if the song came from the API. */
  danceabilityRaw: number | null;
  /** GetSongBPM acousticness, 0-100, if the song came from the API. */
  acousticnessRaw: number | null;
  dataSource: DataSource;
  /** GetSongBPM song id, for provenance / future re-fetch. */
  sourceSongId: string | null;
}

/** A fully scored song as persisted in the local library. */
export interface ScoredSong extends SongDraft {
  id: string;
  rubricScores: RubricScores;
  totalScore: number;
  tier: Tier;
  notes: string;
  /** ISO-8601 timestamps. */
  dateAdded: string;
  dateLastScored: string;
}
