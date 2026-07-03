/**
 * Rubric auto-scoring rules and tier math.
 *
 * The band can always override an auto-suggested score — these functions
 * only compute the suggestion (or null when the metadata isn't available).
 */

import type { RubricScore, RubricScores, Tier } from './types';

/**
 * Tempo Fit: 100-128 BPM is the dance-floor sweet spot.
 * 100-128 → 2, 90-99 or 129-140 → 1, anything else → 0.
 * Boundaries are widened to cover fractional BPMs (e.g. 99.5 scores 1).
 */
export function autoTempoFitScore(tempoBpm: number | null): RubricScore | null {
  if (tempoBpm == null || !Number.isFinite(tempoBpm) || tempoBpm <= 0) {
    return null;
  }
  if (tempoBpm >= 100 && tempoBpm <= 128) return 2;
  if ((tempoBpm >= 90 && tempoBpm < 100) || (tempoBpm > 128 && tempoBpm <= 140)) return 1;
  return 0;
}

/**
 * Groove suggestion from GetSongBPM danceability (0-100):
 * >65 → 2, 35-65 → 1, <35 → 0.
 */
export function autoGrooveScore(danceability: number | null): RubricScore | null {
  if (danceability == null || !Number.isFinite(danceability)) {
    return null;
  }
  if (danceability > 65) return 2;
  if (danceability >= 35) return 1;
  return 0;
}

export function totalScore(scores: RubricScores): number {
  return Object.values(scores).reduce<number>((sum, s) => sum + s, 0);
}

/** 10+ = Keeper, 7-9 = Maybe/Discuss, <7 = Cut. */
export function tierForTotal(total: number): Tier {
  if (total >= 10) return 'keeper';
  if (total >= 7) return 'maybe';
  return 'cut';
}

export interface TierInfo {
  label: string;
  /** Accent color; readable as a badge background with white text in both themes. */
  color: string;
  range: string;
}

export const TIER_INFO: Record<Tier, TierInfo> = {
  keeper: { label: 'Keeper', color: '#2E9E5B', range: '10–14' },
  maybe: { label: 'Maybe', color: '#D98E04', range: '7–9' },
  cut: { label: 'Cut', color: '#D64545', range: '0–6' },
};
