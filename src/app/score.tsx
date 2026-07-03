import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { ScoreForm } from '@/components/score-form';
import { readParam } from '@/lib/router-params';
import type { SongDraft } from '@/lib/types';

/**
 * "Score a new song" route. Metadata arrives as either a packed `draft` JSON
 * param (from a GetSongBPM search result) or `manual` + title/artist params
 * (the add-manually path). Editing an already-saved song lives at `/song/[id]`.
 */

/**
 * Validate that a parsed route param is a usable draft. `JSON.parse` of a
 * tampered/shared URL like `?draft=null` or `?draft=123` succeeds but yields a
 * non-draft value; without this guard the screen would crash reading .tempoBpm.
 */
function isSongDraft(value: unknown): value is SongDraft {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === 'string' &&
    typeof v.artist === 'string' &&
    (v.dataSource === 'getsongbpm' || v.dataSource === 'manual')
  );
}

function emptyDraft(title: string, artist: string): SongDraft {
  return {
    title,
    artist,
    genre: null,
    tempoBpm: null,
    key: null,
    timeSignature: null,
    danceabilityRaw: null,
    acousticnessRaw: null,
    dataSource: 'manual',
    sourceSongId: null,
  };
}

export default function ScoreScreen() {
  const params = useLocalSearchParams<{
    draft?: string;
    manual?: string;
    title?: string;
    artist?: string;
  }>();

  const initialDraft = useMemo<SongDraft>(() => {
    const raw = readParam(params.draft);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isSongDraft(parsed)) return parsed;
      } catch {
        // malformed JSON — fall through to a manual draft
      }
    }
    return emptyDraft(readParam(params.title), readParam(params.artist));
  }, [params.draft, params.title, params.artist]);

  return <ScoreForm mode="new" initialDraft={initialDraft} />;
}
