'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Minus,
  Upload,
  LayoutGrid,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Link2,
  Users,
  ChevronDown,
  Home,
  Target,
  Heart,
  Baby,
  Loader2,
  Sparkles,
  CornerUpLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  FamilyTree,
  TreeIndividual,
  TreeRelationship,
} from '@/lib/types';
import { CARD_W, CARD_H, computeLayout } from '@/lib/family-tree/layout';
import {
  ancestorPath,
  buildPedigree,
  pickDefaultFocal,
  DEFAULT_DEPTH,
  type OffLineRelative,
} from '@/lib/family-tree/pedigree';
import { fullName, initials, lifespan } from '@/lib/family-tree/display';
import { PersonPreview } from './person-preview';
import { ImportDialog } from './import-dialog';
import { TreeSearch } from './tree-search';

interface Props {
  readOnly?: boolean;
  /** Individuals in THIS tree that the viewer also holds. Read-only mode is
   *  looking at someone else's ids, so the counts endpoint cannot supply it. */
  overlapIds?: string[];
  /** Their individual id -> the viewer's own copy, for the preview's link. */
  overlapLinks?: Record<string, { treeId: string; individualId: string }>;
  /** Whose tree this is, named in the preview. */
  ownerName?: string;
  tree: FamilyTree;
  initialIndividuals: TreeIndividual[];
  initialRelationships: TreeRelationship[];
}

interface View {
  x: number;
  y: number;
  scale: number;
}

type Mode = 'pedigree' | 'free';

const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
const PAD = 90;
// How long the view takes to glide to a searched person.
const GLIDE_MS = 550;
// How long a found person's card pulses after arriving.
const PING_MS = 1800;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const json = { 'Content-Type': 'application/json' };

// Shared inner card content (avatar, name, dates, place, archive badge).
function PersonCardInner({
  p,
  overlapCount = 0,
}: {
  p: TreeIndividual;
  /** Other researchers holding this same person. 0 hides the badge. */
  overlapCount?: number;
}) {
  const sexClass =
    p.sex === 'M'
      ? 'bg-brand-sage/20 text-brand-sage'
      : p.sex === 'F'
        ? 'bg-brand-burgundy/25 text-brand-burgundy-light'
        : 'bg-brand-gold/15 text-brand-gold';
  return (
    <>
      <div className="flex items-center gap-2.5">
        {p.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.photo_url}
            alt={fullName(p) || ''}
            className="w-11 h-11 rounded-full object-cover shrink-0 border border-brand-gold/15"
          />
        ) : (
          <div
            className={cn(
              'w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold shrink-0',
              sexClass
            )}
          >
            {initials(p)}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-base leading-tight font-medium text-brand-cream truncate">
            {fullName(p) || 'Unnamed'}
          </p>
          {lifespan(p) && <p className="text-xs text-brand-muted truncate">{lifespan(p)}</p>}
        </div>
      </div>
      {p.birth_place && <p className="text-xs text-brand-muted truncate mt-1.5">{p.birth_place}</p>}
      {p.archive_record_id && (
        <span
          className="absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 rounded-full bg-brand-sage text-brand-bg"
          title="Linked to an archive record"
        >
          <Link2 className="w-3 h-3" />
        </span>
      )}
      {overlapCount > 0 && (
        // Opposite corner from the archive badge so the two never collide on a
        // person who is both linked and shared.
        <span
          className="absolute -top-2 -left-2 flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-brand-gold text-brand-bg text-[10px] font-semibold tabular-nums"
          title={`${overlapCount} other researcher${overlapCount === 1 ? '' : 's'} have this person`}
        >
          {overlapCount}
        </span>
      )}
    </>
  );
}

// A gold ring that ripples out from a card the search just landed on. Users who
// ask for reduced motion get a steady ring instead.
function FoundPulse() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -inset-1.5 rounded-[1.1rem] border-2 border-brand-gold motion-safe:animate-ping"
    />
  );
}

const REL_ICON: Record<OffLineRelative['relation'], typeof Heart> = {
  spouse: Heart,
  child: Baby,
  parent: Users,
  adoptive: Users,
  relative: Users,
};

export function TreeCanvas({
  tree,
  initialIndividuals,
  initialRelationships,
  // Someone else's tree: same rendering, none of the editing. The alternative
  // was a second canvas that would drift away from this one.
  readOnly = false,
  overlapIds,
  overlapLinks,
  ownerName = 'this tree',
}: Props) {
  const canEdit = !readOnly;
  const [individuals, setIndividuals] = useState<TreeIndividual[]>(initialIndividuals);
  const [relationships, setRelationships] = useState<TreeRelationship[]>(initialRelationships);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 0.9 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [mode, setMode] = useState<Mode>('pedigree');
  const [focalId, setFocalId] = useState<string | null>(() => {
    const home = tree.home_person_id;
    if (home && initialIndividuals.some((i) => i.id === home)) return home;
    return pickDefaultFocal(initialIndividuals, initialRelationships);
  });
  // The saved home person. Search can center the pedigree on someone else for
  // a while (focalId) without changing it.
  const [homeId, setHomeId] = useState<string | null>(focalId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openRelatives, setOpenRelatives] = useState<string | null>(null);
  // The person search last took the view to, and whether their card is pulsing.
  const [foundId, setFoundId] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);
  // A relative being drafted against an anchor. Null until "Add parent" and
  // again once it is saved or abandoned.
  const [draft, setDraft] = useState<{
    kind: 'parent' | 'child' | 'spouse';
    anchorId: string;
  } | null>(null);

  // How many other researchers hold each person. Empty when sharing is off,
  // which is the common case, so the badge simply never appears.
  const [overlapCounts, setOverlapCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (readOnly) {
      setOverlapCounts(Object.fromEntries((overlapIds ?? []).map((id) => [id, 1])));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tree-connections/counts');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setOverlapCounts(data.counts ?? {});
      } catch {
        // A missing badge is not worth surfacing an error over.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readOnly, overlapIds]);

  // Background archive matching (auto-runs after import / on load).
  const [matchProgress, setMatchProgress] = useState<{ done: number; remaining: number } | null>(null);
  const matchingRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const indRef = useRef(individuals);
  indRef.current = individuals;

  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const glideRef = useRef<number | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when search moves the view itself, so the frame-on-focal-change effect stands down.
  const skipAutoFrameRef = useRef(false);
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const movedRef = useRef(false);

  const byId = useMemo(() => {
    const m = new Map<string, TreeIndividual>();
    for (const p of individuals) m.set(p.id, p);
    return m;
  }, [individuals]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  // The saved home person, or the current center if that person is gone.
  const effectiveHomeId = homeId && byId.has(homeId) ? homeId : focalId;
  const homePerson = effectiveHomeId ? byId.get(effectiveHomeId) ?? null : null;

  const pedigree = useMemo(
    () =>
      mode === 'pedigree' && focalId
        ? buildPedigree(individuals, relationships, { focalId, baseDepth: DEFAULT_DEPTH, expanded })
        : null,
    [mode, focalId, individuals, relationships, expanded]
  );
  const pedigreeRef = useRef(pedigree);
  pedigreeRef.current = pedigree;

  // Repair the focal person if it was deleted or never set (e.g. after import).
  useEffect(() => {
    if (mode !== 'pedigree') return;
    if (!focalId || !byId.has(focalId)) {
      setFocalId(pickDefaultFocal(indRef.current, relationships));
    }
  }, [mode, focalId, byId, relationships]);

  // ── viewport helpers ──────────────────────────────────────────────────
  const fitTo = useCallback((nodes: { x: number; y: number }[]) => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (nodes.length === 0) {
      setView({ x: w / 2, y: h / 2, scale: 1 });
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + CARD_H);
    }
    const bw = maxX - minX;
    const bh = maxY - minY;
    const scale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, (w - PAD * 2) / Math.max(bw, 1), (h - PAD * 2) / Math.max(bh, 1), 1)
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setView({ x: w / 2 - cx * scale, y: h / 2 - cy * scale, scale });
  }, []);

  const fitCurrent = useCallback(() => {
    const ped = pedigreeRef.current;
    if (mode === 'pedigree' && ped) {
      fitTo(ped.visibleIds.map((id) => ped.positions[id]).filter(Boolean));
    } else {
      fitTo(indRef.current.map((p) => ({ x: p.pos_x, y: p.pos_y })));
    }
  }, [mode, fitTo]);

  // Frame the view on mount and when the focal person / mode changes. In
  // pedigree mode we open at a readable zoom anchored on the home person
  // (ancestors extend to the right) rather than zooming all the way out to fit
  // everyone — the Fit button still does a full fit on demand.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (skipAutoFrameRef.current) {
      skipAutoFrameRef.current = false;
      return;
    }
    if (mode === 'pedigree') {
      const ped = pedigreeRef.current;
      if (ped && focalId && ped.positions[focalId]) {
        const scale = 1;
        const fp = ped.positions[focalId];
        setView({
          scale,
          x: el.clientWidth * 0.2 - fp.x * scale,
          y: el.clientHeight / 2 - (fp.y + CARD_H / 2) * scale,
        });
        return;
      }
    }
    fitCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, focalId]);

  // ── search: glide to a person ─────────────────────────────────────────
  const stopGlide = () => {
    if (glideRef.current !== null) cancelAnimationFrame(glideRef.current);
    glideRef.current = null;
  };

  // Animate the view to `target`, moving the point at the screen's center in a
  // straight line while the zoom eases, so the camera doesn't swing in an arc.
  // Instant for anyone whose device asks for reduced motion.
  function glideTo(target: View, onDone?: () => void) {
    stopGlide();
    const el = containerRef.current;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!el || reduce) {
      setView(target);
      onDone?.();
      return;
    }
    const w = el.clientWidth;
    const h = el.clientHeight;
    const from = viewRef.current;
    const c0 = { x: (w / 2 - from.x) / from.scale, y: (h / 2 - from.y) / from.scale };
    const c1 = { x: (w / 2 - target.x) / target.scale, y: (h / 2 - target.y) / target.scale };
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / GLIDE_MS);
      const e = easeInOutCubic(t);
      const scale = from.scale + (target.scale - from.scale) * e;
      const cx = c0.x + (c1.x - c0.x) * e;
      const cy = c0.y + (c1.y - c0.y) * e;
      setView({ scale, x: w / 2 - cx * scale, y: h / 2 - cy * scale });
      if (t < 1) {
        glideRef.current = requestAnimationFrame(step);
      } else {
        glideRef.current = null;
        onDone?.();
      }
    };
    glideRef.current = requestAnimationFrame(step);
  }

  useEffect(() => () => {
    stopGlide();
    if (pingTimerRef.current) clearTimeout(pingTimerRef.current);
  }, []);

  // The view that centers a card on screen, at a readable zoom.
  function viewOnCard(pos: { x: number; y: number }): View | null {
    const el = containerRef.current;
    if (!el) return null;
    const scale = Math.min(MAX_SCALE, Math.max(1, viewRef.current.scale));
    return {
      scale,
      x: el.clientWidth / 2 - (pos.x + CARD_W / 2) * scale,
      y: el.clientHeight / 2 - (pos.y + CARD_H / 2) * scale,
    };
  }

  function markFound(id: string) {
    setFoundId(id);
    setPinging(true);
    if (pingTimerRef.current) clearTimeout(pingTimerRef.current);
    pingTimerRef.current = setTimeout(() => setPinging(false), PING_MS);
  }

  /**
   * Take the view to a person picked in search.
   * Free mode: glide to their card, then open their details.
   * Pedigree mode, whichever gets them on screen first:
   *   - already on the chart: glide there;
   *   - an ancestor past the shown generations: open the line up to them;
   *   - anyone else (cousin, descendant, in-law): center the chart on them for
   *     now; "Back to …" returns to the saved home person.
   * Their relatives dropdown opens when they have one.
   */
  function goToPerson(id: string) {
    setSelectedId(null);
    setDraft(null);

    if (mode === 'free') {
      const p = byId.get(id);
      const target = p && viewOnCard({ x: p.pos_x, y: p.pos_y });
      if (!target) return;
      markFound(id);
      glideTo(target, () => setSelectedId(id));
      return;
    }

    if (!focalId) return;
    let nextFocal = focalId;
    let nextExpanded = expanded;
    let ped = pedigree;
    if (!ped?.positions[id]) {
      const path = ancestorPath(individuals, relationships, focalId, id);
      if (path) nextExpanded = new Set([...expanded, ...path]);
      else {
        nextFocal = id;
        nextExpanded = new Set();
      }
      ped = buildPedigree(individuals, relationships, { focalId: nextFocal, baseDepth: DEFAULT_DEPTH, expanded: nextExpanded });
    }
    const pos = ped.positions[id];
    const target = pos && viewOnCard(pos);
    if (!target) return;

    if (nextFocal !== focalId) {
      skipAutoFrameRef.current = true;
      setFocalId(nextFocal);
    }
    if (nextExpanded !== expanded) setExpanded(nextExpanded);
    setOpenRelatives((ped.offLine[id]?.length ?? 0) > 0 ? id : null);
    markFound(id);
    glideTo(target);
  }

  // Leave a search-centered view for the saved home person.
  function backToHome() {
    const home = effectiveHomeId;
    if (!home) return;
    const ped = buildPedigree(individuals, relationships, { focalId: home, baseDepth: DEFAULT_DEPTH, expanded: new Set() });
    const pos = ped.positions[home];
    skipAutoFrameRef.current = true;
    setFocalId(home);
    setExpanded(new Set());
    setOpenRelatives(null);
    setFoundId(null);
    const target = pos && viewOnCard(pos);
    if (target) glideTo(target);
  }

  // ── pointer drag / pan ────────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (dragRef.current) {
        const d = dragRef.current;
        const scale = viewRef.current.scale;
        if (Math.abs(e.clientX - d.sx) > 3 || Math.abs(e.clientY - d.sy) > 3) movedRef.current = true;
        const dx = (e.clientX - d.sx) / scale;
        const dy = (e.clientY - d.sy) / scale;
        setIndividuals((prev) =>
          prev.map((p) => (p.id === d.id ? { ...p, pos_x: d.ox + dx, pos_y: d.oy + dy } : p))
        );
      } else if (panRef.current) {
        const p = panRef.current;
        const dx = e.clientX - p.sx;
        const dy = e.clientY - p.sy;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          movedRef.current = true;
          // A drag takes over from a glide in progress.
          if (glideRef.current !== null) {
            cancelAnimationFrame(glideRef.current);
            glideRef.current = null;
          }
        }
        setView((v) => ({ ...v, x: p.ox + dx, y: p.oy + dy }));
      }
    }
    function onUp() {
      if (dragRef.current) {
        const id = dragRef.current.id;
        if (movedRef.current) persistPositions([id]);
        else setSelectedId(id);
        dragRef.current = null;
      } else if (panRef.current) {
        if (!movedRef.current) {
          setSelectedId(null);
          setOpenRelatives(null);
          setFoundId(null);
        }
        panRef.current = null;
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── zoom (native non-passive wheel) ──────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (glideRef.current !== null) {
        cancelAnimationFrame(glideRef.current);
        glideRef.current = null;
      }
      const rect = el!.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
        const wx = (lx - v.x) / v.scale;
        const wy = (ly - v.y) / v.scale;
        return { scale: ns, x: lx - wx * ns, y: ly - wy * ns };
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function zoomBy(factor: number) {
    const el = containerRef.current;
    if (!el) return;
    const lx = el.clientWidth / 2;
    const ly = el.clientHeight / 2;
    setView((v) => {
      const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
      const wx = (lx - v.x) / v.scale;
      const wy = (ly - v.y) / v.scale;
      return { scale: ns, x: lx - wx * ns, y: ly - wy * ns };
    });
  }

  // ── background archive matching ───────────────────────────────────────
  // Search the archive for every not-yet-matched person, a batch at a time,
  // until everyone has been searched. Runs after an import and on load.
  const runMatchLoop = useCallback(async () => {
    // Matching writes archive links onto the tree's own rows, so it belongs to
    // the owner's visit, not a visitor's.
    if (readOnly) return;
    if (matchingRef.current) return;
    matchingRef.current = true;
    let done = 0;
    try {
      // Up to ~200 people per visit keeps the background work bounded; a reload
      // resumes any remainder.
      for (let i = 0; i < 20; i++) {
        const res = await fetch(`/api/family-tree/${tree.id}/match-all`, {
          method: 'POST',
          headers: json,
          body: JSON.stringify({ limit: 12 }),
        });
        if (!res.ok) break;
        const data = await res.json();
        done += data.processed ?? 0;
        const remaining = data.remaining ?? 0;
        if (done > 0 || remaining > 0) setMatchProgress({ done, remaining });
        if (!data.processed || remaining === 0) break;
      }
    } catch {
      // ignore — matching resumes next load
    } finally {
      matchingRef.current = false;
      setTimeout(() => setMatchProgress(null), 4000);
    }
  }, [tree.id, readOnly]);

  // Kick off matching for anyone still unsearched when the tree opens.
  useEffect(() => {
    runMatchLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── data mutations ────────────────────────────────────────────────────
  function persistPositions(ids: string[]) {
    const positions = ids
      .map((id) => {
        const p = indRef.current.find((x) => x.id === id);
        return p ? { id, x: p.pos_x, y: p.pos_y } : null;
      })
      .filter(Boolean);
    if (positions.length === 0) return;
    fetch(`/api/family-tree/${tree.id}/layout`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ positions }),
    }).catch(() => {});
  }

  function onFreeCardPointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    // Dragging persists pos_x/pos_y, which is not the viewer's to change.
    if (readOnly) return;
    const p = byId.get(id);
    if (!p) return;
    movedRef.current = false;
    dragRef.current = { id, sx: e.clientX, sy: e.clientY, ox: p.pos_x, oy: p.pos_y };
  }

  function onBackgroundPointerDown(e: React.PointerEvent) {
    movedRef.current = false;
    panRef.current = { sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setFocal(id: string) {
    setFocalId(id);
    setHomeId(id);
    setExpanded(new Set());
    setOpenRelatives(null);
    // Remember the choice so it survives reloads and future sessions.
    fetch(`/api/family-tree/${tree.id}`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ home_person_id: id }),
    }).catch(() => {});
  }

  async function addPerson() {
    const el = containerRef.current;
    const wx = el ? (el.clientWidth / 2 - view.x) / view.scale - CARD_W / 2 : 0;
    const wy = el ? (el.clientHeight / 2 - view.y) / view.scale - CARD_H / 2 : 0;
    const res = await fetch('/api/family-tree/individuals', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ tree_id: tree.id, given_name: 'New', surname: 'person', pos_x: wx, pos_y: wy }),
    });
    const data = await res.json();
    if (data.individual) {
      setIndividuals((p) => [...p, data.individual]);
      if (!focalId) setFocalId(data.individual.id);
      setSelectedId(data.individual.id);
    }
  }

  async function savePerson(patch: Partial<TreeIndividual>) {
    if (!selectedId) return;
    const res = await fetch(`/api/family-tree/individuals/${selectedId}`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.individual) {
      setIndividuals((p) => p.map((x) => (x.id === selectedId ? data.individual : x)));
    }
  }

  // Opens a blank form. Nothing is written until Create, so cancelling leaves
  // no half-made "New person" behind — which is what the immediate POST did.
  function addRelative(kind: 'parent' | 'child' | 'spouse') {
    if (!selectedId) return;
    setDraft({ kind, anchorId: selectedId });
  }

  async function createRelative(patch: Partial<TreeIndividual>) {
    if (!draft) return;
    const res = await fetch('/api/family-tree/individuals', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        ...patch,
        tree_id: tree.id,
        relation: { kind: draft.kind, anchor_id: draft.anchorId },
      }),
    });
    const data = await res.json();
    if (data.individual) setIndividuals((p) => [...p, data.individual]);
    if (data.relationship) setRelationships((r) => [...r, data.relationship]);
    setDraft(null);
    if (data.individual) setSelectedId(data.individual.id);
  }

  async function deletePerson() {
    if (!selectedId) return;
    const id = selectedId;
    await fetch(`/api/family-tree/individuals/${id}`, { method: 'DELETE' });
    setRelationships((r) => r.filter((e) => e.from_id !== id && e.to_id !== id));
    setIndividuals((p) => p.filter((x) => x.id !== id));
    setSelectedId(null);
    // Back to the home person; failing that the repair effect picks a new default.
    if (focalId === id) setFocalId(effectiveHomeId && effectiveHomeId !== id ? effectiveHomeId : null);
  }

  async function arrange() {
    const pos = computeLayout(
      individuals.map((i) => ({ id: i.id })),
      relationships.map((r) => ({ type: r.type, from_id: r.from_id, to_id: r.to_id }))
    );
    setIndividuals((prev) =>
      prev.map((p) => (pos[p.id] ? { ...p, pos_x: pos[p.id].x, pos_y: pos[p.id].y } : p))
    );
    const positions = Object.entries(pos).map(([id, p]) => ({ id, x: p.x, y: p.y }));
    fetch(`/api/family-tree/${tree.id}/layout`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ positions }),
    }).catch(() => {});
    fitTo(Object.values(pos));
  }

  async function reload(importedHomeId?: string) {
    const res = await fetch(`/api/family-tree/${tree.id}`);
    const data = await res.json();
    const inds: TreeIndividual[] = data.individuals ?? [];
    const rels: TreeRelationship[] = data.relationships ?? [];
    setIndividuals(inds);
    setRelationships(rels);
    setSelectedId(null);
    setExpanded(new Set());
    const persisted = data.tree?.home_person_id as string | null | undefined;
    const home =
      importedHomeId ??
      (persisted && inds.some((i) => i.id === persisted) ? persisted : pickDefaultFocal(inds, rels));
    setFocalId(home);
    setHomeId(home);
    // Newly imported people haven't been searched yet — match them now.
    runMatchLoop();
  }

  // ── connectors ────────────────────────────────────────────────────────
  const freeEdges = relationships.map((rel) => {
    const a = byId.get(rel.from_id);
    const b = byId.get(rel.to_id);
    if (!a || !b) return null;
    if (rel.type === 'spouse') {
      return (
        <line
          key={rel.id}
          x1={a.pos_x + CARD_W / 2}
          y1={a.pos_y + CARD_H / 2}
          x2={b.pos_x + CARD_W / 2}
          y2={b.pos_y + CARD_H / 2}
          stroke="#7A8B6F"
          strokeWidth={2}
          strokeDasharray="5 4"
        />
      );
    }
    const px = a.pos_x + CARD_W / 2;
    const py = a.pos_y + CARD_H;
    const cx = b.pos_x + CARD_W / 2;
    const cy = b.pos_y;
    const midY = (py + cy) / 2;
    return (
      <path
        key={rel.id}
        d={`M ${px} ${py} V ${midY} H ${cx} V ${cy}`}
        fill="none"
        stroke="#C8956C"
        strokeWidth={2}
        strokeOpacity={0.55}
      />
    );
  });

  // Horizontal pedigree brackets: child (left) -> parent (right).
  const pedEdges = pedigree
    ? pedigree.links.map(({ childId, parentId }) => {
        const c = pedigree.positions[childId];
        const p = pedigree.positions[parentId];
        if (!c || !p) return null;
        const childRight = c.x + CARD_W;
        const childMidY = c.y + CARD_H / 2;
        const parentLeft = p.x;
        const parentMidY = p.y + CARD_H / 2;
        const midX = childRight + (parentLeft - childRight) / 2;
        return (
          <path
            key={`${childId}-${parentId}`}
            d={`M ${childRight} ${childMidY} H ${midX} V ${parentMidY} H ${parentLeft}`}
            fill="none"
            stroke="#C8956C"
            strokeWidth={2}
            strokeOpacity={0.55}
          />
        );
      })
    : null;

  const toolBtn =
    'inline-flex items-center gap-1.5 rounded-xl border border-brand-gold/20 bg-brand-card/90 px-3 py-1.5 text-xs text-brand-cream backdrop-blur hover:border-brand-gold/40 transition-colors';
  const iconBtn =
    'flex items-center justify-center w-9 h-9 rounded-xl border border-brand-gold/20 bg-brand-card/90 text-brand-cream backdrop-blur hover:border-brand-gold/40 transition-colors';

  const showPedigree = mode === 'pedigree' && pedigree;

  return (
    <div
      ref={containerRef}
      onPointerDown={onBackgroundPointerDown}
      className="relative w-full h-full overflow-hidden bg-brand-bg select-none touch-none"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(200,149,108,0.10) 1px, transparent 1px)',
        backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
        cursor: 'grab',
      }}
    >
      {/* Toolbar */}
      <div
        className="absolute top-3 left-3 right-3 sm:right-auto z-30 flex flex-wrap items-center gap-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {individuals.length > 0 && <TreeSearch individuals={individuals} onPick={goToPerson} />}
        <div className="inline-flex rounded-xl border border-brand-gold/20 bg-brand-card/90 backdrop-blur overflow-hidden">
          <button
            className={cn('px-3 py-1.5 text-xs transition-colors', mode === 'pedigree' ? 'bg-brand-gold text-brand-bg' : 'text-brand-cream hover:text-brand-gold')}
            onClick={() => setMode('pedigree')}
          >
            Pedigree
          </button>
          <button
            className={cn('px-3 py-1.5 text-xs transition-colors', mode === 'free' ? 'bg-brand-gold text-brand-bg' : 'text-brand-cream hover:text-brand-gold')}
            onClick={() => setMode('free')}
          >
            Free
          </button>
        </div>
        {mode === 'pedigree' && focalId && effectiveHomeId && focalId !== effectiveHomeId && (
          <button className={toolBtn} onClick={backToHome} title="Center the pedigree on the home person again">
            <CornerUpLeft className="w-3.5 h-3.5" /> Back to {fullName(homePerson ?? ({} as TreeIndividual)) || 'home person'}
          </button>
        )}
        {canEdit && (
          <>
            <button className={toolBtn} onClick={addPerson}>
              <Plus className="w-3.5 h-3.5" /> Add person
            </button>
            <button className={toolBtn} onClick={() => setImportOpen(true)}>
              <Upload className="w-3.5 h-3.5" /> Import GEDCOM
            </button>
            {mode === 'free' && (
              <button className={toolBtn} onClick={arrange}>
                <LayoutGrid className="w-3.5 h-3.5" /> Auto-arrange
              </button>
            )}
          </>
        )}
      </div>

      {/* Background archive-matching progress */}
      {matchProgress && (matchProgress.remaining > 0 || matchProgress.done > 0) && (
        <div
          className="absolute bottom-3 right-3 sm:bottom-auto sm:top-3 z-20 inline-flex items-center gap-2 rounded-xl border border-brand-gold/20 bg-brand-card/90 px-3 py-1.5 text-xs text-brand-cream backdrop-blur"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {matchProgress.remaining > 0 ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-gold" />
              Searching the archive… {matchProgress.done} done · {matchProgress.remaining} left
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-brand-sage" />
              Archive search complete
            </>
          )}
        </div>
      )}

      {/* Zoom controls (bottom-left, clear of the floating assistant bubble) */}
      <div
        className="absolute bottom-3 left-3 z-20 flex flex-col gap-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button className={iconBtn} onClick={() => zoomBy(1.2)} aria-label="Zoom in">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button className={iconBtn} onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button className={iconBtn} onClick={fitCurrent} aria-label="Fit to screen">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* World */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1} height={1}>
          {showPedigree ? pedEdges : freeEdges}
        </svg>

        {showPedigree
          ? pedigree!.visibleIds.map((id) => {
              const p = byId.get(id);
              const pos = pedigree!.positions[id];
              if (!p || !pos) return null;
              const off = pedigree!.offLine[id] ?? [];
              const canExpand = pedigree!.expandable[id];
              const isExpanded = expanded.has(id);
              const isFocal = id === focalId;
              const isHome = id === effectiveHomeId;
              const isFound = id === foundId;
              return (
                <div
                  key={id}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setSelectedId(id)}
                  className={cn(
                    'absolute rounded-2xl border bg-brand-card px-3.5 py-2.5 shadow-sm cursor-pointer transition-shadow',
                    selectedId === id || isFound
                      ? 'border-brand-gold ring-2 ring-brand-gold/40'
                      : isFocal
                        ? 'border-brand-sage/60'
                        : 'border-brand-gold/[0.15] hover:border-brand-gold/35'
                  )}
                  style={{ left: pos.x, top: pos.y, width: CARD_W, minHeight: CARD_H, zIndex: openRelatives === id ? 40 : undefined }}
                >
                  <PersonCardInner p={p} overlapCount={overlapCounts[p.id] ?? 0} />
                  {isFound && pinging && <FoundPulse />}

                  {/* Home / set-home control (top-left) */}
                  {isHome ? (
                    <span className="absolute -top-2 -left-2 inline-flex items-center gap-1 rounded-full bg-brand-sage px-1.5 py-0.5 text-[10px] font-medium text-brand-bg">
                      <Home className="w-2.5 h-2.5" /> Home
                    </span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFocal(id);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute -top-2 -left-2 flex items-center justify-center w-5 h-5 rounded-full bg-brand-card border border-brand-gold/30 text-brand-muted hover:text-brand-gold"
                      title="Make this the home person"
                    >
                      <Target className="w-3 h-3" />
                    </button>
                  )}

                  {/* Expand / collapse ancestors (right edge) */}
                  {canExpand && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(id);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute top-1/2 -right-3 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-brand-gold text-brand-bg shadow hover:bg-brand-gold-light"
                      title={isExpanded ? 'Hide earlier generations' : 'Show earlier generations'}
                    >
                      {isExpanded ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  )}

                  {/* Off-line relatives dropdown */}
                  {off.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenRelatives((o) => (o === id ? null : id));
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute -bottom-2 right-3 inline-flex items-center gap-0.5 rounded-full bg-brand-card border border-brand-gold/30 px-1.5 py-0.5 text-[10px] text-brand-muted hover:text-brand-gold"
                      title="Other relatives"
                    >
                      <ChevronDown className="w-3 h-3" /> {off.length}
                    </button>
                  )}

                  {openRelatives === id && off.length > 0 && (
                    <div
                      className="absolute left-0 top-full mt-3 w-full rounded-xl border border-brand-gold/20 bg-brand-card shadow-lg p-1 z-50"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {off.map((r) => {
                        const rel = byId.get(r.id);
                        const Icon = REL_ICON[r.relation];
                        return (
                          <button
                            key={r.id}
                            onClick={() => {
                              setSelectedId(r.id);
                              setOpenRelatives(null);
                            }}
                            className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-brand-card-hover"
                          >
                            <Icon className="w-3 h-3 text-brand-gold shrink-0" />
                            <span className="text-xs text-brand-cream truncate">
                              {fullName(rel ?? ({} as TreeIndividual)) || 'Unnamed'}
                            </span>
                            <span className="text-[10px] text-brand-muted ml-auto capitalize">{r.relation}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          : individuals.map((p) => (
              <div
                key={p.id}
                onPointerDown={(e) => onFreeCardPointerDown(e, p.id)}
                className={cn(
                  'absolute rounded-2xl border bg-brand-card px-3.5 py-2.5 shadow-sm cursor-grab active:cursor-grabbing transition-shadow',
                  selectedId === p.id || foundId === p.id
                    ? 'border-brand-gold ring-2 ring-brand-gold/40'
                    : 'border-brand-gold/[0.15] hover:border-brand-gold/35'
                )}
                style={{ left: p.pos_x, top: p.pos_y, width: CARD_W, minHeight: CARD_H }}
              >
                <PersonCardInner p={p} overlapCount={overlapCounts[p.id] ?? 0} />
                {foundId === p.id && pinging && <FoundPulse />}
              </div>
            ))}
      </div>

      {/* Empty state */}
      {individuals.length === 0 && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
          <div className="pointer-events-auto">
            <Users className="w-10 h-10 text-brand-gold/60 mx-auto mb-3" />
            <p className="font-display text-lg text-brand-cream mb-1">Start your tree</p>
            <p className="text-sm text-brand-muted mb-4 max-w-xs">
              Add people one at a time, or import a GEDCOM file from another genealogy program.
            </p>
            <div className="flex gap-2 justify-center">
              {canEdit && (
                <>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-gold px-4 py-2 text-sm text-brand-bg hover:bg-brand-gold-light"
                    onClick={addPerson}
                  >
                    <Plus className="w-4 h-4" /> Add a person
                  </button>
                  <button className={toolBtn} onClick={() => setImportOpen(true)}>
                    <Upload className="w-3.5 h-3.5" /> Import GEDCOM
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Editor panel */}
      {draft && (
        <PersonPreview
          key={`draft-${draft.anchorId}-${draft.kind}`}
          person={{ tree_id: tree.id } as TreeIndividual}
          ownerName={ownerName}
          canEdit
          isNew
          draftLabel={`New ${draft.kind}`}
          onSave={createRelative}
          onClose={() => setDraft(null)}
        />
      )}

      {selected && (
        <PersonPreview
          key={selected.id}
          person={selected}
          ownerName={ownerName}
          yourCopy={overlapLinks?.[selected.id]}
          canEdit={canEdit}
          onAddRelative={canEdit ? addRelative : undefined}
          onDelete={canEdit ? deletePerson : undefined}
          onSave={canEdit ? savePerson : undefined}
          onClose={() => setSelectedId(null)}
        />
      )}


      <ImportDialog
        treeId={tree.id}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={reload}
      />
    </div>
  );
}
