/**
 * Native (iOS/Android) song store — expo-sqlite backed.
 *
 * API pinned to Expo SDK 57 (docs.expo.dev/versions/v57.0.0/sdk/sqlite):
 * schema is created/upgraded in `SQLiteProvider`'s `onInit` handler, versioned
 * with `PRAGMA user_version`. Reads/writes go through the async `getAllAsync` /
 * `runAsync` methods with positional `?` parameter binding.
 *
 * The web build resolves `song-store.web.tsx` instead, so `expo-sqlite` (and
 * its WASM payload) is never pulled into the web bundle.
 */

import {
  SQLiteProvider,
  useSQLiteContext,
  type SQLiteDatabase,
} from 'expo-sqlite';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { RubricScores, ScoredSong } from './types';
import type { SongStore } from './song-store-shared';

const DB_NAME = 'setlist.db';
const DB_VERSION = 2;

/** Runs once per app launch before children mount; safe to call repeatedly. */
async function migrate(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = result?.user_version ?? 0;
  if (current >= DB_VERSION) return;

  if (current < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE IF NOT EXISTS songs (
        id                TEXT PRIMARY KEY NOT NULL,
        title             TEXT NOT NULL,
        artist            TEXT NOT NULL,
        genre             TEXT,
        tempo_bpm         REAL,
        "key"             TEXT,
        time_signature    TEXT,
        danceability_raw  REAL,
        acousticness_raw  REAL,
        data_source       TEXT NOT NULL,
        source_song_id    TEXT,
        rubric_scores     TEXT NOT NULL,
        total_score       INTEGER NOT NULL,
        tier              TEXT NOT NULL,
        notes             TEXT NOT NULL DEFAULT '',
        date_added        TEXT NOT NULL,
        date_last_scored  TEXT NOT NULL
      );
    `);
    current = 1;
  }

  if (current < 2) {
    // Soft-delete tombstone column (null = live). Enables delete propagation via sync.
    await db.execAsync(`ALTER TABLE songs ADD COLUMN deleted_at TEXT;`);
    current = 2;
  }

  await db.execAsync(`PRAGMA user_version = ${DB_VERSION}`);
}

/** Raw row shape as stored (snake_case columns; rubric_scores is JSON text). */
interface SongRow {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  tempo_bpm: number | null;
  key: string | null;
  time_signature: string | null;
  danceability_raw: number | null;
  acousticness_raw: number | null;
  data_source: string;
  source_song_id: string | null;
  rubric_scores: string;
  total_score: number;
  tier: string;
  notes: string;
  date_added: string;
  date_last_scored: string;
  deleted_at: string | null;
}

function rowToSong(row: SongRow): ScoredSong {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    genre: row.genre,
    tempoBpm: row.tempo_bpm,
    key: row.key,
    timeSignature: row.time_signature,
    danceabilityRaw: row.danceability_raw,
    acousticnessRaw: row.acousticness_raw,
    dataSource: row.data_source === 'getsongbpm' ? 'getsongbpm' : 'manual',
    sourceSongId: row.source_song_id,
    rubricScores: JSON.parse(row.rubric_scores) as RubricScores,
    totalScore: row.total_score,
    tier: row.tier === 'keeper' || row.tier === 'maybe' ? row.tier : 'cut',
    notes: row.notes,
    dateAdded: row.date_added,
    dateLastScored: row.date_last_scored,
    deletedAt: row.deleted_at,
  };
}

function makeStore(db: SQLiteDatabase): SongStore {
  return {
    async getAll() {
      const rows = await db.getAllAsync<SongRow>(
        'SELECT * FROM songs WHERE deleted_at IS NULL ORDER BY date_last_scored DESC'
      );
      return rows.map(rowToSong);
    },
    async getById(id) {
      const row = await db.getFirstAsync<SongRow>(
        'SELECT * FROM songs WHERE id = ? AND deleted_at IS NULL',
        id
      );
      return row ? rowToSong(row) : null;
    },
    async getAllIncludingDeleted() {
      const rows = await db.getAllAsync<SongRow>(
        'SELECT * FROM songs ORDER BY date_last_scored DESC'
      );
      return rows.map(rowToSong);
    },
    async save(song) {
      await db.runAsync(
        `INSERT OR REPLACE INTO songs (
           id, title, artist, genre, tempo_bpm, "key", time_signature,
           danceability_raw, acousticness_raw, data_source, source_song_id,
           rubric_scores, total_score, tier, notes, date_added, date_last_scored, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          song.id,
          song.title,
          song.artist,
          song.genre,
          song.tempoBpm,
          song.key,
          song.timeSignature,
          song.danceabilityRaw,
          song.acousticnessRaw,
          song.dataSource,
          song.sourceSongId,
          JSON.stringify(song.rubricScores),
          song.totalScore,
          song.tier,
          song.notes,
          song.dateAdded,
          song.dateLastScored,
          song.deletedAt,
        ]
      );
    },
    async remove(id) {
      // Soft delete: tombstone + bump date_last_scored so the delete wins on sync.
      const now = new Date().toISOString();
      await db.runAsync(
        'UPDATE songs SET deleted_at = ?, date_last_scored = ? WHERE id = ?',
        [now, now, id]
      );
    },
  };
}

const StoreContext = createContext<SongStore | null>(null);

function StoreAdapter({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const store = useMemo(() => makeStore(db), [db]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function SongStoreProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
      <StoreAdapter>{children}</StoreAdapter>
    </SQLiteProvider>
  );
}

export function useSongStore(): SongStore {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error('useSongStore must be used inside <SongStoreProvider>.');
  }
  return store;
}
