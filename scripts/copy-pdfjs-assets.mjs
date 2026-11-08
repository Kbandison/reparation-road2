// Copies PDF.js's worker and the data files it fetches at runtime (WebAssembly
// image decoders, character maps, standard fonts, ICC colour profiles) into
// public/pdfjs/, so the admin image blur can render PDFs in the browser.
//
// Runs before `next dev` and `next build` (predev / prebuild), so the files
// always match the installed pdfjs-dist. public/pdfjs/ is git-ignored.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// pdfjs-dist's main entry is build/pdf.mjs, so its folder's parent is the package root.
const pkg = join(dirname(require.resolve('pdfjs-dist')), '..');
const out = join(root, 'public', 'pdfjs');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(join(pkg, 'build', 'pdf.worker.min.mjs'), join(out, 'pdf.worker.min.mjs'));
for (const dir of ['wasm', 'cmaps', 'standard_fonts', 'iccs']) {
  const from = join(pkg, dir);
  if (!existsSync(from)) throw new Error(`pdfjs-dist is missing ${dir}/ — was it upgraded? Check its package layout.`);
  cpSync(from, join(out, dir), { recursive: true });
}

console.log('[pdfjs] copied the worker and runtime data into public/pdfjs/');
