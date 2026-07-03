/**
 * GetSongBPM API client (https://api.getsong.co).
 *
 * Contract notes (verified against the live API + official docs, 2026-07):
 * - Every endpoint requires a TRAILING SLASH (/search/ not /search) — without
 *   it the API returns a 404 HTML page.
 * - Auth is the `api_key` query param only. The documented X-API-KEY header
 *   is not honored by the server.
 * - Search results already include the full song object (tempo, key_of,
 *   time_sig, danceability, acousticness, artist.genres), so no follow-up
 *   /song/ call is needed.
 * - `tempo` and `time_sig` are strings (docs claim integers) and can be null.
 * - `danceability`/`acousticness` are numbers 0-100, but 0 usually means
 *   "no analysis data", so we normalize 0 → null for both.
 * - "No results" is HTTP 200 with `search` as an OBJECT: {"search":{"error":"no result"}}.
 * - Error bodies are JSON served with a text/html content-type — always
 *   attempt JSON.parse regardless of headers.
 * - Rate limit: 3000 req/hour, exceeding it blocks the key for an hour (429).
 */

import type { SongDraft } from '../types';

const BASE_URL = 'https://api.getsong.co';
const KEY_PLACEHOLDER = 'paste_your_key_here';
// Trim once here so a quoted .env value with stray whitespace (which would
// otherwise pass hasApiKey() but get percent-encoded into the request and 401)
// is normalized everywhere the key is used. Must be read via static
// dot-notation for EXPO_PUBLIC_* inlining.
const RAW_API_KEY = process.env.EXPO_PUBLIC_GETSONGBPM_API_KEY;
const API_KEY = typeof RAW_API_KEY === 'string' ? RAW_API_KEY.trim() : undefined;

export function hasApiKey(): boolean {
  return typeof API_KEY === 'string' && API_KEY.length > 0 && API_KEY !== KEY_PLACEHOLDER;
}

export type GetSongBpmErrorKind =
  | 'missing_key'
  | 'invalid_key'
  | 'rate_limited'
  | 'network'
  | 'bad_response';

export class GetSongBpmError extends Error {
  readonly kind: GetSongBpmErrorKind;

  constructor(kind: GetSongBpmErrorKind, message: string) {
    super(message);
    this.name = 'GetSongBpmError';
    this.kind = kind;
  }
}

export function friendlyMessage(error: unknown): string {
  if (error instanceof GetSongBpmError) {
    switch (error.kind) {
      case 'missing_key':
        return 'No GetSongBPM API key configured — paste yours into .env and restart the dev server.';
      case 'invalid_key':
        return 'GetSongBPM rejected the API key. Double-check the value in .env (and that the key is activated).';
      case 'rate_limited':
        return 'GetSongBPM rate limit hit — the key is blocked for up to an hour. Add songs manually for now.';
      case 'network':
        return "Couldn't reach GetSongBPM — check your connection, or add the song manually.";
      case 'bad_response':
        return `GetSongBPM returned something unexpected (${error.message}). Try again, or add the song manually.`;
    }
  }
  return 'Something went wrong searching GetSongBPM. Try again, or add the song manually.';
}

/** Raw API shapes — only the fields we consume. */
interface ApiArtist {
  name?: string | null;
  genres?: string[] | null;
}

interface ApiSong {
  id?: string | null;
  title?: string | null;
  tempo?: string | number | null;
  time_sig?: string | null;
  key_of?: string | null;
  danceability?: number | null;
  acousticness?: number | null;
  artist?: ApiArtist | null;
  album?: { title?: string | null; year?: string | number | null } | null;
}

/** A parsed, UI-ready search result. */
export interface SongSearchResult {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  tempoBpm: number | null;
  key: string | null;
  timeSignature: string | null;
  danceability: number | null;
  acousticness: number | null;
  albumTitle: string | null;
  albumYear: string | null;
}

function buildUrl(path: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${BASE_URL}${path}?${query}`;
}

async function request(path: string, params: Record<string, string>): Promise<any> {
  if (!hasApiKey()) {
    throw new GetSongBpmError('missing_key', 'API key is not configured.');
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, { api_key: API_KEY!, ...params }));
  } catch {
    throw new GetSongBpmError('network', 'Network request failed.');
  }

  const text = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    // 404s (e.g. missing trailing slash) return HTML — leave data null.
  }

  if (response.status === 401) {
    throw new GetSongBpmError('invalid_key', data?.error ?? 'Invalid API key.');
  }
  if (response.status === 429) {
    throw new GetSongBpmError('rate_limited', data?.error ?? 'Rate limit exceeded.');
  }
  if (!response.ok || data == null) {
    throw new GetSongBpmError('bad_response', `HTTP ${response.status}`);
  }
  return data;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseApiSong(song: ApiSong): SongSearchResult | null {
  const id = parseString(song?.id);
  const title = parseString(song?.title);
  if (!id || !title) return null;

  const tempoBpm = parseNumber(song.tempo);
  const danceability = parseNumber(song.danceability);
  const acousticness = parseNumber(song.acousticness);
  const albumYear = song.album?.year;

  // For both danceability and acousticness, 0 almost always means "no analysis
  // data" rather than a real measurement — normalize it to null so the UI shows
  // an em-dash instead of a bogus "0/100".
  const normalizeAnalysis = (n: number | null) => (n != null && n > 0 ? n : null);

  return {
    id,
    title,
    artist: parseString(song.artist?.name) ?? 'Unknown artist',
    genre: parseString(song.artist?.genres?.[0] ?? null),
    tempoBpm: tempoBpm != null && tempoBpm > 0 ? tempoBpm : null,
    key: parseString(song.key_of),
    timeSignature: parseString(song.time_sig),
    danceability: normalizeAnalysis(danceability),
    acousticness: normalizeAnalysis(acousticness),
    albumTitle: parseString(song.album?.title ?? null),
    albumYear: albumYear != null ? parseString(String(albumYear)) : null,
  };
}

async function searchRaw(type: 'song' | 'both', lookup: string): Promise<SongSearchResult[]> {
  const data = await request('/search/', { type, lookup, limit: '25' });

  // Top-level {"error": "Bad query."} — malformed request.
  if (typeof data?.error === 'string') {
    throw new GetSongBpmError('bad_response', data.error);
  }
  if (Array.isArray(data?.search)) {
    return (data.search as ApiSong[])
      .map(parseApiSong)
      .filter((r): r is SongSearchResult => r != null);
  }
  // {"search": {"error": "no result"}} — a successful search with no hits.
  if (data?.search && typeof data.search === 'object') {
    return [];
  }
  throw new GetSongBpmError('bad_response', 'Unexpected response shape.');
}

/**
 * Search by title, optionally narrowed by artist. With an artist we try the
 * combined `type=both` lookup first, then fall back to a title-only search
 * ranked by artist match (the API's combined search can be strict).
 */
export async function searchSongs(title: string, artist?: string): Promise<SongSearchResult[]> {
  const cleanTitle = title.trim();
  const cleanArtist = artist?.trim();

  if (cleanArtist) {
    try {
      const combined = await searchRaw('both', `song:${cleanTitle} artist:${cleanArtist}`);
      if (combined.length > 0) return combined;
    } catch (error) {
      // A "Bad query." on type=both shouldn't kill the search — fall through
      // to the title-only strategy. Real failures (auth, network) propagate.
      if (!(error instanceof GetSongBpmError && error.kind === 'bad_response')) {
        throw error;
      }
    }
    const byTitle = await searchRaw('song', cleanTitle);
    const needle = cleanArtist.toLowerCase();
    const artistMatches = byTitle.filter((r) => r.artist.toLowerCase().includes(needle));
    return artistMatches.length > 0 ? artistMatches : byTitle;
  }

  return searchRaw('song', cleanTitle);
}

/** Convert a search result into the draft the scoring screen consumes. */
export function toSongDraft(result: SongSearchResult): SongDraft {
  return {
    title: result.title,
    artist: result.artist,
    genre: result.genre,
    tempoBpm: result.tempoBpm,
    key: result.key,
    timeSignature: result.timeSignature,
    danceabilityRaw: result.danceability,
    acousticnessRaw: result.acousticness,
    dataSource: 'getsongbpm',
    sourceSongId: result.id,
  };
}
