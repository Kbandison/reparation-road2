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
  const items = getStoredActivity();

  // Remove duplicate (same type + slug combo)
  const key = `${item.type}:${item.slug}`;
  const filtered = items.filter((i) => `${i.type}:${i.slug}` !== key);

  // Prepend new item
  filtered.unshift({ ...item, timestamp: Date.now() });

  saveActivity(filtered);
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
