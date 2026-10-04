'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Copy,
  Database,
  ExternalLink,
  FileText,
  Folder,
  Lock,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buildImageUrl } from '@/lib/collections/helpers';
import { canThumbnail, joinPath, splitFileName } from '@/lib/storage/names';
import { formatBytes } from '@/lib/utils/format';
import type { StorageBucket, StorageFile, StorageFolder } from '@/lib/storage/types';

interface TileActions {
  onRename?: () => void;
  onDelete?: () => void;
}

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Couldn’t copy. Your browser blocked clipboard access.');
  }
};

/** The ⋮ menu on every tile. Always visible, so it works on touch screens too. */
function TileMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="shrink-0 rounded-lg p-1.5 text-brand-muted hover:bg-brand-card-hover hover:text-brand-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/50"
        aria-label={`Actions for ${label}`}
      >
        <MoreVertical className="w-4 h-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-brand-card border-brand-gold/[0.12] text-brand-cream">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RenameDeleteItems({ onRename, onDelete }: TileActions) {
  if (!onRename && !onDelete) return null;
  return (
    <>
      <DropdownMenuSeparator className="bg-brand-gold/[0.08]" />
      {onRename && (
        <DropdownMenuItem onSelect={onRename}>
          <Pencil /> Rename
        </DropdownMenuItem>
      )}
      {onDelete && (
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      )}
    </>
  );
}

export function StorageBucketTile({
  bucket,
  onOpen,
  onDelete,
}: {
  bucket: StorageBucket;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center rounded-xl border border-brand-gold/[0.08] bg-brand-bg/40 transition-colors hover:border-brand-gold/25">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 text-left">
        <Database className="w-4 h-4 shrink-0 text-brand-gold" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate text-sm text-brand-cream">{bucket.name}</span>
          {bucket.locked && (
            <span className="flex items-center gap-1 text-[10px] text-brand-muted">
              <Lock className="w-2.5 h-2.5" aria-hidden="true" /> Site uploads · view only
            </span>
          )}
        </span>
      </button>
      {onDelete && (
        <TileMenu label={bucket.name}>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 /> Delete bucket
          </DropdownMenuItem>
        </TileMenu>
      )}
    </div>
  );
}

export function StorageFolderTile({
  bucket,
  folder,
  onOpen,
  ...actions
}: { bucket: string; folder: StorageFolder; onOpen: () => void } & TileActions) {
  return (
    <div className="flex items-center rounded-xl border border-brand-gold/[0.08] bg-brand-bg/40 transition-colors hover:border-brand-gold/25">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left">
        <Folder className="w-4 h-4 shrink-0 text-brand-gold" aria-hidden="true" />
        <span className="truncate text-sm text-brand-cream" title={folder.name}>{folder.name}</span>
      </button>
      <TileMenu label={folder.name}>
        <DropdownMenuItem onSelect={() => copy(joinPath(bucket, folder.path), 'Folder path')}>
          <Copy /> Copy path
        </DropdownMenuItem>
        <RenameDeleteItems {...actions} />
      </TileMenu>
    </div>
  );
}

export function StorageFileTile({
  bucket,
  file,
  ...actions
}: { bucket: string; file: StorageFile } & TileActions) {
  const [broken, setBroken] = useState(false);
  // Scans run 20–35 MB, so the grid only ever loads a small rendered thumbnail.
  const thumbnail = canThumbnail(file.name) && !broken
    ? buildImageUrl(joinPath(bucket, file.path), { width: 320, quality: 60 })
    : null;
  const ext = splitFileName(file.name).ext.replace('.', '').toUpperCase();

  return (
    <div className="overflow-hidden rounded-xl border border-brand-gold/[0.08] bg-brand-bg/40 transition-colors hover:border-brand-gold/25">
      <a
        href={file.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block aspect-square bg-brand-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-gold/50"
        aria-label={`Open ${file.name} in a new tab`}
      >
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- already a sized Supabase render; next/image would resize it again
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-brand-muted">
            <FileText className="w-8 h-8" aria-hidden="true" />
            {ext && <span className="text-[10px] font-semibold tracking-wider">{ext}</span>}
          </span>
        )}
      </a>
      <div className="flex items-center gap-1 py-1.5 pl-2.5 pr-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-brand-cream" title={file.name}>{file.name}</p>
          {file.size !== null && <p className="text-[10px] text-brand-muted">{formatBytes(file.size)}</p>}
        </div>
        <TileMenu label={file.name}>
          <DropdownMenuItem asChild>
            <a href={file.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Open original
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copy(joinPath(bucket, file.path), 'Path')}>
            <Copy /> Copy path
          </DropdownMenuItem>
          <RenameDeleteItems {...actions} />
        </TileMenu>
      </div>
    </div>
  );
}
