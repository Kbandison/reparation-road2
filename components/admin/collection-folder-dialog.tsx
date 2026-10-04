'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ImportCollection } from '@/lib/collections/queries';
import { CollectionFolderForm, type CreatedFolder } from './collection-folder-form';

interface CollectionFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: ImportCollection[];
  defaults?: { category?: string; era?: string; region?: string; accessTier?: string };
  onCreated: (folder: CreatedFolder) => void;
}

/** "+ New folder" from a Parent picker: make the folder without leaving the form you're in. */
export function CollectionFolderDialog({ open, onOpenChange, collections, defaults, onCreated }: CollectionFolderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-brand-gold/[0.12] bg-brand-bg text-brand-cream sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-brand-cream">New folder</DialogTitle>
          <DialogDescription className="text-brand-muted">
            A folder holds collections as tabs. The new collection goes inside it once it’s created.
          </DialogDescription>
        </DialogHeader>
        {/* Remounted on each open so a second folder starts from a blank form. */}
        {open && (
          <CollectionFolderForm
            collections={collections}
            defaults={defaults}
            onCreated={(folder) => {
              onCreated(folder);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
            cancelLabel="Cancel"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
