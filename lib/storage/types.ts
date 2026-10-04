/** Shapes shared by the /api/admin/storage route and the admin media manager. */

export interface StorageBucket {
  name: string;
  public: boolean;
  /** Written to by site features (forum, family tree); browse-only in the manager. */
  locked: boolean;
}

export interface StorageFolder {
  name: string;
  /** Path inside the bucket, no leading or trailing slash. */
  path: string;
}

export interface StorageFile {
  name: string;
  /** Path inside the bucket. */
  path: string;
  size: number | null;
  mimetype: string | null;
  updatedAt: string | null;
  /** Full public object URL (the original file, not a thumbnail). */
  url: string;
}

export interface StorageListing {
  folders: StorageFolder[];
  files: StorageFile[];
  /** Pass back to load the next page; null when this was the last one. */
  nextCursor: string | null;
}

/** What a rename or delete would touch: collection records linking to the files. */
export interface StorageReferenceSummary {
  total: number;
  sources: { label: string; table: string; count: number }[];
}

export type StorageTargetKind = 'file' | 'folder' | 'bucket';

export interface RenamePlan {
  /** Old and new path of the renamed file or folder, inside the bucket. */
  from: string;
  to: string;
  /** Every object to move (for a folder, everything under it). */
  objects: string[];
}
