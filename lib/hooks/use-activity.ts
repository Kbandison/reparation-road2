'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ActivityItem {
  type: 'collection' | 'subcollection' | 'record';
  slug: string;
  name: string;
  collectionSlug?: string;
  collectionName?: string;
  parentSlug?: string;
  parentName?: string;
  timestamp: number;
}

const STORAGE_KEY = 'rr-recent-activity';
const MAX_ITEMS = 50;

function getStoredActivity(): ActivityItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveActivity(items: ActivityItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // storage full or unavailable
  }
}

export function trackActivity(item: Omit<ActivityItem, 'timestamp'>) {
  // Client-side history (also drives the Recent Activity widget).
  const items = getStoredActivity();
  const key = `${item.type}:${item.slug}`;
  const filtered = items.filter((i) => `${i.type}:${i.slug}` !== key);
  filtered.unshift({ ...item, timestamp: Date.now() });
  saveActivity(filtered);

  // Server-side mirror so the assistant has signal for personalized
  // recommendations. Best-effort — the endpoint quietly noops for anonymous
  // visitors, and any network error is swallowed so tracking never breaks
  // navigation.
  if (typeof window === 'undefined') return;
  try {
    fetch('/api/assistant/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: item.type,
        target_slug: item.slug,
        target_name: item.name,
        collection_slug: item.collectionSlug ?? null,
        parent_slug: item.parentSlug ?? null,
      }),
      keepalive: true,
    }).catch(() => {
      /* swallow */
    });
  } catch {
    /* swallow */
  }
}

export function useRecentActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    setItems(getStoredActivity());
  }, []);

  const clearActivity = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setItems([]);
  }, []);

  return { items, clearActivity };
}
