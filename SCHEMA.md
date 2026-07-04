# Setlist Litmus Test — Export Schema

The Library screen's **Export JSON** action writes the whole library to a single
JSON file (`setlist-litmus-test-YYYY-MM-DD.json`). On iOS/Android it opens the
share sheet; on web it downloads the file.

This document is the contract for that file — the interchange format a future
setlist app would import. There is **no import flow yet**; this is the forward
hook, kept clean and versioned so one can be added without guesswork.

Field names are `snake_case` (matching the app's data model and SQLite columns).

## Document

```jsonc
{
  "format": "setlist-litmus-test", // constant; identifies the file type
  "schema_version": 1,             // integer; bump on any breaking field change
  "exported_at": "2026-07-04T15:12:03.000Z", // ISO-8601 UTC timestamp of export
  "app_version": "1.0.0",          // app version that produced the file, or null
  "song_count": 2,                 // integer; equals songs.length
  "songs": [ /* Song objects, see below */ ]
}
```

| Field | Type | Notes |
|---|---|---|
| `format` | string | Always `"setlist-litmus-test"`. |
| `schema_version` | integer | Currently `1`. Importers should reject unknown major versions. |
| `exported_at` | string | ISO-8601 timestamp (UTC) when the file was written. |
| `app_version` | string \| null | The app `version` from `app.json`, or `null` if unavailable. |
| `song_count` | integer | Number of entries in `songs`. |
| `songs` | Song[] | The scored songs, newest-scored first. |

## Song

```jsonc
{
  "id": "lz4f8k-3n1p9q",          // stable local id (not a UUID)
  "title": "Uptown Funk",
  "artist": "Mark Ronson ft. Bruno Mars",
  "genre": "Funk",                 // nullable
  "tempo_bpm": 115,                // number | null (BPM)
  "key": "Dm",                     // nullable musical key
  "time_signature": "4/4",         // nullable
  "danceability_raw": null,        // GetSongBPM 0-100, or null
  "acousticness_raw": null,        // GetSongBPM 0-100, or null
  "data_source": "manual",         // "getsongbpm" | "manual"
  "source_song_id": null,          // GetSongBPM song id, or null (manual)
  "rubric_scores": {
    "recognition": 2,
    "groove": 2,
    "tempo_fit": 2,
    "audience_fit": 2,
    "transition": 2,
    "band_execution": 1,
    "repeat_value": 2
  },
  "total_score": 13,               // 0-14; sum of the seven rubric_scores
  "tier": "keeper",                // "keeper" | "maybe" | "cut"
  "notes": "Killer set opener.",   // free text ("" if none)
  "date_added": "2026-07-02T20:10:00.000Z",       // ISO-8601
  "date_last_scored": "2026-07-02T20:12:30.000Z"  // ISO-8601
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable within one device's library. Time-ordered prefix; **not** a UUID. |
| `title` | string | Required, non-empty. |
| `artist` | string | Required, non-empty. |
| `genre` | string \| null | |
| `tempo_bpm` | number \| null | Beats per minute. |
| `key` | string \| null | e.g. `"Am"`, `"Dm"`. |
| `time_signature` | string \| null | e.g. `"4/4"`. |
| `danceability_raw` | number \| null | GetSongBPM danceability, 0–100. `null` when unknown (0 is normalized to `null` on import from the API). |
| `acousticness_raw` | number \| null | GetSongBPM acousticness, 0–100. |
| `data_source` | enum | `"getsongbpm"` (metadata from the API) or `"manual"`. |
| `source_song_id` | string \| null | GetSongBPM song id for provenance / re-fetch. |
| `rubric_scores` | object | The seven categories below, each an integer `0`–`2`. All seven are always present. |
| `total_score` | integer | `0`–`14`. Always equals the sum of `rubric_scores`. |
| `tier` | enum | Derived from `total_score`: `>= 10` → `"keeper"`, `7`–`9` → `"maybe"`, `< 7` → `"cut"`. |
| `notes` | string | May be empty. |
| `date_added` | string | ISO-8601 UTC; when first saved. |
| `date_last_scored` | string | ISO-8601 UTC; when the scores were last changed. |

### `rubric_scores`

Seven categories, each an integer `0`, `1`, or `2` (14 max):

| Key | Category |
|---|---|
| `recognition` | Recognition — does the crowd know it fast? |
| `groove` | Groove — does it make people move? |
| `tempo_fit` | Tempo Fit — in the dance-floor tempo sweet spot? |
| `audience_fit` | Audience Fit — right for the crowds we play? |
| `transition` | Transition — fits next to other setlist songs on tempo/key? |
| `band_execution` | Band Execution — can the six of us pull it off? |
| `repeat_value` | Repeat Value — stays fresh gig after gig? |

## Redundant-but-stable fields

`total_score` and `tier` are derived from `rubric_scores`, and are included so a
reader needs no scoring logic. An importer that wants to be strict can recompute
them and treat a mismatch as a corrupt record.

## Versioning

`schema_version` is `1`. Additive fields may appear without a bump; any rename or
removal bumps the version. Importers should read `format` and `schema_version`
first and refuse files they don't understand.
