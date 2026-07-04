/**
 * Web library import — a hidden <input type="file"> picks the .json, then parse
 * + merge. No expo-document-picker on web (keeps it out of the web bundle).
 * The input is appended to the DOM (not just clicked) so it round-trips through
 * the file chooser reliably.
 */

import { importFromJsonText, type ImportOutcome } from './library-import-shared';
import type { SongStore } from './song-store-shared';

export function importLibrary(store: SongStore): Promise<ImportOutcome> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ status: 'error', message: 'Import is only available in the browser.' });
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.position = 'fixed';
    input.style.left = '-9999px';

    let settled = false;
    const finish = (outcome: ImportOutcome) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(outcome);
    };

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        finish({ status: 'cancelled' });
        return;
      }
      try {
        const text = await file.text();
        finish(await importFromJsonText(store, text));
      } catch {
        finish({ status: 'error', message: 'Could not read that file.' });
      }
    };
    // Fired by Chromium when the file dialog is dismissed without a selection.
    input.oncancel = () => finish({ status: 'cancelled' });

    document.body.appendChild(input);
    input.click();
  });
}
