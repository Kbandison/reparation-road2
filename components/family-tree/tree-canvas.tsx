'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Upload,
  LayoutGrid,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Link2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  FamilyTree,
  TreeIndividual,
  TreeRelationship,
  ArchiveMatch,
} from '@/lib/types';
import { CARD_W, CARD_H, computeLayout } from '@/lib/family-tree/layout';
import { fullName, initials, lifespan } from '@/lib/family-tree/display';
import { PersonEditor } from './person-editor';
import { ImportDialog } from './import-dialog';

interface Props {
  tree: FamilyTree;
  initialIndividuals: TreeIndividual[];
  initialRelationships: TreeRelationship[];
}

interface View {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
const PAD = 90;

const json = { 'Content-Type': 'application/json' };

export function TreeCanvas({ tree, initialIndividuals, initialRelationships }: Props) {
  const [individuals, setIndividuals] = useState<TreeIndividual[]>(initialIndividuals);
  const [relationships, setRelationships] = useState<TreeRelationship[]>(initialRelationships);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 0.9 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const indRef = useRef(individuals);
  indRef.current = individuals;

  // Active gesture state (kept in refs so window listeners see fresh values).
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const movedRef = useRef(false);

  const byId = useMemo(() => {
    const m = new Map<string, TreeIndividual>();
    for (const p of individuals) m.set(p.id, p);
    return m;
  }, [individuals]);

  const selected = selectedId ? byId.get(selectedId) ?? null : null;

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

  const fitView = useCallback(
    () => fitTo(indRef.current.map((p) => ({ x: p.pos_x, y: p.pos_y }))),
    [fitTo]
  );

  // Fit once on mount.
  const didFit = useRef(false);
  useEffect(() => {
    if (!didFit.current && containerRef.current) {
      didFit.current = true;
      fitView();
    }
  }, [fitView]);

  // ── pointer drag / pan ────────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (dragRef.current) {
        const d = dragRef.current;
        const scale = viewRef.current.scale;
        if (Math.abs(e.clientX - d.sx) > 3 || Math.abs(e.clientY - d.sy) > 3) {
          movedRef.current = true;
        }
        const dx = (e.clientX - d.sx) / scale;
        const dy = (e.clientY - d.sy) / scale;
        setIndividuals((prev) =>
          prev.map((p) => (p.id === d.id ? { ...p, pos_x: d.ox + dx, pos_y: d.oy + dy } : p))
        );
      } else if (panRef.current) {
        const p = panRef.current;
        const dx = e.clientX - p.sx;
        const dy = e.clientY - p.sy;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
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
        if (!movedRef.current) setSelectedId(null);
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

  function onCardPointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    const p = byId.get(id);
    if (!p) return;
    movedRef.current = false;
    dragRef.current = { id, sx: e.clientX, sy: e.clientY, ox: p.pos_x, oy: p.pos_y };
  }

  function onBackgroundPointerDown(e: React.PointerEvent) {
    movedRef.current = false;
    panRef.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
  }

  async function addPerson() {
    const el = containerRef.current;
    const wx = el ? (el.clientWidth / 2 - view.x) / view.scale - CARD_W / 2 : 0;
    const wy = el ? (el.clientHeight / 2 - view.y) / view.scale - CARD_H / 2 : 0;
    const res = await fetch('/api/family-tree/individuals', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        tree_id: tree.id,
        given_name: 'New',
        surname: 'person',
        pos_x: wx,
        pos_y: wy,
      }),
    });
    const data = await res.json();
    if (data.individual) {
      setIndividuals((p) => [...p, data.individual]);
      setSelectedId(data.individual.id);
    }
  }

  async function addRelative(kind: 'parent' | 'child' | 'spouse') {
    if (!selectedId) return;
    const res = await fetch('/api/family-tree/individuals', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        tree_id: tree.id,
        given_name: 'New',
        surname: 'person',
        relation: { kind, anchor_id: selectedId },
      }),
    });
    const data = await res.json();
    if (data.individual) setIndividuals((p) => [...p, data.individual]);
    if (data.relationship) setRelationships((r) => [...r, data.relationship]);
    if (data.individual) setSelectedId(data.individual.id);
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

  async function linkArchive(match: ArchiveMatch | null) {
    if (!selectedId) return;
    const patch = match
      ? {
          archive_collection_slug: match.collectionSlug,
          archive_record_id: match.id,
          archive_record_title: match.title,
        }
      : { archive_collection_slug: null, archive_record_id: null, archive_record_title: null };
    await savePerson(patch);
  }

  async function deletePerson() {
    if (!selectedId) return;
    if (!window.confirm('Delete this person and their connections?')) return;
    const id = selectedId;
    await fetch(`/api/family-tree/individuals/${id}`, { method: 'DELETE' });
    setRelationships((r) => r.filter((e) => e.from_id !== id && e.to_id !== id));
    setIndividuals((p) => p.filter((x) => x.id !== id));
    setSelectedId(null);
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

  async function reload() {
    const res = await fetch(`/api/family-tree/${tree.id}`);
    const data = await res.json();
    const inds: TreeIndividual[] = data.individuals ?? [];
    setIndividuals(inds);
    setRelationships(data.relationships ?? []);
    setSelectedId(null);
    fitTo(inds.map((p) => ({ x: p.pos_x, y: p.pos_y })));
  }

  // ── connectors ────────────────────────────────────────────────────────
  const edges = relationships.map((rel) => {
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

  const toolBtn =
    'inline-flex items-center gap-1.5 rounded-xl border border-brand-gold/20 bg-brand-card/90 px-3 py-1.5 text-xs text-brand-cream backdrop-blur hover:border-brand-gold/40 transition-colors';
  const iconBtn =
    'flex items-center justify-center w-9 h-9 rounded-xl border border-brand-gold/20 bg-brand-card/90 text-brand-cream backdrop-blur hover:border-brand-gold/40 transition-colors';

  return (
    <div
      ref={containerRef}
      onPointerDown={onBackgroundPointerDown}
      className="relative w-full overflow-hidden rounded-2xl border border-brand-gold/[0.1] bg-brand-bg select-none touch-none"
      style={{
        height: 'calc(100vh - 230px)',
        minHeight: 480,
        backgroundImage:
          'radial-gradient(circle, rgba(200,149,108,0.10) 1px, transparent 1px)',
        backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
        cursor: 'grab',
      }}
    >
      {/* Toolbar */}
      <div
        className="absolute top-3 left-3 z-20 flex flex-wrap gap-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button className={toolBtn} onClick={addPerson}>
          <Plus className="w-3.5 h-3.5" /> Add person
        </button>
        <button className={toolBtn} onClick={() => setImportOpen(true)}>
          <Upload className="w-3.5 h-3.5" /> Import GEDCOM
        </button>
        <button className={toolBtn} onClick={arrange}>
          <LayoutGrid className="w-3.5 h-3.5" /> Auto-arrange
        </button>
      </div>

      {/* Zoom controls */}
      <div
        className="absolute bottom-3 right-3 z-20 flex flex-col gap-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button className={iconBtn} onClick={() => zoomBy(1.2)} aria-label="Zoom in">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button className={iconBtn} onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button className={iconBtn} onClick={fitView} aria-label="Fit to screen">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* World */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1} height={1}>
          {edges}
        </svg>

        {individuals.map((p) => {
          const sexClass =
            p.sex === 'M'
              ? 'bg-brand-sage/20 text-brand-sage'
              : p.sex === 'F'
                ? 'bg-brand-burgundy/25 text-brand-burgundy-light'
                : 'bg-brand-gold/15 text-brand-gold';
          return (
            <div
              key={p.id}
              onPointerDown={(e) => onCardPointerDown(e, p.id)}
              className={cn(
                'absolute rounded-2xl border bg-brand-card px-3 py-2 shadow-sm cursor-grab active:cursor-grabbing transition-shadow',
                selectedId === p.id
                  ? 'border-brand-gold ring-2 ring-brand-gold/40'
                  : 'border-brand-gold/[0.15] hover:border-brand-gold/35'
              )}
              style={{ left: p.pos_x, top: p.pos_y, width: CARD_W, minHeight: CARD_H }}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                    sexClass
                  )}
                >
                  {initials(p)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-cream truncate">
                    {fullName(p) || 'Unnamed'}
                  </p>
                  {lifespan(p) && (
                    <p className="text-[11px] text-brand-muted truncate">{lifespan(p)}</p>
                  )}
                </div>
              </div>
              {p.birth_place && (
                <p className="text-[11px] text-brand-muted truncate mt-1">{p.birth_place}</p>
              )}
              {p.archive_record_id && (
                <span
                  className="absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 rounded-full bg-brand-sage text-brand-bg"
                  title="Linked to an archive record"
                >
                  <Link2 className="w-3 h-3" />
                </span>
              )}
            </div>
          );
        })}
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
              <button
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-gold px-4 py-2 text-sm text-brand-bg hover:bg-brand-gold-light"
                onClick={addPerson}
              >
                <Plus className="w-4 h-4" /> Add a person
              </button>
              <button className={toolBtn} onClick={() => setImportOpen(true)}>
                <Upload className="w-3.5 h-3.5" /> Import GEDCOM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor panel */}
      {selected && (
        <div
          className="absolute top-0 right-0 z-30 h-full w-full sm:w-80"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <PersonEditor
            key={selected.id}
            person={selected}
            onSave={savePerson}
            onDelete={deletePerson}
            onAddRelative={addRelative}
            onLinkArchive={linkArchive}
            onClose={() => setSelectedId(null)}
          />
        </div>
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
