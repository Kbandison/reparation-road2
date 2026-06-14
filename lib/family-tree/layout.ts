// Generational auto-layout for a family tree. Produces an initial set of
// canvas coordinates (parents above children, couples side by side, each
// generation centered). It is intentionally "good enough" — the user can drag
// any card afterwards — and is pure so it runs on the server (after a GEDCOM
// import) and the client (the "Arrange" button) alike.

export interface LayoutEdge {
  type: 'parent' | 'spouse';
  from_id: string;
  to_id: string;
}

export interface Position {
  x: number;
  y: number;
}

// Card footprint and the spacing between cards. Kept in one place so the canvas
// renderer and the layout agree on geometry.
export const CARD_W = 200;
export const CARD_H = 84;
const COL_SPACING = 256;
const ROW_SPACING = 184;

export function computeLayout(
  nodes: { id: string }[],
  edges: LayoutEdge[]
): Record<string, Position> {
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);

  const parentsOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  for (const id of ids) {
    parentsOf.set(id, []);
    spousesOf.set(id, []);
  }
  for (const e of edges) {
    if (!idSet.has(e.from_id) || !idSet.has(e.to_id)) continue;
    if (e.type === 'parent') {
      parentsOf.get(e.to_id)!.push(e.from_id);
    } else {
      spousesOf.get(e.from_id)!.push(e.to_id);
      spousesOf.get(e.to_id)!.push(e.from_id);
    }
  }

  // Generation = longest path from a root (someone with no parents). Memoized,
  // with a cycle guard in case the data has a loop.
  const gen = new Map<string, number>();
  const inProgress = new Set<string>();
  function computeGen(id: string): number {
    const cached = gen.get(id);
    if (cached !== undefined) return cached;
    if (inProgress.has(id)) return 0;
    inProgress.add(id);
    let g = 0;
    for (const p of parentsOf.get(id)!) g = Math.max(g, computeGen(p) + 1);
    inProgress.delete(id);
    gen.set(id, g);
    return g;
  }
  for (const id of ids) computeGen(id);

  // Pull spouses onto the same (deeper) generation row.
  let changed = true;
  let guard = 0;
  while (changed && guard++ < ids.length + 1) {
    changed = false;
    for (const id of ids) {
      for (const sp of spousesOf.get(id)!) {
        const mx = Math.max(gen.get(id)!, gen.get(sp)!);
        if (gen.get(id)! !== mx) {
          gen.set(id, mx);
          changed = true;
        }
        if (gen.get(sp)! !== mx) {
          gen.set(sp, mx);
          changed = true;
        }
      }
    }
  }

  const byGen = new Map<number, string[]>();
  for (const id of ids) {
    const g = gen.get(id)!;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g)!.push(id);
  }
  const gens = [...byGen.keys()].sort((a, b) => a - b);

  // Order each row: children sit near the average position of their parents,
  // and spouses are kept adjacent.
  const slot = new Map<string, number>();
  for (const g of gens) {
    const rowNodes = byGen.get(g)!;
    const keyOf = (id: string): number => {
      const placedParents = parentsOf.get(id)!.filter((p) => slot.has(p));
      if (placedParents.length) {
        return (
          placedParents.reduce((s, p) => s + slot.get(p)!, 0) / placedParents.length
        );
      }
      return Number.POSITIVE_INFINITY;
    };

    const sorted = rowNodes
      .map((id, i) => ({ id, i, k: keyOf(id) }))
      .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k - b.k))
      .map((o) => o.id);

    const placed: string[] = [];
    const done = new Set<string>();
    for (const id of sorted) {
      if (done.has(id)) continue;
      placed.push(id);
      done.add(id);
      for (const sp of spousesOf.get(id)!) {
        if (gen.get(sp) === g && !done.has(sp)) {
          placed.push(sp);
          done.add(sp);
        }
      }
    }
    placed.forEach((id, idx) => slot.set(id, idx));
  }

  // Assign coordinates; center each generation row around x = 0.
  const pos: Record<string, Position> = {};
  for (const g of gens) {
    const rowNodes = byGen
      .get(g)!
      .slice()
      .sort((a, b) => slot.get(a)! - slot.get(b)!);
    const n = rowNodes.length;
    rowNodes.forEach((id, idx) => {
      pos[id] = { x: (idx - (n - 1) / 2) * COL_SPACING, y: g * ROW_SPACING };
    });
  }
  return pos;
}
