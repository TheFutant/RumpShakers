/**
 * Web library export — triggers a browser download of the JSON via a Blob +
 * object URL. expo-sharing on web can't share a local file by URI, so the
 * native `library-export.ts` path doesn't apply here.
 */

import {
  buildExportDocument,
  exportFilename,
  serializeExport,
  type ExportResult,
} from './library-export-shared';
import type { ScoredSong } from './types';

export async function exportLibrary(songs: ScoredSong[]): Promise<ExportResult> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('Export is only available in the browser.');
  }

  const exportedAt = new Date();
  const json = serializeExport(buildExportDocument(songs, exportedAt));
  const filename = exportFilename(exportedAt);

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return { filename, songCount: songs.length, shared: false };
}
