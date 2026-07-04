/**
 * Native (iOS/Android) library import — pick a .json via expo-document-picker,
 * read it with the SDK 57 expo-file-system File API, then parse + merge.
 * The web build resolves `library-import.web.ts` instead.
 */

import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { importFromJsonText, type ImportOutcome } from './library-import-shared';
import type { SongStore } from './song-store-shared';

export async function importLibrary(store: SongStore): Promise<ImportOutcome> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true, // gives a readable file:// uri in the app cache
    multiple: false,
  });
  if (result.canceled) return { status: 'cancelled' };

  const asset = result.assets[0];
  if (!asset) return { status: 'cancelled' };

  let text: string;
  try {
    text = new File(asset.uri).textSync();
  } catch {
    return { status: 'error', message: 'Could not read that file.' };
  }
  return importFromJsonText(store, text);
}
