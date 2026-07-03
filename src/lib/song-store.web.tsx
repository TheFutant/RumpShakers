/**
 * Web song store — localStorage backed.
 *
 * SQLite-on-web is alpha in SDK 57 (needs a WASM build + COOP/COEP headers for
 * SharedArrayBuffer), so the web preview uses localStorage instead. The web
 * build is a dev/demo convenience; iOS/Android ship with the expo-sqlite store
 * in `song-store.tsx`. Same `SongStore` contract either way.
 *
 * `app.json` sets web output to "static", so this module is also imported
 * during Node prerender where `window` is undefined — every localStorage touch
 * is guarded, and reads/writes only happen inside async methods (never at
 * module load or render time).
 */

import { createContext, useContext, type ReactNode } from 'react';

import type { ScoredSong } from './types';
import type { SongStore } from './song-store-shared';

const STORAGE_KEY = 'slt.songs.v1';

function readAll(): ScoredSong[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ScoredSong[]) : [];
  } catch {
    return [];
  }
}

function writeAll(songs: ScoredSong[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
}

const webStore: SongStore = {
  async getAll() {
    return readAll().sort((a, b) => b.dateLastScored.localeCompare(a.dateLastScored));
  },
  async getById(id) {
    return readAll().find((s) => s.id === id) ?? null;
  },
  async save(song) {
    const others = readAll().filter((s) => s.id !== song.id);
    writeAll([...others, song]);
  },
  async remove(id) {
    writeAll(readAll().filter((s) => s.id !== id));
  },
};

const StoreContext = createContext<SongStore>(webStore);

export function SongStoreProvider({ children }: { children: ReactNode }) {
  return <StoreContext.Provider value={webStore}>{children}</StoreContext.Provider>;
}

export function useSongStore(): SongStore {
  return useContext(StoreContext);
}
