/**
 * Native (iOS/Android) library export — writes the JSON to a cache file with
 * the SDK 57 expo-file-system `File`/`Paths` API, then hands it to the OS share
 * sheet via expo-sharing (save to Files, AirDrop, email, …).
 *
 * The web build resolves `library-export.web.ts` instead — expo-sharing can't
 * share a local file by URI on web.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  buildExportDocument,
  exportFilename,
  serializeExport,
  type ExportResult,
} from './library-export-shared';
import type { ScoredSong } from './types';

export async function exportLibrary(songs: ScoredSong[]): Promise<ExportResult> {
  const exportedAt = new Date();
  const json = serializeExport(buildExportDocument(songs, exportedAt));
  const filename = exportFilename(exportedAt);

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(json);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Setlist Litmus Test library',
    UTI: 'public.json',
  });

  return { filename, songCount: songs.length, shared: true };
}
