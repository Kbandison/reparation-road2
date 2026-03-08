'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  Clock,
  Library,
  FolderOpen,
  FileText,
  Trash2,
  ChevronDown,
  ChevronUp,
  PanelRightClose,
  PanelRightOpen,
  GripVertical,
} from 'lucide-react';
import { useRecentActivity, type ActivityItem } from '@/lib/hooks/use-activity';

function getIcon(type: ActivityItem['type']) {
  switch (type) {
    case 'collection':
      return Library;
    case 'subcollection':
      return FolderOpen;
    case 'record':
      return FileText;
  }
}

function getHref(item: ActivityItem) {
  switch (item.type) {
    case 'collection':
    case 'subcollection':
      return `/collection/${item.slug}`;
    case 'record':
      return `/collection/${item.collectionSlug}/${item.slug}`;
  }
}

function getLabel(type: ActivityItem['type']) {
  switch (type) {
    case 'collection':
      return 'Collection';
    case 'subcollection':
      return 'Subcollection';
    case 'record':
      return 'Record';
  }
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

const DEFAULT_X = -40; // offset from right edge
const DEFAULT_Y = 144; // ~top-36

function loadPosition(): { x: number; y: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('rr-activity-pos');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function savePosition(x: number, y: number) {
  try {
    localStorage.setItem('rr-activity-pos', JSON.stringify({ x, y }));
  } catch { /* ignore */ }
}

export function RecentActivity() {
  const { items, clearActivity } = useRecentActivity();
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: DEFAULT_X, y: DEFAULT_Y });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const didDrag = useRef(false);

  // Load saved position on mount
  useEffect(() => {
    const saved = loadPosition();
    if (saved) setPos(saved);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only drag from the header grip area
    e.preventDefault();
    e.stopPropagation();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    didDrag.current = false;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    e.preventDefault();
    didDrag.current = true;

    const newX = e.clientX - dragOffset.current.x;
    const newY = e.clientY - dragOffset.current.y;

    // Clamp to viewport
    const w = panelRef.current?.offsetWidth || 288;
    const h = panelRef.current?.offsetHeight || 200;
    const clampedX = Math.max(0, Math.min(window.innerWidth - w, newX));
    const clampedY = Math.max(0, Math.min(window.innerHeight - h, newY));

    setPos({ x: clampedX, y: clampedY });
  }, [dragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    // Save position
    if (didDrag.current) {
      const rect = panelRef.current?.getBoundingClientRect();
      if (rect) savePosition(rect.left, rect.top);
    }
  }, [dragging]);

  if (items.length === 0) return null;

  const displayItems = showAll ? items.slice(0, 20) : items.slice(0, 8);

  // Determine style: saved position uses left/top, default uses right/top
  const saved = loadPosition();
  const positionStyle: React.CSSProperties = saved || didDrag.current
    ? { left: pos.x, top: pos.y }
    : { right: Math.abs(DEFAULT_X), top: pos.y };

  // Collapsed state
  if (collapsed) {
    return (
      <div
        className="hidden xl:block fixed z-30"
        style={positionStyle}
      >
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 bg-brand-card border border-brand-gold/[0.12] rounded-xl px-3 py-2.5 shadow-lg hover:border-brand-gold/25 transition-colors"
          title="Show recent activity"
        >
          <PanelRightOpen className="w-4 h-4 text-brand-gold" />
          <span className="text-xs font-medium text-brand-cream">Activity</span>
          <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-gold/15 text-brand-gold text-[10px] font-bold px-1">
            {items.length}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="hidden xl:block fixed z-30 w-72"
      style={{
        ...positionStyle,
        cursor: dragging ? 'grabbing' : undefined,
        userSelect: dragging ? 'none' : undefined,
      }}
    >
      <div className="bg-brand-card border border-brand-gold/[0.12] rounded-2xl overflow-hidden shadow-xl">
        {/* Header with drag handle */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-gold/[0.06]">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {/* Drag handle */}
            <div
              className="p-1 -ml-1 rounded-lg cursor-grab active:cursor-grabbing text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover transition-colors touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              title="Drag to reposition"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
            <Clock className="w-4 h-4 text-brand-gold flex-shrink-0" />
            <h3 className="font-display text-sm font-semibold text-brand-cream truncate">
              Recent Activity
            </h3>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded-lg text-brand-muted hover:text-brand-cream hover:bg-brand-card-hover transition-colors flex-shrink-0"
            title="Collapse panel"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Items */}
        <div className="divide-y divide-brand-gold/[0.04] max-h-[calc(100vh-16rem)] overflow-y-auto">
          {displayItems.map((item, idx) => {
            const Icon = getIcon(item.type);
            return (
              <Link
                key={`${item.type}-${item.slug}-${idx}`}
                href={getHref(item)}
                className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-brand-card-hover/50 transition-colors group"
              >
                <Icon className="w-3.5 h-3.5 text-brand-muted mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-brand-cream leading-tight truncate group-hover:text-brand-gold transition-colors">
                    {item.name}
                  </p>
                  <p className="text-[11px] text-brand-muted leading-tight mt-0.5">
                    {getLabel(item.type)}
                    {item.type === 'record' && item.collectionName && (
                      <> in {item.collectionName}</>
                    )}
                    {item.type === 'subcollection' && item.parentName && (
                      <> in {item.parentName}</>
                    )}
                    <span className="ml-1 opacity-60">{timeAgo(item.timestamp)}</span>
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-brand-gold/[0.06]">
          {items.length > 8 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="flex items-center gap-1 text-[11px] text-brand-gold hover:text-brand-gold-light transition-colors"
            >
              {showAll ? (
                <>
                  Show less <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  Show more <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          )}
          <button
            onClick={clearActivity}
            className="flex items-center gap-1 text-[11px] text-brand-muted hover:text-brand-burgundy-light transition-colors ml-auto"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
