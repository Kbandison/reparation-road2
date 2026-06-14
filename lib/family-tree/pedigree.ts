// Horizontal ancestor-pedigree layout. Rooted at a focal person on the left,
// ancestors fan out to the right. Only direct parent links are drawn; spouses,
// children, and other collateral relatives are surfaced separately (in a
// per-card dropdown) and ancestors past the depth cap hide behind an expand
// toggle. This is a derived *view* over the free-form graph — nothing here is
// persisted.

import type { TreeIndividual, TreeRelationship } from '@/lib/types';
import { CARD_W, CARD_H } from './layout';

export const PED_COL_X = 328; // horizontal gap between generations
export const PED_ROW_Y = 132; // vertical gap between leaf ancestors
export const DEFAULT_DEPTH = 5; // generations shown before the expand toggle

export type RelationKind = 'spouse' | 'child' | 'parent' | 'relative';

export interface OffLineRelative {
  id: string;
  relation: RelationKind;
}

export interface Pedigree {
  positions: Record<string, { x: number; y: number }>;
  gen: Record<string, number>;
  visibleIds: string[];
  // child -> parent links among visible nodes
  links: { childId: string; parentId: string }[];
  // immediate relatives of a visible node that are NOT on the chart
  offLine: Record<string, OffLineRelative[]>;
  // visible nodes that still have hidden ancestors (can be expanded)
  expandable: Record<string, boolean>;
}

interface Maps {
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
  spouses: Map<string, string[]>;
}

function buildMaps(individuals: TreeIndividual[], relationships: TreeRelationship[]): Maps {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();
  const ids = new Set(individuals.map((i) => i.id));
  for (const i of individuals) {
    parents.set(i.id, []);
    children.set(i.id, []);
    spouses.set(i.id, []);
  }
  for (const r of relationships) {
    if (!ids.has(r.from_id) || !ids.has(r.to_id)) continue;
    if (r.type === 'parent') {
      children.get(r.from_id)!.push(r.to_id);
      parents.get(r.to_id)!.push(r.from_id);
    } else {
      spouses.get(r.from_id)!.push(r.to_id);
      spouses.get(r.to_id)!.push(r.from_id);
    }
  }
  return { parents, children, spouses };
}

// Default focal person: prefer a "leaf" descendant (no children in the tree)
// with the deepest known ancestry, so the pedigree shows as much as possible.
export function pickDefaultFocal(
  individuals: TreeIndividual[],
  relationships: TreeRelationship[]
): string | null {
  if (individuals.length === 0) return null;
  const { parents, children } = buildMaps(individuals, relationships);

  const memo = new Map<string, number>();
  function ancestorCount(id: string, guard: Set<string>): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (guard.has(id)) return 0;
    guard.add(id);
    let c = 0;
    for (const p of parents.get(id) ?? []) c += 1 + ancestorCount(p, guard);
    guard.delete(id);
    memo.set(id, c);
    return c;
  }

  let best = individuals[0].id;
  let bestScore = -1;
  for (const i of individuals) {
    const isLeaf = (children.get(i.id) ?? []).length === 0;
    const score = ancestorCount(i.id, new Set()) + (isLeaf ? 10000 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = i.id;
    }
  }
  return best;
}

interface BuildOptions {
  focalId: string | null;
  baseDepth?: number;
  expanded: Set<string>;
}

export function buildPedigree(
  individuals: TreeIndividual[],
  relationships: TreeRelationship[],
  { focalId, baseDepth = DEFAULT_DEPTH, expanded }: BuildOptions
): Pedigree {
  const empty: Pedigree = {
    positions: {},
    gen: {},
    visibleIds: [],
    links: [],
    offLine: {},
    expandable: {},
  };
  const idSet = new Set(individuals.map((i) => i.id));
  if (!focalId || !idSet.has(focalId)) return empty;

  const { parents, children, spouses } = buildMaps(individuals, relationships);

  // Reveal ancestors generation by generation. A node reveals its parents when
  // they sit within the base window, or when the node has been explicitly
  // expanded (which chains: an expanded boundary node's parents become the new
  // boundary, each with their own toggle).
  const genMap = new Map<string, number>();
  genMap.set(focalId, 0);
  const queue: string[] = [focalId];
  while (queue.length) {
    const id = queue.shift()!;
    const g = genMap.get(id)!;
    const withinWindow = g + 1 <= baseDepth - 1;
    if (withinWindow || expanded.has(id)) {
      for (const p of parents.get(id) ?? []) {
        if (!genMap.has(p)) {
          genMap.set(p, g + 1);
          queue.push(p);
        }
      }
    }
  }

  const visible = new Set(genMap.keys());
  const result: Pedigree = { ...empty, positions: {}, gen: {}, offLine: {}, expandable: {} };
  result.visibleIds = [...visible];
  for (const [id, g] of genMap) result.gen[id] = g;

  for (const id of visible) {
    for (const p of parents.get(id) ?? []) {
      if (visible.has(p)) result.links.push({ childId: id, parentId: p });
    }
    if ((parents.get(id) ?? []).some((p) => !visible.has(p))) {
      result.expandable[id] = true;
    }

    const rels: OffLineRelative[] = [];
    for (const sp of spouses.get(id) ?? []) if (!visible.has(sp)) rels.push({ id: sp, relation: 'spouse' });
    for (const ch of children.get(id) ?? []) if (!visible.has(ch)) rels.push({ id: ch, relation: 'child' });
    const seen = new Set<string>();
    result.offLine[id] = rels.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }

  // Vertical placement: leaves get sequential slots; each node centers on the
  // average y of its visible parents (the classic pedigree bracket).
  const yMemo = new Map<string, number>();
  let slot = 0;
  function assignY(id: string, guard: Set<string>): number {
    const cached = yMemo.get(id);
    if (cached !== undefined) return cached;
    if (guard.has(id)) return slot * PED_ROW_Y;
    guard.add(id);
    const vps = (parents.get(id) ?? []).filter((p) => visible.has(p));
    let y: number;
    if (vps.length === 0) {
      y = slot * PED_ROW_Y;
      slot += 1;
    } else {
      const ys = vps.map((p) => assignY(p, guard));
      y = ys.reduce((a, b) => a + b, 0) / ys.length;
    }
    guard.delete(id);
    yMemo.set(id, y);
    return y;
  }
  assignY(focalId, new Set());

  for (const id of visible) {
    const g = genMap.get(id)!;
    const y = yMemo.get(id) ?? (slot++ * PED_ROW_Y);
    result.positions[id] = { x: g * PED_COL_X, y };
  }

  return result;
}

export { CARD_W, CARD_H };
