# Shared library sync (Supabase)

Optional. Off by default — with no Supabase config the app is a purely local,
single-device library and none of this runs. Turn it on and the whole band
converges on one shared library, while every device still works fully offline.

## How it works

The local store (expo-sqlite on native, localStorage on web) stays the
**source of truth** for every read and write. Sync is a separate, explicit
reconcile:

1. **Pull** every row from the shared Supabase `songs` table — tombstones
   included.
2. **Compare** with every local row by `id`.
3. **Last-write-wins** on `date_last_scored` (bumped on edit *and* delete): the
   more-recently-changed side wins, and the winner is written to whichever side
   is stale.

Deletes are **soft** — a `deleted_at` tombstone + a bumped `date_last_scored` —
so a delete on one phone propagates through sync instead of the row reappearing
on the next pull. The UI hides tombstoned rows (`getAll`/`getById`); sync sees
them (`getAllIncludingDeleted`).

Sync runs once automatically when the Library screen opens (if configured and
online) and on demand via the **Sync** button. Timestamps are normalized to
ISO-8601 UTC so LWW is correct across Postgres `timestamptz` (`…+00:00`) and
local (`…Z`) formats.

Code: `src/lib/sync.ts` (reconcile), `src/lib/supabase-client{,.web}.ts`
(client), `src/lib/sync-config.ts` (env gate). The LWW-by-`id` merge is shared
with file import (`src/lib/library-import-shared.ts`).

## Setup (~2 minutes)

1. Create a free project at **supabase.com** → **New project**.
2. In the project's **SQL Editor**, run:

   ```sql
   create table if not exists songs (
     id text primary key,
     title text not null,
     artist text not null,
     genre text,
     tempo_bpm double precision,
     key text,
     time_signature text,
     danceability_raw double precision,
     acousticness_raw double precision,
     data_source text not null,
     source_song_id text,
     rubric_scores jsonb not null,
     total_score integer not null,
     tier text not null,
     notes text not null default '',
     date_added timestamptz not null,
     date_last_scored timestamptz not null,
     deleted_at timestamptz
   );
   alter table songs enable row level security;
   create policy "band access" on songs for all using (true) with check (true);
   ```

3. From **Project Settings → API**, copy the **Project URL** and **anon public**
   key into `.env`:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```

   Restart the dev server. A **Sync** button appears in the Library header.

4. To enable sync on the deployed web build too, add the same two values as CI
   build args (mirroring `EXPO_PUBLIC_GETSONGBPM_API_KEY`).

## Security model

Access is the Supabase **anon key** + a permissive row policy — one shared table
is one band's library. Like the GetSongBPM key, the anon key is **public** in
the web bundle, so this is "shared band access, lightly gated," not hardened:
anyone with the URL + anon key can read/write the table. Fine for a private band
tool. For per-member accounts, swap the anon key for Supabase Auth and tighten
the RLS policy.

## Known limitations

- **Conflict model is last-write-wins**, whole-record. If two people edit the
  *same* song offline, the later `date_last_scored` wins outright (no field-level
  merge). Rare at 6 users; fine for this tool.
- **Tombstones accumulate** — deleted rows stay in Supabase forever. Harmless at
  this scale; prune with a periodic `delete from songs where deleted_at < …` if
  it ever matters.
- **No realtime** — sync is on open + on the button, not a live subscription.
  supabase-js realtime could be added later.
