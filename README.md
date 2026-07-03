# Setlist Litmus Test

A pocket tool for a cover band: search a candidate song, pull its tempo / key /
danceability from [GetSongBPM](https://getsongbpm.com), score it against a
7-category "will it keep the dance floor full?" rubric, and build a local
library of keepers, maybes, and cuts.

Built with [Expo](https://expo.dev) (SDK 57, React Native) — one codebase for
iOS and Android, offline-first storage via SQLite.

> Song data by [GetSongBPM.com](https://getsongbpm.com). A visible backlink to
> getsongbpm.com is **required** by their API terms — it lives on the Search
> screen (native) and the top bar (web). Keep it, or the API key gets
> suspended. If this app ever ships to a store, the store listing needs the
> link too.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Get a free GetSongBPM API key at <https://getsongbpm.com/api>
   (registration requires a backlink URL — see note above).

3. Paste the key into `.env` in the project root:

   ```
   EXPO_PUBLIC_GETSONGBPM_API_KEY=your_actual_key
   ```

   `.env` is gitignored. After editing it, restart the dev server.

4. Start the dev server:

   ```bash
   npx expo start
   ```

   Scan the QR code with [Expo Go](https://expo.dev/go) on a phone (same
   network as this machine — use `npx expo start --tunnel` if LAN discovery
   fails), or press `w` for the web preview.

## The rubric

Seven categories, each scored 0–2 by the band, 14 points max:

| Category | Auto-filled from metadata? |
|---|---|
| Recognition | no — band judgment |
| Groove | suggested from danceability (>65 → 2, 35–65 → 1, <35 → 0) |
| Tempo Fit | suggested from BPM (100–128 → 2, 90–99 / 129–140 → 1, else 0) |
| Audience Fit | no |
| Transition | no — but tempo/key are surfaced for judging |
| Band Execution | no |
| Repeat Value | no |

Auto-suggestions are always overridable — a great ballad can earn its slot.

**Tiers:** 10+ = Keeper · 7–9 = Maybe/Discuss · <7 = Cut

## Project layout

```
src/
  app/              expo-router screens
    (tabs)/index    Search / add song
    (tabs)/library  Scored-song library
    score           Scoring screen
  components/       themed UI primitives (from the Expo template)
  lib/
    types.ts        domain model (SongDraft, ScoredSong, rubric)
    scoring.ts      auto-score rules + tier math
    api/getsongbpm.ts  API client
    song-store-shared.ts  SongStore contract + buildScoredSong()
    song-store.tsx        native store — expo-sqlite (SQLiteProvider + onInit migration)
    song-store.web.tsx    web store — localStorage (see below)
```

## Storage

The scored-song library is offline-first local storage, split by platform via
Metro's file resolution (same pattern as the `*.web.tsx` UI files):

- **iOS / Android** (`song-store.tsx`) — **expo-sqlite**, the store the product
  ships with. Schema lives in a `SQLiteProvider` `onInit` migration versioned by
  `PRAGMA user_version`.
- **Web preview** (`song-store.web.tsx`) — **localStorage**. SQLite-on-web is
  still alpha in SDK 57 (needs a WASM build + COOP/COEP headers for
  SharedArrayBuffer); the web build is a dev/demo convenience, not a shipping
  target, so it uses a lightweight shim with the same `SongStore` interface.

Screens only ever see the `SongStore` interface + `useSongStore()` hook, so the
backend split is invisible to them and the export schema (M4) is identical
either way.

## Milestones

- [x] **M1** — scaffold, song search, GetSongBPM integration, manual-entry fallback
- [x] **M2** — scoring screen (7-category rubric, auto-fill + override, notes, save to SQLite)
- [ ] **M3** — library (sort by score/tempo/title, filter by tier/genre) + song detail
- [ ] **M4** — JSON export of the library (schema documented in `SCHEMA.md`)

Out of scope for the MVP: cloud sync, multi-user, audio analysis, CSV export,
import flows.

## GetSongBPM API notes (hard-won)

- Base URL is `https://api.getsong.co` — **trailing slashes are required**
  (`/search/`, not `/search`).
- Auth is the `api_key` query param; the documented `X-API-KEY` header is not
  actually honored by the server.
- `tempo` and `time_sig` come back as strings and can be null.
- `danceability` 0 usually means "no analysis data", not "undanceable" — the
  client normalizes 0 to null so it won't mis-suggest a Groove score.
- No results looks like `{"search": {"error": "no result"}}` with HTTP 200.
- Rate limit: 3000 requests/hour; exceeding it blocks the key for an hour.
