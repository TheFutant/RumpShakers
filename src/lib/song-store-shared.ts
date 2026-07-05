/**
 * Storage-agnostic contract for the scored-song library.
 *
 * Two backends implement `SongStore` behind the same API, chosen at bundle
 * time by Metro's platform resolution (mirrors the project's other `.web`
 * splits like `app-tabs.web.tsx`):
 *   - `song-store.tsx`      → native iOS/Android, backed by expo-sqlite
 *                             (the offline-first store the product ships with)
 *   - `song-store.web.tsx`  → web preview, backed by localStorage (SQLite on
 *                             web is still alpha in SDK 57; the web build is a
 *                             dev/demo convenience, not a shipping target)
 *
 * Screens only ever touch this interface + the `useSongStore()` hook, so the
 * backend split is invisible to them.
 */

import { tierForTotal, totalScore } from './scoring';
import type { RubricScores, ScoredSong, SongDraft } from './types';

export interface SongStore {
  /** Live scored songs (tombstones hidden), most-recently-scored first. */
  getAll(): Promise<ScoredSong[]>;
  /** Live song by id, or null if missing or tombstoned. */
  getById(id: string): Promise<ScoredSong | null>;
  /** Insert or replace by id (a saved row may carry a `deletedAt` tombstone). */
  save(song: ScoredSong): Promise<void>;
  /** Soft-delete: sets `deletedAt` + bumps `dateLastScored` so the delete syncs. */
  remove(id: string): Promise<void>;
  /** Every row including tombstones — for the sync/import LWW merge only. */
  getAllIncludingDeleted(): Promise<ScoredSong[]>;
}

/**
 * Collision-resistant enough id for a single-device local library. Not a UUID
 * (that would need expo-crypto); time-ordered prefix keeps ids roughly sortable.
 */
export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/**
 * Assemble the persisted record from a draft + the band's rubric scores.
 * Total and tier are always derived here so they can never drift from the
 * scores. Pass `existing` when re-scoring so the id and original date_added
 * survive the update.
 */
export function buildScoredSong(
  draft: SongDraft,
  scores: RubricScores,
  notes: string,
  existing?: Pick<ScoredSong, 'id' | 'dateAdded'>
): ScoredSong {
  const total = totalScore(scores);
  const now = new Date().toISOString();
  return {
    ...draft,
    id: existing?.id ?? makeId(),
    rubricScores: scores,
    totalScore: total,
    tier: tierForTotal(total),
    notes: notes.trim(),
    dateAdded: existing?.dateAdded ?? now,
    dateLastScored: now,
    deletedAt: null,
  };
}
