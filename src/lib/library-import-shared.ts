/**
 * Library import — parse a Setlist Litmus Test export file and merge it into the
 * local store. Platform-agnostic core (the file picking lives in
 * `library-import.ts` / `library-import.web.ts`).
 *
 * Merge rule is last-write-wins by `id` + `date_last_scored`: unknown ids are
 * added, and an incoming record replaces a local one only when it was scored
 * more recently. Import never deletes local songs — importing a file can only
 * add or update. (This same LWW-by-id merge is what the future Supabase sync
 * layer reuses.)
 *
 * total_score and tier are always RECOMPUTED from rubric_scores, so a hand-edited
 * or corrupt file can't smuggle in an inconsistent verdict.
 */

import { tierForTotal, totalScore } from './scoring';
import type { SongStore } from './song-store-shared';
import { RUBRIC_CATEGORIES, type RubricScore, type RubricScores, type ScoredSong } from './types';

export interface ImportSummary {
  added: number;
  updated: number;
  skippedOlder: number;
  invalid: number;
}

export type ImportOutcome =
  | ({ status: 'ok' } & ImportSummary)
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

const CATEGORY_KEYS = RUBRIC_CATEGORIES.map((c) => c.key);

function asScore(v: unknown): RubricScore | null {
  return v === 0 || v === 1 || v === 2 ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

/** Validate + normalize one exported record into a ScoredSong, or null if invalid. */
function parseSong(raw: unknown): ScoredSong | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const id = asString(r.id);
  const title = asString(r.title);
  const artist = asString(r.artist);
  if (!id || !title || !artist) return null;

  if (typeof r.rubric_scores !== 'object' || r.rubric_scores === null) return null;
  const rs = r.rubric_scores as Record<string, unknown>;
  const scores = {} as RubricScores;
  for (const key of CATEGORY_KEYS) {
    const score = asScore(rs[key]);
    if (score === null) return null; // all seven categories required, each 0-2
    scores[key] = score;
  }

  const total = totalScore(scores);
  const dateAdded = asString(r.date_added) ?? new Date().toISOString();
  const dateLastScored = asString(r.date_last_scored) ?? dateAdded;

  return {
    id,
    title,
    artist,
    genre: asString(r.genre),
    tempoBpm: asNumber(r.tempo_bpm),
    key: asString(r.key),
    timeSignature: asString(r.time_signature),
    danceabilityRaw: asNumber(r.danceability_raw),
    acousticnessRaw: asNumber(r.acousticness_raw),
    dataSource: r.data_source === 'getsongbpm' ? 'getsongbpm' : 'manual',
    sourceSongId: asString(r.source_song_id),
    rubricScores: scores,
    totalScore: total,
    tier: tierForTotal(total),
    notes: typeof r.notes === 'string' ? r.notes : '',
    dateAdded,
    dateLastScored,
  };
}

export type ParseResult =
  | { ok: true; songs: ScoredSong[]; invalid: number }
  | { ok: false; error: string };

export function parseExportDocument(jsonText: string): ParseResult {
  let doc: unknown;
  try {
    doc = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  if (typeof doc !== 'object' || doc === null || !Array.isArray((doc as Record<string, unknown>).songs)) {
    return { ok: false, error: "That doesn't look like a Setlist Litmus Test export (no \"songs\" list)." };
  }

  const rawSongs = (doc as Record<string, unknown>).songs as unknown[];
  const songs: ScoredSong[] = [];
  let invalid = 0;
  for (const raw of rawSongs) {
    const parsed = parseSong(raw);
    if (parsed) songs.push(parsed);
    else invalid++;
  }
  return { ok: true, songs, invalid };
}

/**
 * Merge parsed songs into the store (add-or-update by id, LWW on
 * date_last_scored; never deletes). ISO-8601 UTC timestamps compare correctly
 * as strings, so no Date parsing is needed.
 */
export async function mergeIntoStore(
  store: SongStore,
  incoming: ScoredSong[]
): Promise<Omit<ImportSummary, 'invalid'>> {
  const existing = await store.getAll();
  const byId = new Map(existing.map((s) => [s.id, s]));
  let added = 0;
  let updated = 0;
  let skippedOlder = 0;

  for (const song of incoming) {
    const local = byId.get(song.id);
    if (!local) {
      await store.save(song);
      added++;
    } else if (song.dateLastScored > local.dateLastScored) {
      await store.save(song);
      updated++;
    } else {
      skippedOlder++;
    }
  }
  return { added, updated, skippedOlder };
}

/** Parse + merge a JSON string into the store. Shared by both platform pickers. */
export async function importFromJsonText(store: SongStore, jsonText: string): Promise<ImportOutcome> {
  const parsed = parseExportDocument(jsonText);
  if (!parsed.ok) return { status: 'error', message: parsed.error };
  const merged = await mergeIntoStore(store, parsed.songs);
  return { status: 'ok', invalid: parsed.invalid, ...merged };
}
