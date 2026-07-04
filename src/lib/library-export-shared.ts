/**
 * The library JSON export format — the interchange schema a future setlist app
 * would import. Field names are snake_case to match the data model in the spec
 * and the SQLite columns. Documented in full in SCHEMA.md; keep the two in sync.
 *
 * Delivery is platform-split (mirrors the store): `library-export.tsx` shares a
 * file via expo-sharing on native, `library-export.web.tsx` triggers a browser
 * download. Both build the document here so the bytes are identical everywhere.
 */

import Constants from 'expo-constants';

import type { RubricScores, ScoredSong } from './types';

export const EXPORT_FORMAT_ID = 'setlist-litmus-test';
export const EXPORT_SCHEMA_VERSION = 1;

export interface ExportedSong {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  tempo_bpm: number | null;
  key: string | null;
  time_signature: string | null;
  danceability_raw: number | null;
  acousticness_raw: number | null;
  data_source: 'getsongbpm' | 'manual';
  source_song_id: string | null;
  /** Keys are the seven rubric categories, each scored 0-2. */
  rubric_scores: RubricScores;
  total_score: number;
  tier: 'keeper' | 'maybe' | 'cut';
  notes: string;
  date_added: string;
  date_last_scored: string;
}

export interface ExportDocument {
  format: typeof EXPORT_FORMAT_ID;
  schema_version: number;
  exported_at: string;
  app_version: string | null;
  song_count: number;
  songs: ExportedSong[];
}

/** Result reported back to the UI after an export completes. */
export interface ExportResult {
  filename: string;
  songCount: number;
  /** true = handed to the OS share sheet (native); false = downloaded (web). */
  shared: boolean;
}

function toExportedSong(song: ScoredSong): ExportedSong {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    genre: song.genre,
    tempo_bpm: song.tempoBpm,
    key: song.key,
    time_signature: song.timeSignature,
    danceability_raw: song.danceabilityRaw,
    acousticness_raw: song.acousticnessRaw,
    data_source: song.dataSource,
    source_song_id: song.sourceSongId,
    rubric_scores: song.rubricScores,
    total_score: song.totalScore,
    tier: song.tier,
    notes: song.notes,
    date_added: song.dateAdded,
    date_last_scored: song.dateLastScored,
  };
}

export function buildExportDocument(songs: ScoredSong[], exportedAt: Date): ExportDocument {
  return {
    format: EXPORT_FORMAT_ID,
    schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: exportedAt.toISOString(),
    app_version: Constants.expoConfig?.version ?? null,
    song_count: songs.length,
    songs: songs.map(toExportedSong),
  };
}

export function serializeExport(doc: ExportDocument): string {
  return JSON.stringify(doc, null, 2);
}

/** e.g. setlist-litmus-test-2026-07-04.json */
export function exportFilename(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${EXPORT_FORMAT_ID}-${yyyy}-${mm}-${dd}.json`;
}
