/**
 * Shared-library sync against Supabase.
 *
 * Offline-first: the local store stays the source of truth; `syncNow` does a
 * full two-way reconcile — pull every remote row (tombstones included), compare
 * with every local row by id, and let the more-recently-changed side win
 * (last-write-wins on `date_last_scored`, which is bumped on edit AND delete).
 * The winner is written to whichever side is stale. Deletes are tombstones, so
 * they propagate like any other change.
 *
 * Timestamps are normalized to ISO-8601 UTC because Postgres `timestamptz`
 * comes back as `…+00:00` while local rows are `…Z`; comparing epoch millis
 * (not raw strings) keeps LWW correct across the two formats.
 */

import { getSupabaseClient } from './supabase-client';
import type { SongStore } from './song-store-shared';
import { isSyncConfigured } from './sync-config';
import type { RubricScores, ScoredSong } from './types';

const TABLE = 'songs';

export type SyncResult =
  | { status: 'ok'; pulled: number; pushed: number }
  | { status: 'not_configured' }
  | { status: 'offline' }
  | { status: 'error'; message: string };

/** Supabase row shape (snake_case; rubric_scores is jsonb). */
interface Row {
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
  rubric_scores: RubricScores;
  total_score: number;
  tier: string;
  notes: string | null;
  date_added: string;
  date_last_scored: string;
  deleted_at: string | null;
}

function normIso(value: string | null): string | null {
  if (value == null) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

function toRow(s: ScoredSong): Row {
  return {
    id: s.id,
    title: s.title,
    artist: s.artist,
    genre: s.genre,
    tempo_bpm: s.tempoBpm,
    key: s.key,
    time_signature: s.timeSignature,
    danceability_raw: s.danceabilityRaw,
    acousticness_raw: s.acousticnessRaw,
    data_source: s.dataSource,
    source_song_id: s.sourceSongId,
    rubric_scores: s.rubricScores,
    total_score: s.totalScore,
    tier: s.tier,
    notes: s.notes,
    date_added: s.dateAdded,
    date_last_scored: s.dateLastScored,
    deleted_at: s.deletedAt,
  };
}

function fromRow(r: Row): ScoredSong {
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    genre: r.genre,
    tempoBpm: r.tempo_bpm,
    key: r.key,
    timeSignature: r.time_signature,
    danceabilityRaw: r.danceability_raw,
    acousticnessRaw: r.acousticness_raw,
    dataSource: r.data_source === 'getsongbpm' ? 'getsongbpm' : 'manual',
    sourceSongId: r.source_song_id,
    rubricScores: r.rubric_scores,
    totalScore: r.total_score,
    tier: r.tier === 'keeper' || r.tier === 'maybe' ? r.tier : 'cut',
    notes: r.notes ?? '',
    // Normalize so local storage stays in one consistent ISO-Z format.
    dateAdded: normIso(r.date_added) ?? r.date_added,
    dateLastScored: normIso(r.date_last_scored) ?? r.date_last_scored,
    deletedAt: normIso(r.deleted_at),
  };
}

const changedAt = (s: ScoredSong): number => Date.parse(s.dateLastScored) || 0;

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * Reconcile the local store with the shared Supabase table. Safe to call any
 * time: no-ops (with a status) when unconfigured or offline.
 */
export async function syncNow(store: SongStore): Promise<SyncResult> {
  if (!isSyncConfigured()) return { status: 'not_configured' };
  if (!isOnline()) return { status: 'offline' };

  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.from(TABLE).select('*');
    if (error) return { status: 'error', message: error.message };

    const remoteById = new Map<string, ScoredSong>();
    for (const row of (data ?? []) as Row[]) {
      const song = fromRow(row);
      remoteById.set(song.id, song);
    }

    const local = await store.getAllIncludingDeleted();
    const localById = new Map(local.map((s) => [s.id, s]));

    const writeLocal: ScoredSong[] = []; // remote is newer → save locally
    const pushRemote: ScoredSong[] = []; // local is newer / new → upsert

    const ids = new Set<string>([...localById.keys(), ...remoteById.keys()]);
    for (const id of ids) {
      const l = localById.get(id);
      const r = remoteById.get(id);
      if (l && !r) {
        pushRemote.push(l);
      } else if (r && !l) {
        writeLocal.push(r);
      } else if (l && r) {
        const lt = changedAt(l);
        const rt = changedAt(r);
        if (rt > lt) writeLocal.push(r);
        else if (lt > rt) pushRemote.push(l);
        // equal timestamps → already in sync
      }
    }

    for (const song of writeLocal) {
      await store.save(song);
    }
    if (pushRemote.length > 0) {
      const { error: upsertError } = await supabase.from(TABLE).upsert(pushRemote.map(toRow));
      if (upsertError) return { status: 'error', message: upsertError.message };
    }

    return { status: 'ok', pulled: writeLocal.length, pushed: pushRemote.length };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Sync failed.' };
  }
}
