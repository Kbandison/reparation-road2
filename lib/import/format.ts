// Display helpers for import feedback in the wizard.

/**
 * Spreadsheet row numbers as a short, readable list: consecutive runs collapse
 * into ranges, and long lists end with a count.
 *   [2, 3, 4, 9, 12, 13] → "2–4, 9, 12–13"
 */
export function formatRowList(rows: number[], maxParts = 8): string {
  const sorted = [...new Set(rows)].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const row of sorted) {
    const last = runs[runs.length - 1];
    if (last && row === last[1] + 1) last[1] = row;
    else runs.push([row, row]);
  }

  const fmt = (n: number) => n.toLocaleString('en-US');
  const shown = runs
    .slice(0, maxParts)
    .map(([start, end]) => (start === end ? fmt(start) : `${fmt(start)}–${fmt(end)}`));
  if (runs.length <= maxParts) return shown.join(', ');

  const hidden = runs.slice(maxParts).reduce((sum, [start, end]) => sum + end - start + 1, 0);
  return `${shown.join(', ')} and ${fmt(hidden)} more`;
}

/** A cell value short enough to quote inline; long transcriptions are cut with an ellipsis. */
export function clipValue(value: string, maxLength = 40): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
