'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  X,
  Loader2,
  FolderOpen,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ImportCollection } from '@/lib/collections/queries';
import { collectionCategories, collectionEras, collectionRegions } from '@/lib/constants';
import { BUILT_IN_COLUMNS, SYSTEM_COLUMNS, collectionFixedValues, findConflicts, prepareRows, toTableName } from '@/lib/import/records';
import { hasTabs, isPlaceholder, placementProblems, suggestPlacements, type Placement } from '@/lib/import/placeholders';
import { isFailedRowsHelperHeader } from '@/lib/import/failed-rows';
import { displayValue, isBlank, profileColumn, typeLabel, type ColumnProfile } from '@/lib/import/values';
import { imageKey, isStorageLink, matchImages } from '@/lib/import/image-matching';
import type { ImportColumnType, ImportFailure, TableColumns } from '@/lib/import/types';
import { ImportColumnTypeField } from './import-column-type-field';
import { ImportPreflight } from './import-preflight';
import { ImportFailureList } from './import-failure-list';
import { ImportFailedRowsDownload } from './import-failed-rows-download';
import { ImportPlacementField } from './import-placement-field';
import { ImportImageMatches } from './import-image-matches';

type Step = 'mode' | 'collection' | 'upload' | 'mapping' | 'images' | 'preview' | 'importing' | 'done';

// The target table as it stands before the import: its real columns, or no
// table yet (a new collection).
type TableSchemaState =
  | { exists: false }
  | ({ exists: true; columns: string[]; rowCount: number | null } & TableColumns);

interface ImportResult {
  inserted: number;
  total: number;
  failures: ImportFailure[];
  error: string | null;
  // Where the target collection stands afterwards; 'none' if a new one was never created.
  collection: 'none' | 'draft' | 'published';
  // A placeholder collection got its table during this import.
  linkedPlaceholder: boolean;
}

const EMPTY_RESULT: ImportResult = { inserted: 0, total: 0, failures: [], error: null, collection: 'none', linkedPlaceholder: false };

/** POSTs a JSON action to the import API and hands back the status with the parsed body. */
async function postImport(payload: Record<string, unknown>) {
  const res = await fetch('/api/admin/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** The target table's real columns and types, or { exists: false } when there's no such table. */
async function loadTableSchema(table: string): Promise<TableSchemaState> {
  const res = await fetch(`/api/admin/import?action=schema&table=${encodeURIComponent(table)}`);
  const data = await res.json().catch(() => ({}));
  if (res.status === 404 && data.exists === false) return { exists: false };
  if (!res.ok) throw new Error(data.error || 'Could not read the table schema');
  return {
    exists: true,
    columns: data.columns ?? [],
    columnTypes: data.columnTypes ?? {},
    requiredColumns: data.requiredColumns ?? [],
    rowCount: data.rowCount ?? null,
  };
}

interface StorageFile {
  name: string;
  isFolder: boolean;
  path: string;
  url: string;
}

type CollectionInfo = ImportCollection;

interface ImportWizardProps {
  collections: CollectionInfo[];
  /**
   * Upload Images page only: the folder the scans were just uploaded into.
   * The image step starts with it already in the match pool.
   */
  imageSource?: { bucket: string; folder: string } | null;
  /** Changes whenever more uploads land in imageSource, so the pool re-reads it. */
  imageSourceVersion?: number;
  /** Uploads into imageSource still running. */
  uploadsInProgress?: number;
}

// Normalize a string for fuzzy matching
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Turn a spreadsheet header into a safe Postgres column name. Mirrors the
// server's sanitizer; falls back to a generic name so a header made only of
// punctuation never becomes an empty (dropped) column.
function toColumnName(header: string): string {
  const name = header.replace(/[^a-z0-9_ ]/gi, '').replace(/\s+/g, '_').toLowerCase().replace(/^_+|_+$/g, '');
  // Never land on a column the database manages: an "ID" header would
  // otherwise target the uuid primary key and fail every row.
  if (SYSTEM_COLUMNS.has(name)) return `source_${name}`;
  return name || 'column';
}

// Detect headers that look like an image-name column (e.g. "passbook_image",
// "claim_image", "scan_id", "image_path"). Such columns always route to
// image_path so no redundant DB column is created.
const IMAGE_HEADER_RE = /(^|_)(image|img|scan|photo|picture|thumbnail)(_|$)/i;
function looksLikeImageColumn(col: string): boolean {
  return IMAGE_HEADER_RE.test(col);
}

export function ImportWizard({ collections, imageSource = null, imageSourceVersion = 0, uploadsInProgress = 0 }: ImportWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('mode');
  const [mode, setMode] = useState<'existing' | 'new'>('existing');

  // Collection selection
  const [selectedSlug, setSelectedSlug] = useState('');
  // Where a placeholder collection's records go (null for any other target).
  const [placement, setPlacement] = useState<Placement | null>(null);
  // Spreadsheet headers that fed the tab's tag column; the tag replaces them.
  const [taggedHeaders, setTaggedHeaders] = useState<string[]>([]);

  // New collection form
  const [newCollection, setNewCollection] = useState({
    name: '', slug: '', category: 'legal', era: '', region: '',
    parentSlug: '', displayType: 'table', accessTier: 'explorer',
    hasImages: false, hasOcr: false,
    shortDescription: '', longDescription: '',
  });
  const [generating, setGenerating] = useState(false);

  // File data
  const [fileName, setFileName] = useState('');
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, unknown>[]>([]);
  const [allRows, setAllRows] = useState<Record<string, unknown>[]>([]);
  // Spreadsheet row of each entry in allRows, so problems point at rows the admin can find in Excel.
  const [rowNumbers, setRowNumbers] = useState<number[]>([]);
  const [rowCount, setRowCount] = useState(0);

  // The target table as it is now, and the admin's type picks for columns this import creates.
  const [tableSchema, setTableSchema] = useState<TableSchemaState | null>(null);
  const [typeOverrides, setTypeOverrides] = useState<Record<string, ImportColumnType>>({});

  // Column mapping: fileCol -> dbCol
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [dbColumns, setDbColumns] = useState<string[]>([]);
  const [newTableName, setNewTableName] = useState('');

  // Image matching
  const [storageBucket, setStorageBucket] = useState('');
  const [storageFolder, setStorageFolder] = useState('');
  const [storageFiles, setStorageFiles] = useState<StorageFile[]>([]);

  // Folders whose files feed the match pool. The browser still shows one folder
  // at a time; this is what has been committed to the import.
  const [sourceFolders, setSourceFolders] = useState<
    { id: string; bucket: string; folder: string; recursive: boolean; files: StorageFile[]; truncated?: boolean }[]
  >([]);
  const [recurseNext, setRecurseNext] = useState(false);
  const [addingFolder, setAddingFolder] = useState(false);
  // Which folder wins for a filename that appears in more than one of them.
  const [conflictChoice, setConflictChoice] = useState<Record<string, string>>({});
  // Near misses the admin confirmed on the image step: image name → storage path.
  const [acceptedNear, setAcceptedNear] = useState<Record<string, string>>({});
  // How many unlinked image names the admin agreed to import without images.
  const [ackedUnlinked, setAckedUnlinked] = useState<number | null>(null);
  const [imageColumn, setImageColumn] = useState('');
  const [browsingStorage, setBrowsingStorage] = useState(false);
  const [availableBuckets, setAvailableBuckets] = useState<{ name: string; public: boolean }[]>([]);
  const [loadingBuckets, setLoadingBuckets] = useState(false);

  // Import outcome
  const [result, setResult] = useState<ImportResult>(EMPTY_RESULT);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const selectedCollection = collections.find((c) => c.slug === selectedSlug);
  // Any published collection can be a parent; render with a hierarchy hint so
  // nested groupings (Native American Records → Cherokee Agency Records → ...) are clear.
  const parentCollections = [...collections].sort((a, b) => {
    const aRoot = a.parent_slug || a.slug;
    const bRoot = b.parent_slug || b.slug;
    return aRoot === bRoot
      ? (a.parent_slug ? 1 : 0) - (b.parent_slug ? 1 : 0) || a.name.localeCompare(b.name)
      : aRoot.localeCompare(bRoot);
  });
  const collectionBySlug = useMemo(() => new Map(collections.map((c) => [c.slug, c])), [collections]);
  const parentLabel = (c: CollectionInfo): string => {
    if (!c.parent_slug) return c.name;
    const parent = collectionBySlug.get(c.parent_slug);
    return parent ? `${parent.name} → ${c.name}` : c.name;
  };

  // A "Coming Soon" collection (no table, no tabs) picked as the target.
  const selectedIsPlaceholder = mode === 'existing' && !!selectedCollection && isPlaceholder(selectedCollection, collections);
  const activePlacement = selectedIsPlaceholder ? placement : null;
  const placementOptions = useMemo(
    () => (selectedIsPlaceholder && selectedCollection ? suggestPlacements(selectedCollection, collections) : null),
    [selectedIsPlaceholder, selectedCollection, collections],
  );
  const placementIssues = useMemo(
    () => (activePlacement && selectedCollection ? placementProblems(activePlacement, selectedCollection, collections) : []),
    [activePlacement, selectedCollection, collections],
  );

  // The tag written on every row when the target shares its table with sibling
  // tabs. Without it the rows go in but never show in the tab.
  const fixedValues = useMemo<Record<string, string>>(() => {
    if (activePlacement?.kind === 'shared') return { [activePlacement.column]: activePlacement.value.trim() };
    return mode === 'existing' ? collectionFixedValues(selectedCollection) : {};
  }, [activePlacement, mode, selectedCollection]);
  const fixedColumns = useMemo(() => new Set(Object.keys(fixedValues)), [fixedValues]);

  const targetTable = mode === 'existing'
    ? (selectedCollection?.table_name ?? activePlacement?.table ?? '')
    : newTableName;
  const targetName = mode === 'existing' ? (selectedCollection?.name ?? '') : newCollection.name;

  // "Import to Existing" offers every collection with a table plus every
  // placeholder, grouped under the collection whose tabs they are.
  const existingOptions = useMemo(() => {
    const rootOf = (c: CollectionInfo) => {
      let node = c;
      for (let depth = 0; node.parent_slug && depth < 10; depth++) {
        const parent = collectionBySlug.get(node.parent_slug);
        if (!parent) break;
        node = parent;
      }
      return node;
    };
    const pathBelow = (c: CollectionInfo, root: CollectionInfo) => {
      const names: string[] = [];
      let node: CollectionInfo | undefined = c;
      for (let depth = 0; node && node.slug !== root.slug && depth < 10; depth++) {
        names.unshift(node.name);
        node = node.parent_slug ? collectionBySlug.get(node.parent_slug) : undefined;
      }
      return names.join(' → ') || c.name;
    };

    const groups = new Map<string, { label: string; options: { slug: string; label: string }[] }>();
    for (const c of collections) {
      const empty = isPlaceholder(c, collections);
      if (!c.table_name && !empty) continue;
      const root = rootOf(c);
      // Standalone collections share one group instead of a group each.
      const grouped = root.slug !== c.slug || hasTabs(c, collections);
      const key = grouped ? root.slug : '';
      const group = groups.get(key) ?? { label: grouped ? root.name : 'Collections', options: [] };
      group.options.push({
        slug: c.slug,
        label: `${pathBelow(c, root)}${empty ? ' · Empty' : ''}${c.is_published ? '' : ' · Draft'}`,
      });
      groups.set(key, group);
    }
    return [...groups.values()]
      .map((g) => ({ ...g, options: g.options.sort((a, b) => a.label.localeCompare(b.label)) }))
      .sort((a, b) => (a.label === 'Collections' ? -1 : b.label === 'Collections' ? 1 : a.label.localeCompare(b.label)));
  }, [collections, collectionBySlug]);

  const chooseExisting = (slug: string) => {
    setSelectedSlug(slug);
    const picked = collections.find((c) => c.slug === slug);
    if (picked && isPlaceholder(picked, collections)) {
      const suggested = suggestPlacements(picked, collections);
      setPlacement(suggested.shared ?? suggested.own);
    } else {
      setPlacement(null);
    }
  };

  // Step: Upload file
  const handleFileUpload = useCallback(async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/admin/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); setUploading(false); return; }

      // Read the target table's real columns and types. A new collection's
      // table normally doesn't exist yet, but an earlier failed run can leave
      // one behind, and its types are what the rows must fit.
      const table = mode === 'existing'
        ? (selectedCollection?.table_name ?? activePlacement?.table ?? '')
        : (toTableName(newCollection.slug) || 'new_table');
      const schema = await loadTableSchema(table);
      // A placeholder getting its own table is the one existing target whose
      // table can legitimately not exist yet.
      if (mode === 'existing' && !schema.exists && activePlacement?.kind !== 'own') {
        toast.error(`This collection's table (${table}) doesn't exist`);
        setUploading(false);
        return;
      }
      const existingCols = schema.exists ? schema.columns : [];
      // A "rows to fix" download carries two helper columns; they're never data.
      const dataHeaders = (data.headers as string[]).filter((h) => !isFailedRowsHelperHeader(h));

      setFileName(file.name);
      setFileHeaders(data.headers);
      setSampleRows(data.sampleRows);
      setAllRows(data.allRows);
      setRowNumbers(data.rowNumbers ?? []);
      setRowCount(data.rowCount);
      setTableSchema(schema);
      setTypeOverrides({});

      if (mode === 'existing') {
        // Auto-map by matching names; a header that matches no existing column
        // maps to a NEW column (added on import) instead of being dropped.
        const mapping: Record<string, string> = {};
        const tagged: string[] = [];
        for (const header of data.headers) {
          if (isFailedRowsHelperHeader(header)) {
            mapping[header] = '';
            continue;
          }
          if (looksLikeImageColumn(header)) {
            mapping[header] = 'image_path';
            continue;
          }
          const normHeader = normalize(header);
          const match = existingCols.find((c: string) => normalize(c) === normHeader);
          const target = match || toColumnName(header);
          // The tab's tag owns this column; the file's copy would fight it.
          if (fixedColumns.has(target)) {
            mapping[header] = '';
            tagged.push(header);
            continue;
          }
          mapping[header] = target;
        }
        // Offer both the existing columns and any new ones as mapping targets.
        setDbColumns([...new Set([...existingCols, ...dataHeaders.map(toColumnName)])].filter((c) => !fixedColumns.has(c)));
        setColumnMapping(mapping);
        setTaggedHeaders(tagged);
      } else {
        // New collection — DB columns are derived from the file (plus any a
        // leftover table already has).
        const cols: string[] = (data.headers as string[]).map((h) => toColumnName(h));
        setDbColumns([...new Set([...existingCols, ...dataHeaders.map(toColumnName)])]);
        const mapping: Record<string, string> = {};
        data.headers.forEach((h: string, i: number) => {
          // Image-like columns always go to image_path so no redundant DB column is created.
          mapping[h] = isFailedRowsHelperHeader(h) ? '' : looksLikeImageColumn(cols[i]) ? 'image_path' : cols[i];
        });
        setColumnMapping(mapping);
        setNewTableName(table);
      }

      setStep('mapping');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse file');
    }
    setUploading(false);
  }, [mode, selectedCollection, activePlacement, fixedColumns, newCollection.slug]);

  // Generate descriptions with AI
  const generateDescriptions = async () => {
    if (!newCollection.name) {
      toast.error('Enter a name first');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-descriptions',
          name: newCollection.name,
          category: newCollection.category,
          era: newCollection.era,
          region: newCollection.region,
          headers: fileHeaders,
          sampleRows: sampleRows.slice(0, 3),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to generate');
      } else {
        setNewCollection((prev) => ({
          ...prev,
          shortDescription: data.shortDescription || prev.shortDescription,
          longDescription: data.longDescription || prev.longDescription,
        }));
        toast.success('Descriptions generated');
      }
    } catch {
      toast.error('Failed to generate descriptions');
    }
    setGenerating(false);
  };

  // Step: Browse storage for images
  const browseStorage = async (bucket: string, folder: string) => {
    setBrowsingStorage(true);
    try {
      const res = await fetch(`/api/admin/import?action=storage-files&bucket=${encodeURIComponent(bucket)}&folder=${encodeURIComponent(folder)}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || `Failed to load ${bucket}`);
        setStorageFiles([]);
      } else {
        setStorageFiles(data.items || []);
        setStorageFolder(folder);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to browse storage');
    }
    setBrowsingStorage(false);
  };

  const loadBuckets = useCallback(async () => {
    setLoadingBuckets(true);
    try {
      const res = await fetch('/api/admin/import?action=storage-buckets');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to load buckets');
      } else {
        setAvailableBuckets(data.buckets || []);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load buckets');
    }
    setLoadingBuckets(false);
  }, []);

  // Every file in a storage folder (optionally its subfolders too).
  const readFolder = async (bucket: string, folder: string, recursive: boolean) => {
    const params = new URLSearchParams({ action: 'storage-files', bucket, folder, recursive: String(recursive) });
    const res = await fetch(`/api/admin/import?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to read that folder');
    return {
      files: (data.items || []).filter((f: StorageFile) => !f.isFolder) as StorageFile[],
      truncated: Boolean(data.truncated),
    };
  };

  // Commit a folder to the match pool. Resolves true when it's in the pool.
  const addFolder = async (bucket: string, folder: string, recursive: boolean, quiet = false): Promise<boolean> => {
    const key = `${bucket}:${folder}`;
    if (sourceFolders.some((f) => f.id === key)) {
      if (!quiet) toast.error('That folder is already added');
      return true;
    }

    setAddingFolder(true);
    try {
      const { files, truncated } = await readFolder(bucket, folder, recursive);
      if (files.length === 0) {
        if (!quiet) {
          toast.error(
            recursive ? 'No images found in that folder or below it' : 'No images directly in that folder — try including subfolders',
          );
        }
        return false;
      }

      setSourceFolders((prev) =>
        prev.some((f) => f.id === key) ? prev : [...prev, { id: key, bucket, folder, recursive, files, truncated }],
      );
      if (truncated) {
        toast.error(`Stopped at ${files.length} files — that folder is very large`);
      } else if (!quiet) {
        toast.success(`Added ${files.length} image${files.length === 1 ? '' : 's'}`);
      }
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read that folder');
      return false;
    } finally {
      setAddingFolder(false);
    }
  };

  // Commit the folder currently open in the browser to the match pool.
  const addCurrentFolder = () => {
    if (!storageBucket) return;
    void addFolder(storageBucket, storageFolder, recurseNext);
  };

  // Upload Images page: open the image step on the folder just uploaded into,
  // with it already in the pool. If nothing has finished uploading yet, the
  // folder joins the pool when the first batch lands.
  const [seedPending, setSeedPending] = useState(false);
  const seedImageSource = () => {
    if (!imageSource) return;
    setStorageBucket(imageSource.bucket);
    void browseStorage(imageSource.bucket, imageSource.folder);
    void addFolder(imageSource.bucket, imageSource.folder, false, true).then((added) => setSeedPending(!added));
  };

  // More uploads landed in the seeded folder: re-read it (or add it, if it was
  // still empty) so the new files can be matched. A folder the admin removed
  // from the pool stays removed.
  const seededId = imageSource ? `${imageSource.bucket}:${imageSource.folder}` : null;
  const seededInPool = Boolean(seededId && sourceFolders.some((f) => f.id === seededId));
  useEffect(() => {
    if (!imageSource || imageSourceVersion === 0 || (!seededInPool && !seedPending)) return;
    let active = true;
    const { bucket, folder } = imageSource;
    const id = `${bucket}:${folder}`;
    readFolder(bucket, folder, false)
      .then(({ files, truncated }) => {
        if (!active || files.length === 0) return;
        setSourceFolders((prev) =>
          prev.some((f) => f.id === id)
            ? prev.map((f) => (f.id === id ? { ...f, files, truncated } : f))
            : [...prev, { id, bucket, folder, recursive: false, files, truncated }],
        );
        setSeedPending(false);
      })
      .catch(() => {
        // Keep the files already listed; the next upload batch tries again.
      });
    return () => {
      active = false;
    };
    // Re-read only when a new upload batch finishes, not on every pool change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSourceVersion]);

  const removeFolder = (id: string) => {
    setSourceFolders((prev) => prev.filter((f) => f.id !== id));
    // Choices can reference a folder that is no longer in the pool.
    setConflictChoice({});
  };

  // Every candidate file, grouped by the name matching will compare against.
  const filesByName = useMemo(() => {
    const map = new Map<string, { file: StorageFile; folderId: string }[]>();
    for (const src of sourceFolders) {
      for (const file of src.files) {
        const key = imageKey(file.name);
        if (!key) continue;
        const bucketList = map.get(key) ?? [];
        bucketList.push({ file, folderId: src.id });
        map.set(key, bucketList);
      }
    }
    return map;
  }, [sourceFolders]);

  // A name in two folders is ambiguous. Page numbering restarts per box all the
  // time, so guessing here would attach a wrong scan that nobody catches later.
  const conflicts = useMemo(
    () =>
      [...filesByName.entries()]
        .filter(([, entries]) => new Set(entries.map((e) => e.folderId)).size > 1)
        .map(([name, entries]) => ({ name, entries })),
    [filesByName],
  );

  const unresolvedConflicts = conflicts.filter((c) => !conflictChoice[c.name]);

  // The pool matching actually runs against: unambiguous files, plus whichever
  // side of a conflict was chosen. Unresolved names are left out entirely.
  const matchPool = useMemo(() => {
    const out: StorageFile[] = [];
    for (const [name, entries] of filesByName) {
      if (entries.length === 1) {
        out.push(entries[0].file);
        continue;
      }
      const folderIds = new Set(entries.map((e) => e.folderId));
      if (folderIds.size === 1) {
        // Same folder, same stem, different extensions — not a real conflict.
        out.push(entries[0].file);
        continue;
      }
      const chosen = conflictChoice[name];
      if (!chosen) continue;
      const pick = entries.find((e) => e.file.path === chosen);
      if (pick) out.push(pick.file);
    }
    return out;
  }, [filesByName, conflictChoice]);


  // Image names in every column that feeds image_path. Values that are already
  // a storage path or URL go in as they are.
  const imageNames = useMemo(() => {
    const headers = Object.entries(columnMapping).filter(([, db]) => db === 'image_path').map(([h]) => h);
    const names = new Set<string>();
    for (const row of allRows) {
      for (const header of headers) {
        if (!isBlank(row[header])) names.add(displayValue(row[header]));
      }
    }
    return [...names];
  }, [allRows, columnMapping]);
  const namesNeedingFiles = useMemo(() => imageNames.filter((n) => !isStorageLink(n)), [imageNames]);

  // Matching runs by itself whenever the names or the pool change (including
  // uploads landing mid-import). Only exact matches link without a confirmation.
  const imageMatches = useMemo(
    () => matchImages(namesNeedingFiles, matchPool.map((f) => ({ name: f.name, path: f.path }))),
    [namesNeedingFiles, matchPool],
  );
  const imageMapping = useMemo(() => {
    const mapping: Record<string, string> = { ...imageMatches.exact };
    for (const [name, path] of Object.entries(acceptedNear)) {
      if (imageMatches.near[name]?.some((f) => f.path === path)) mapping[name] = path;
    }
    return mapping;
  }, [imageMatches, acceptedNear]);
  // Names that would be saved as just the name, with no image on the record.
  const unlinkedImageNames = useMemo(
    () => namesNeedingFiles.filter((n) => !imageMapping[n]),
    [namesNeedingFiles, imageMapping],
  );

  // Every row as the record it will become, tagged with its spreadsheet row.
  const preparedRows = useMemo(
    () => prepareRows(allRows, rowNumbers, columnMapping, undefined, fixedValues),
    [allRows, rowNumbers, columnMapping, fixedValues],
  );
  const mappedColumns = useMemo(
    () => [...new Set(Object.values(columnMapping).filter(Boolean))],
    [columnMapping],
  );
  // The tag column is checked against the table along with the mapped ones.
  const checkedColumns = useMemo(
    () => [...new Set([...mappedColumns, ...fixedColumns])],
    [mappedColumns, fixedColumns],
  );

  // Columns this import will create, each with the types every one of its values
  // fits. Built-in and already-existing columns keep the type the table gives them.
  const newColumnProfiles = useMemo(() => {
    const existingTypes = tableSchema?.exists ? tableSchema.columnTypes : {};
    const profiles: Record<string, ColumnProfile> = {};
    for (const column of mappedColumns) {
      if (SYSTEM_COLUMNS.has(column) || BUILT_IN_COLUMNS.has(column) || column in existingTypes) continue;
      profiles[column] = profileColumn(preparedRows.map((p) => ({ row: p.row, value: p.record[column] })));
    }
    return profiles;
  }, [mappedColumns, preparedRows, tableSchema]);

  // The admin's pick where it still fits the values, otherwise the inferred type.
  const newColumnTypes = useMemo(() => {
    const types: Record<string, ImportColumnType> = {};
    for (const [column, profile] of Object.entries(newColumnProfiles)) {
      const picked = typeOverrides[column];
      types[column] = picked && profile.allowed.includes(picked) ? picked : profile.inferred;
    }
    return types;
  }, [newColumnProfiles, typeOverrides]);

  // Every row checked against the columns the table already has.
  const importConflicts = useMemo(
    () => (tableSchema?.exists ? findConflicts(preparedRows, checkedColumns, tableSchema) : []),
    [tableSchema, preparedRows, checkedColumns],
  );

  const slugTaken = mode === 'new' && !!newCollection.slug && collections.some((c) => c.slug === newCollection.slug);

  // Problems with where the rows are going, rather than with the rows themselves.
  const blockers = useMemo(() => {
    const list: string[] = [...placementIssues];
    if (mode === 'new' && slugTaken) {
      list.push(`A collection with the slug "${newCollection.slug}" already exists. Import into it as an existing collection, or change the slug.`);
    }
    // A new collection, or a placeholder getting its own table, creates the table.
    const createsTable = mode === 'new' || activePlacement?.kind === 'own';
    if (createsTable && tableSchema?.exists) {
      const ownSlug = mode === 'new' ? newCollection.slug : selectedCollection?.slug;
      const fix = mode === 'new' ? 'change the slug' : 'pick another table name';
      // An empty table no collection uses is a leftover from a failed run and is
      // safe to reuse. Anything else would mix these rows into someone else's.
      const owner = collections.find((c) => c.table_name === targetTable);
      if (owner && owner.slug !== ownSlug) {
        list.push(`The table ${targetTable} already belongs to "${owner.name}". Import into that collection instead, or ${fix}.`);
      } else if (tableSchema.rowCount !== 0) {
        list.push(`A table named ${targetTable} already holds ${tableSchema.rowCount?.toLocaleString() ?? 'some'} records. Go back and ${fix} so this collection gets its own table.`);
      }
    }
    return [...new Set(list)];
  }, [placementIssues, mode, slugTaken, newCollection.slug, activePlacement, tableSchema, selectedCollection, collections, targetTable]);

  // Columns that keep the target collection in document order: sort_columns
  // when set, else the first display column (see lib/collections/queries.ts).
  const orderColumns = mode === 'existing' && selectedCollection
    ? (selectedCollection.sort_columns?.length ? selectedCollection.sort_columns : selectedCollection.display_columns.slice(0, 1))
    : [];

  const unmappedRequired = importConflicts.filter((c) => c.kind === 'unmapped');
  const unlinkedAcknowledged = unlinkedImageNames.length === 0 || ackedUnlinked === unlinkedImageNames.length;
  const readyToImport =
    tableSchema !== null && importConflicts.length === 0 && blockers.length === 0 && unlinkedAcknowledged;

  // Whether the image-matching step applies (some column feeds image_path).
  const hasImageColumn = Object.values(columnMapping).includes('image_path');

  // Preview step: widen an existing column to text so its values can go in as written.
  const handleConvert = async (column: string) => {
    const { ok, data } = await postImport({ action: 'convert-column-to-text', tableName: targetTable, column });
    if (!ok) throw new Error(data.error || `Couldn't convert ${column}`);
    setTableSchema((prev) =>
      prev?.exists
        ? { ...prev, columns: data.columns, columnTypes: data.columnTypes, requiredColumns: data.requiredColumns }
        : prev,
    );
    toast.success(`${column} is now a text column`);
  };

  // Step: Do the import
  const handleImport = async () => {
    if (!readyToImport) return;
    setStep('importing');

    const tableName = targetTable;
    const placementAtImport = activePlacement;
    const recordsPayload = {
      tableName,
      records: allRows,
      rowNumbers,
      columnMapping,
      imageMapping: Object.keys(imageMapping).length > 0 ? imageMapping : undefined,
      fixedValues: fixedColumns.size > 0 ? fixedValues : undefined,
    };

    // A failure before any rows are written goes back to Preview with the reason,
    // re-reading the table when the server found something the browser didn't.
    const backToPreview = async (message: string, reloadSchema = false) => {
      toast.error(message);
      if (reloadSchema) {
        try {
          setTableSchema(await loadTableSchema(tableName));
        } catch {
          // Keep the last known schema; the toast already explains the failure.
        }
      }
      setStep('preview');
    };

    // image_path renders inside the record modal and ocr_text/slug aren't
    // useful columns, so none of them are displayed or searched.
    const userMappedCols = mappedColumns.filter((c) => !SYSTEM_COLUMNS.has(c) && !BUILT_IN_COLUMNS.has(c));

    let collectionCreated = false;
    let linkedPlaceholder = false;
    try {
      // 1. Make sure the table and every mapped column exist. create-table is
      //    idempotent (CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS):
      //    new columns get the types chosen on the Mapping step, existing ones
      //    are left alone.
      const columns = Object.entries(newColumnTypes).map(([name, type]) => ({ name, type }));
      if (columns.length > 0 || !tableSchema?.exists) {
        const created = await postImport({ action: 'create-table', tableName, columns });
        if (!created.ok) return await backToPreview(created.data.error || 'Failed to prepare table columns');
      }

      if (mode === 'new' || placementAtImport) {
        // 2. Have the server confirm the whole file fits BEFORE the collection
        //    exists (or a placeholder is pointed at the table). A problem here
        //    leaves nothing behind but an empty table, which the next attempt reuses.
        const check = await postImport({ ...recordsPayload, action: 'insert-records', dryRun: true });
        if (!check.ok) return await backToPreview(check.data.error || 'The file failed its final check', check.status === 422);
      }

      if (placementAtImport && selectedCollection) {
        // 3a. Point the placeholder at its table (and tag). It stays live, so
        //     the records show the moment they land.
        const linked = await postImport({
          action: 'link-collection',
          slug: selectedCollection.slug,
          tableName,
          discriminatorColumn: placementAtImport.kind === 'shared' ? placementAtImport.column : undefined,
          discriminatorValue: placementAtImport.kind === 'shared' ? placementAtImport.value.trim() : undefined,
          displayColumns: userMappedCols.slice(0, 12),
          searchColumns: userMappedCols.slice(0, 4),
          hasImages: hasImageColumn,
        });
        if (!linked.ok) return await backToPreview(linked.data.error || `Couldn't connect ${selectedCollection.name} to its table`);
        linkedPlaceholder = true;
      }

      if (mode === 'new') {
        // 3b. Collection metadata, created as a Draft so visitors see nothing
        //     until every record is in.
        const createdCollection = await postImport({
          action: 'create-collection',
          slug: newCollection.slug,
          name: newCollection.name,
          shortDescription: newCollection.shortDescription,
          longDescription: newCollection.longDescription,
          category: newCollection.category,
          era: newCollection.era || null,
          region: newCollection.region || null,
          tableName,
          parentSlug: newCollection.parentSlug || null,
          displayType: newCollection.displayType,
          accessTier: newCollection.accessTier,
          displayColumns: userMappedCols.slice(0, 12),
          searchColumns: userMappedCols.slice(0, 4),
          hasImages: newCollection.hasImages,
          hasOcr: newCollection.hasOcr,
          isPublished: false,
        });
        if (!createdCollection.ok) return await backToPreview(createdCollection.data.error || 'Failed to create the collection');
        collectionCreated = true;
      }

      // 4. Insert. The server re-checks every row first and writes nothing on a mismatch.
      const inserted = await postImport({ ...recordsPayload, action: 'insert-records' });
      if (inserted.status === 422 && mode === 'existing') {
        return await backToPreview(inserted.data.error || "Some values don't fit this table", true);
      }
      if (!inserted.ok) throw new Error(inserted.data.error || 'Import failed');

      // 5. A new collection goes live only when every record landed.
      let collection: ImportResult['collection'] = mode === 'existing'
        ? (selectedCollection?.is_published ? 'published' : 'draft')
        : 'draft';
      if (mode === 'new' && inserted.data.success) {
        const published = await postImport({ action: 'publish-collection', slug: newCollection.slug });
        if (published.ok) collection = 'published';
        else toast.error(published.data.error || 'The records are in, but publishing failed. Publish it from Admin → Collections.');
      }

      // 6. Record counts on collection cards (and their parents' totals) are
      //    stored, so refresh them now that rows were added.
      if (Number(inserted.data.inserted) > 0) {
        const synced = await fetch('/api/admin/sync-counts', { method: 'POST' }).catch(() => null);
        if (!synced?.ok) toast.error('The records are in, but the record counts didn’t refresh. Use Sync Record Counts in Admin → Collections.');
      }

      setResult({
        inserted: inserted.data.inserted ?? 0,
        total: inserted.data.total ?? allRows.length,
        failures: inserted.data.failures ?? [],
        error: null,
        collection,
        linkedPlaceholder,
      });
      if (inserted.data.success) toast.success(`Imported ${Number(inserted.data.inserted).toLocaleString()} records`);
      else toast.error(`Imported ${inserted.data.inserted} of ${inserted.data.total}. Some rows need attention`);
    } catch (err) {
      setResult({
        inserted: 0,
        total: allRows.length,
        failures: [],
        error: err instanceof Error ? err.message : 'Import failed',
        collection: mode === 'existing'
          ? (selectedCollection?.is_published ? 'published' : 'draft')
          : collectionCreated ? 'draft' : 'none',
        linkedPlaceholder,
      });
    }

    setStep('done');
    // Refresh the collection list so a new Draft can be picked for a follow-up import.
    router.refresh();
  };

  // Done step: put a Draft collection live.
  const handlePublish = async () => {
    const slug = mode === 'existing' ? selectedCollection?.slug : newCollection.slug;
    if (!slug) return;
    setPublishing(true);
    const { ok, data } = await postImport({ action: 'publish-collection', slug });
    setPublishing(false);
    if (!ok) {
      toast.error(data.error || 'Publishing failed');
      return;
    }
    setResult((prev) => ({ ...prev, collection: 'published' }));
    toast.success(`${targetName} is live`);
    router.refresh();
  };

  return (
    <div className="max-w-4xl">
      {/* Progress steps */}
      <div className="flex items-center gap-2 mb-8 text-xs text-brand-muted overflow-x-auto">
        {['Mode', 'Collection', 'Upload', 'Mapping', hasImageColumn ? 'Images' : null, 'Preview', 'Import'].filter(Boolean).map((s, i) => (
          <span key={i} className="flex items-center gap-2 whitespace-nowrap">
            {i > 0 && <ArrowRight className="w-3 h-3" />}
            <span className={step === s?.toLowerCase() || (s === 'Import' && (step === 'importing' || step === 'done')) ? 'text-brand-gold font-medium' : ''}>
              {s}
            </span>
          </span>
        ))}
      </div>

      {/* Step: Mode */}
      {step === 'mode' && (
        <div className="space-y-4">
          <p className="text-sm text-brand-muted mb-4">Choose how you want to import records:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => { setMode('existing'); setStep('collection'); }}
              className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 text-left hover:border-brand-gold/25 transition-all group"
            >
              <FileSpreadsheet className="w-8 h-8 text-brand-gold mb-3" />
              <h3 className="font-display text-base font-semibold text-brand-cream group-hover:text-brand-gold mb-1">Import to Existing Collection</h3>
              <p className="text-xs text-brand-muted">Add records to a collection that already exists in the database.</p>
            </button>
            <button
              onClick={() => { setMode('new'); setStep('collection'); }}
              className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 text-left hover:border-brand-gold/25 transition-all group"
            >
              <Upload className="w-8 h-8 text-brand-sage mb-3" />
              <h3 className="font-display text-base font-semibold text-brand-cream group-hover:text-brand-gold mb-1">Create New Collection</h3>
              <p className="text-xs text-brand-muted">Create a new collection and table, then import records from a spreadsheet.</p>
            </button>
          </div>
        </div>
      )}

      {/* Step: Collection (existing) */}
      {step === 'collection' && mode === 'existing' && (
        <div className="space-y-4">
          <Label htmlFor="existing-collection">Select Collection</Label>
          <select
            id="existing-collection"
            value={selectedSlug}
            onChange={(e) => chooseExisting(e.target.value)}
            className="w-full px-3 py-2.5 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream focus:outline-none focus:border-brand-gold/25"
          >
            <option value="">Choose a collection...</option>
            {existingOptions.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((o) => (
                  <option key={o.slug} value={o.slug}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="text-[11px] text-brand-muted">
            Collections marked <span className="text-brand-cream">Empty</span> show “Coming Soon” on the site until records
            are imported into them.
          </p>

          {selectedIsPlaceholder && selectedCollection && placement && placementOptions && (
            <ImportPlacementField
              collectionName={selectedCollection.name}
              isTopLevel={!selectedCollection.parent_slug}
              suggestions={placementOptions}
              placement={placement}
              onChange={setPlacement}
              problems={placementIssues}
            />
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('mode')} className="border-brand-gold/20 text-brand-cream rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              onClick={() => setStep('upload')}
              disabled={!selectedSlug || placementIssues.length > 0}
              className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
            >
              Next <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Collection (new) */}
      {step === 'collection' && mode === 'new' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Collection Name</Label>
              <Input
                value={newCollection.name}
                onChange={(e) => setNewCollection({ ...newCollection, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') })}
                placeholder="e.g. Cherokee Agency Records"
                className="bg-brand-card border-brand-gold/[0.15]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-collection-slug">Slug</Label>
              <Input
                id="new-collection-slug"
                value={newCollection.slug}
                onChange={(e) => setNewCollection({ ...newCollection, slug: e.target.value })}
                placeholder="e.g. cherokee-agency"
                aria-invalid={slugTaken}
                aria-describedby={slugTaken ? 'new-collection-slug-error' : undefined}
                className="bg-brand-card border-brand-gold/[0.15]"
              />
              {slugTaken && (
                <p id="new-collection-slug-error" className="text-[11px] text-brand-burgundy-light">
                  A collection already uses this slug. Import into it as an existing collection, or pick another.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <select
                value={newCollection.category}
                onChange={(e) => setNewCollection({ ...newCollection, category: e.target.value })}
                className="w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream"
              >
                {collectionCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Era</Label>
              <select
                value={newCollection.era}
                onChange={(e) => setNewCollection({ ...newCollection, era: e.target.value })}
                className="w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream"
              >
                <option value="">None</option>
                {collectionEras.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <select
                value={newCollection.region}
                onChange={(e) => setNewCollection({ ...newCollection, region: e.target.value })}
                className="w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream"
              >
                <option value="">None</option>
                {collectionRegions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Parent Collection</Label>
              <select
                value={newCollection.parentSlug}
                onChange={(e) => setNewCollection({ ...newCollection, parentSlug: e.target.value })}
                className="w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream"
              >
                <option value="">None (top-level)</option>
                {parentCollections.map((c) => <option key={c.slug} value={c.slug}>{parentLabel(c)}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Display Type</Label>
              <select
                value={newCollection.displayType}
                onChange={(e) => setNewCollection({ ...newCollection, displayType: e.target.value })}
                className="w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream"
              >
                <option value="table">Table</option>
                <option value="book">Book</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Access Tier</Label>
              <select
                value={newCollection.accessTier}
                onChange={(e) => setNewCollection({ ...newCollection, accessTier: e.target.value })}
                className="w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream"
              >
                <option value="free">Free</option>
                <option value="explorer">Explorer (Premium)</option>
                <option value="scholar">Scholar</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={newCollection.hasImages} onChange={(e) => setNewCollection({ ...newCollection, hasImages: e.target.checked })} className="w-4 h-4 rounded" />
              <span className="text-sm text-brand-cream">Has Images</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={newCollection.hasOcr} onChange={(e) => setNewCollection({ ...newCollection, hasOcr: e.target.checked })} className="w-4 h-4 rounded" />
              <span className="text-sm text-brand-cream">Has OCR Text</span>
            </label>
          </div>

          <div className="space-y-3 border-t border-brand-gold/[0.08] pt-4">
            <div className="flex items-center justify-between">
              <Label>Descriptions</Label>
              <Button
                onClick={generateDescriptions}
                disabled={!newCollection.name || generating}
                variant="outline"
                className="border-brand-gold/20 text-brand-gold hover:text-brand-gold-light rounded-xl text-xs h-8"
              >
                {generating ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                )}
                Generate with AI
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-brand-muted">Short Description (one line)</Label>
              <Input
                value={newCollection.shortDescription}
                onChange={(e) => setNewCollection({ ...newCollection, shortDescription: e.target.value })}
                placeholder="One-sentence summary shown on collection cards"
                className="bg-brand-card border-brand-gold/[0.15]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-brand-muted">Long Description (paragraph)</Label>
              <textarea
                value={newCollection.longDescription}
                onChange={(e) => setNewCollection({ ...newCollection, longDescription: e.target.value })}
                placeholder="Several sentences describing the collection's contents, scope, and provenance"
                rows={4}
                className="w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.15] rounded-xl text-sm text-brand-cream focus:outline-none focus:border-brand-gold/25 resize-y"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('mode')} className="border-brand-gold/20 text-brand-cream rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              onClick={() => setStep('upload')}
              disabled={!newCollection.name || !newCollection.slug || slugTaken}
              className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
            >
              Next <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div
            className="bg-brand-card border-2 border-dashed border-brand-gold/20 rounded-2xl p-12 text-center hover:border-brand-gold/40 transition-colors cursor-pointer"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleFileUpload(file);
            }}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.xlsx,.xls';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFileUpload(file);
              };
              input.click();
            }}
          >
            {uploading ? (
              <Loader2 className="w-10 h-10 text-brand-gold mx-auto mb-3 animate-spin" />
            ) : (
              <Upload className="w-10 h-10 text-brand-muted mx-auto mb-3" />
            )}
            <p className="text-sm text-brand-cream font-medium mb-1">
              {uploading ? 'Parsing spreadsheet...' : 'Drop your .xlsx file here, or click to browse'}
            </p>
            <p className="text-xs text-brand-muted">Excel files only (.xlsx, .xls)</p>
          </div>
          <Button variant="outline" onClick={() => setStep('collection')} className="border-brand-gold/20 text-brand-cream rounded-xl">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </div>
      )}

      {/* Step: Column Mapping */}
      {step === 'mapping' && (
        <div className="space-y-4">
          <p className="text-sm text-brand-muted">
            Map your spreadsheet columns to database columns. {rowCount.toLocaleString()} rows detected. Unmatched
            columns are mapped to new columns automatically — anything set to “Skip” won&apos;t be imported. Each
            new column gets a type that fits every value in the file.
          </p>

          {unmappedRequired.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-brand-burgundy/25 bg-brand-burgundy/[0.06] px-4 py-3">
              <AlertCircle className="w-4 h-4 text-brand-burgundy-light mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-brand-cream">
                <span className="font-medium">
                  <span className="font-mono">{targetTable}</span> needs a value in{' '}
                  {unmappedRequired.map((c) => c.column).join(', ')} on every row
                </span>
                , but nothing in your file maps to {unmappedRequired.length === 1 ? 'it' : 'them'}. Pick a spreadsheet
                column for {unmappedRequired.length === 1 ? 'it' : 'each'} below.
              </p>
            </div>
          )}

          {fixedColumns.size > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-brand-sage/30 bg-brand-sage/[0.08] px-4 py-3">
              <CheckCircle className="w-4 h-4 text-brand-sage mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-brand-cream">
                Every record will be tagged{' '}
                {Object.entries(fixedValues).map(([column, value]) => (
                  <span key={column} className="font-mono">{column} = {value}</span>
                ))}{' '}
                so it shows in {targetName}.
                {taggedHeaders.length > 0 && (
                  <span className="text-brand-muted">
                    {' '}The file&apos;s {taggedHeaders.map((h) => `“${h}”`).join(' and ')} column{taggedHeaders.length === 1 ? ' is' : 's are'} replaced by the tag.
                  </span>
                )}
              </p>
            </div>
          )}

          {(() => {
            const tagged = new Set(taggedHeaders);
            const skipped = fileHeaders.filter((h) => !columnMapping[h] && !isFailedRowsHelperHeader(h) && !tagged.has(h));
            const helpers = fileHeaders.filter((h) => !columnMapping[h] && isFailedRowsHelperHeader(h));
            return (
              <>
                {skipped.length > 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-brand-gold mt-0.5 shrink-0" />
                    <p className="text-xs text-brand-cream">
                      <span className="font-medium">{skipped.length} column{skipped.length === 1 ? '' : 's'} will NOT be imported</span> (set to “Skip”):{' '}
                      <span className="text-brand-muted">{skipped.join(', ')}</span>. Pick a target for them below if you want them kept.
                    </p>
                  </div>
                )}
                {helpers.length > 0 && (
                  <p className="text-xs text-brand-muted">
                    {helpers.map((h) => `“${h}”`).join(' and ')} came from a rows-to-fix download, so{' '}
                    {helpers.length === 1 ? "it's" : "they're"} skipped.
                  </p>
                )}
              </>
            );
          })()}

          <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-hidden">
            {/* Mobile-first: each mapping stacks on phones and becomes a 4-column row from md up. */}
            <div className="hidden md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-4 px-4 py-3 border-b border-brand-gold/[0.08] text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
              <span>Spreadsheet Column</span>
              <span>Maps To</span>
              <span>Type</span>
              <span>Sample Value</span>
            </div>
            <div className="divide-y divide-brand-gold/[0.04]">
              {fileHeaders.map((header) => {
                const dbCol = columnMapping[header] || '';
                const existingType = tableSchema?.exists ? tableSchema.columnTypes[dbCol] : undefined;
                const problemRows = importConflicts
                  .filter((c) => c.column === dbCol && c.kind !== 'unmapped')
                  .reduce((sum, c) => sum + c.rows.length, 0);
                return (
                  <div
                    key={header}
                    className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)] md:gap-4 md:items-center"
                  >
                    <span className="text-sm text-brand-cream break-words">{header}</span>
                    <select
                      value={dbCol}
                      onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                      aria-label={`Database column for ${header}`}
                      className="px-2 py-1.5 bg-brand-bg border border-brand-gold/[0.08] rounded-lg text-xs text-brand-cream"
                    >
                      <option value="">— Skip —</option>
                      {dbColumns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                      <option value="image_path">image_path</option>
                      <option value="ocr_text">ocr_text</option>
                      <option value="slug">slug</option>
                    </select>
                    <ImportColumnTypeField
                      column={dbCol}
                      fixedType={existingType ?? (BUILT_IN_COLUMNS.has(dbCol) ? 'text' : undefined)}
                      problemRows={problemRows}
                      profile={newColumnProfiles[dbCol]}
                      value={newColumnTypes[dbCol]}
                      onChange={(type) => setTypeOverrides((prev) => ({ ...prev, [dbCol]: type }))}
                    />
                    <span className="text-xs text-brand-muted truncate">
                      <span className="md:hidden text-[10px] uppercase tracking-wider mr-1.5">Sample</span>
                      {sampleRows[0] ? String(sampleRows[0][header] ?? '') : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('upload')} className="border-brand-gold/20 text-brand-cream rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              onClick={() => {
                if (hasImageColumn) {
                  if (availableBuckets.length === 0 && !loadingBuckets) loadBuckets();
                  if (imageSource && !seededInPool) seedImageSource();
                  if (!imageColumn) {
                    const mapped = Object.entries(columnMapping).find(([, db]) => db === 'image_path');
                    if (mapped) setImageColumn(mapped[0]);
                  }
                  setStep('images');
                } else {
                  setStep('preview');
                }
              }}
              disabled={Object.values(columnMapping).filter(Boolean).length === 0}
              className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
            >
              Next <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Image Matching */}
      {step === 'images' && (
        <div className="space-y-4">
          <p className="text-sm text-brand-muted">
            {imageSource
              ? <>The folder you just uploaded into is already added below. Add more folders if some images live elsewhere, then match them to your spreadsheet.</>
              : <>Select the storage folder containing the images, then we&apos;ll match them to your spreadsheet.</>}
          </p>
          {uploadsInProgress > 0 && (
            <p className="flex items-center gap-2 rounded-xl border border-brand-gold/25 bg-brand-gold/[0.06] px-3 py-2 text-xs text-brand-cream" aria-live="polite">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-gold shrink-0" aria-hidden="true" />
              {uploadsInProgress} upload{uploadsInProgress === 1 ? ' is' : 's are'} still running. They join the pool as soon as they finish.
            </p>
          )}

          {/* Which column has image names */}
          <div className="space-y-2">
            <Label>Which column contains image names?</Label>
            <select
              value={imageColumn}
              onChange={(e) => {
                const col = e.target.value;
                setImageColumn(col);
                // Picking a column as the image source forces it to map to image_path
                // so no redundant DB column gets created from the original header name.
                if (col) {
                  setColumnMapping((prev) => ({ ...prev, [col]: 'image_path' }));
                }
              }}
              className="w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream"
            >
              <option value="">Select column...</option>
              {fileHeaders.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <p className="text-[11px] text-brand-muted">
              The selected column will be stored as <span className="font-mono text-brand-cream">image_path</span> — no separate column is created for it.
            </p>
          </div>

          {/* Storage browser */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Storage Bucket</Label>
              <button
                type="button"
                onClick={loadBuckets}
                disabled={loadingBuckets}
                className="text-xs text-brand-gold hover:text-brand-gold-light disabled:opacity-50"
              >
                {loadingBuckets ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            <select
              value={storageBucket}
              onChange={(e) => {
                const bucket = e.target.value;
                setStorageBucket(bucket);
                setStorageFiles([]);
                setStorageFolder('');
                if (bucket) browseStorage(bucket, '');
              }}
              disabled={loadingBuckets || availableBuckets.length === 0}
              className="w-full px-3 py-2 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream disabled:opacity-50"
            >
              <option value="">
                {loadingBuckets
                  ? 'Loading buckets...'
                  : availableBuckets.length === 0
                  ? 'No buckets found'
                  : 'Select a bucket...'}
              </option>
              {availableBuckets.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                  {b.public ? '' : ' (private)'}
                </option>
              ))}
            </select>
            {browsingStorage && (
              <p className="text-xs text-brand-muted flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading folder…
              </p>
            )}
          </div>

          {/* Folder contents */}
          {storageFiles.length > 0 && (
            <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-brand-gold/[0.08] flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-brand-muted">
                  <span>{storageBucket}</span>
                  {storageFolder && (
                    <>
                      <span>/</span>
                      <span className="text-brand-cream">{storageFolder}</span>
                    </>
                  )}
                </div>
                {storageFolder && (
                  <button
                    onClick={() => {
                      const parts = storageFolder.split('/');
                      parts.pop();
                      browseStorage(storageBucket, parts.join('/'));
                    }}
                    className="text-xs text-brand-gold hover:text-brand-gold-light"
                  >
                    Up
                  </button>
                )}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-brand-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recurseNext}
                      onChange={(e) => setRecurseNext(e.target.checked)}
                      className="accent-[#C8956C]"
                    />
                    Include subfolders
                  </label>
                  <Button
                    onClick={addCurrentFolder}
                    disabled={addingFolder}
                    className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl text-xs h-7 px-3"
                  >
                    {addingFolder ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add this folder'}
                  </Button>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-brand-gold/[0.04]">
                {storageFiles.map((f) => (
                  <button
                    key={f.name}
                    onClick={() => {
                      if (f.isFolder) browseStorage(storageBucket, f.path);
                    }}
                    className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 ${f.isFolder ? 'hover:bg-brand-card-hover cursor-pointer' : 'cursor-default'}`}
                  >
                    {f.isFolder ? <FolderOpen className="w-3.5 h-3.5 text-brand-gold" /> : <ImageIcon className="w-3.5 h-3.5 text-brand-muted" />}
                    <span className="text-brand-cream">{f.name}</span>
                  </button>
                ))}
              </div>

            </div>
          )}

          {/* Folders committed to this import. The browser above shows one folder at
              a time; matching runs against everything listed here. */}
          {sourceFolders.length > 0 && (
            <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-brand-gold/[0.08] flex items-center justify-between">
                <span className="text-xs text-brand-cream">
                  {sourceFolders.length} folder{sourceFolders.length === 1 ? '' : 's'} ·{' '}
                  {sourceFolders.reduce((n, f) => n + f.files.length, 0).toLocaleString()} images
                </span>
                <span className="text-xs text-brand-muted">{matchPool.length.toLocaleString()} usable</span>
              </div>
              <div className="divide-y divide-brand-gold/[0.04]">
                {sourceFolders.map((f) => (
                  <div key={f.id} className="px-4 py-2 flex items-center gap-2 text-xs">
                    <FolderOpen className="w-3.5 h-3.5 text-brand-gold shrink-0" />
                    <span className="text-brand-cream truncate">
                      {f.bucket}{f.folder ? `/${f.folder}` : ''}
                    </span>
                    {f.recursive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-gold/10 text-brand-gold shrink-0">
                        + subfolders
                      </span>
                    )}
                    {f.truncated && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-burgundy/20 text-brand-burgundy-light shrink-0">
                        capped
                      </span>
                    )}
                    <span className="text-brand-muted ml-auto shrink-0">{f.files.length.toLocaleString()}</span>
                    <button
                      onClick={() => removeFolder(f.id)}
                      className="text-brand-muted hover:text-brand-burgundy-light shrink-0"
                      aria-label="Remove folder"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* A filename in two folders cannot be matched safely. Left unresolved it
                  is excluded rather than guessed. */}
              {conflicts.length > 0 && (
                <div className="border-t border-brand-gold/[0.08] px-4 py-3 space-y-3">
                  <p className="text-xs text-brand-burgundy-light">
                    {conflicts.length} filename{conflicts.length === 1 ? '' : 's'} appear in more than one
                    folder. Pick which folder wins — unresolved names are left unmatched.
                  </p>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {conflicts.map((c) => (
                      <div key={c.name} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-brand-cream font-mono">{c.entries[0].file.name}</span>
                        {c.entries.map((e) => (
                          <button
                            key={e.file.path}
                            onClick={() =>
                              setConflictChoice((prev) => ({ ...prev, [c.name]: e.file.path }))
                            }
                            className={`px-2 py-1 rounded-lg border ${
                              conflictChoice[c.name] === e.file.path
                                ? 'border-brand-gold bg-brand-gold/10 text-brand-gold'
                                : 'border-brand-gold/[0.15] text-brand-muted hover:text-brand-cream'
                            }`}
                          >
                            {e.folderId.split(':')[1] || '(bucket root)'}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {unresolvedConflicts.length > 0 && (
                <div className="border-t border-brand-gold/[0.08] px-4 py-3">
                  <span className="text-xs text-brand-burgundy-light">
                    {unresolvedConflicts.length} filename{unresolvedConflicts.length === 1 ? '' : 's'} still ambiguous
                  </span>
                </div>
              )}
            </div>
          )}

          <ImportImageMatches
            totalNames={namesNeedingFiles.length}
            poolSize={matchPool.length}
            result={imageMatches}
            accepted={acceptedNear}
            onAccept={(name, path) =>
              setAcceptedNear((prev) => {
                const next = { ...prev };
                if (path) next[name] = path;
                else delete next[name];
                return next;
              })
            }
            onAcceptAll={() =>
              setAcceptedNear((prev) => {
                const next = { ...prev };
                for (const [name, files] of Object.entries(imageMatches.near)) if (!next[name]) next[name] = files[0].path;
                return next;
              })
            }
          />

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('mapping')} className="border-brand-gold/20 text-brand-cream rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              onClick={() => setStep('preview')}
              className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
            >
              Next <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <p className="text-sm text-brand-muted">
            Preview of {Math.min(5, sampleRows.length)} of {rowCount.toLocaleString()} rows to be imported.
          </p>

          {unlinkedImageNames.length > 0 && (
            <div role="alert" className="space-y-2 rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] px-4 py-3">
              <p className="flex items-start gap-2 text-xs text-brand-cream">
                <AlertCircle className="w-4 h-4 mt-px shrink-0 text-brand-gold" aria-hidden="true" />
                <span>
                  <span className="font-medium">
                    {unlinkedImageNames.length.toLocaleString()} image name{unlinkedImageNames.length === 1 ? '' : 's'} didn’t match a file
                  </span>
                  , so those records would be saved with just the name and show no image. Go back to Images to add the
                  folder they’re in, or import anyway and link them later from Upload Images → Link to existing records.
                </span>
              </p>
              <p className="pl-6 font-mono text-[11px] text-brand-muted break-all">
                {unlinkedImageNames.slice(0, 8).join(' · ')}
                {unlinkedImageNames.length > 8 && ` · and ${(unlinkedImageNames.length - 8).toLocaleString()} more`}
              </p>
              <label className="flex items-center gap-2 pl-6 text-xs text-brand-cream cursor-pointer">
                <input
                  type="checkbox"
                  checked={ackedUnlinked === unlinkedImageNames.length}
                  onChange={(e) => setAckedUnlinked(e.target.checked ? unlinkedImageNames.length : null)}
                  className="accent-[#C8956C]"
                />
                Import them anyway without images
              </label>
            </div>
          )}

          <ImportPreflight
            tableName={targetTable}
            tableExists={!!tableSchema?.exists}
            rowCount={rowCount}
            conflicts={importConflicts}
            blockers={blockers}
            orderColumns={orderColumns}
            onConvert={handleConvert}
            onBackToMapping={() => setStep('mapping')}
          />

          <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-brand-gold/[0.08]">
                  {Object.entries(columnMapping).filter(([, v]) => v).map(([fileCol, dbCol]) => (
                    <th key={fileCol} className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-brand-muted whitespace-nowrap">
                      {dbCol}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-brand-gold/[0.04]">
                    {Object.entries(columnMapping).filter(([, v]) => v).map(([fileCol, dbCol]) => {
                      let val = String(row[fileCol] ?? '');
                      if (dbCol === 'image_path' && imageMapping[val]) {
                        val = imageMapping[val].split('/').pop() || val;
                      }
                      return (
                        <td key={fileCol} className="px-3 py-2 text-brand-cream whitespace-nowrap max-w-[200px] truncate">
                          {val || <span className="text-brand-muted">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-brand-card border border-brand-gold/[0.08] rounded-xl p-4 text-sm">
            <p className="text-brand-cream font-medium mb-2">Import Summary</p>
            <ul className="space-y-1 text-brand-muted text-xs">
              <li>Records: <span className="text-brand-cream">{rowCount.toLocaleString()}</span></li>
              <li>Columns mapped: <span className="text-brand-cream">{mappedColumns.length}</span></li>
              {Object.keys(newColumnTypes).length > 0 && (
                <li>
                  New columns:{' '}
                  <span className="text-brand-cream">
                    {Object.entries(newColumnTypes).map(([column, type]) => `${column} (${typeLabel(type)})`).join(', ')}
                  </span>
                </li>
              )}
              <li>Target: <span className="text-brand-cream">{targetName}</span></li>
              <li>
                Table: <span className="text-brand-cream font-mono">{targetTable}</span>
                {(mode === 'new' || activePlacement?.kind === 'own') && tableSchema?.exists && blockers.length === 0 && (
                  <span> (the empty table left by an earlier attempt, reused)</span>
                )}
                {activePlacement?.kind === 'own' && !tableSchema?.exists && <span> (new)</span>}
              </li>
              {fixedColumns.size > 0 && (
                <li>
                  Tagged:{' '}
                  <span className="text-brand-cream font-mono">
                    {Object.entries(fixedValues).map(([column, value]) => `${column} = ${value}`).join(', ')}
                  </span>
                </li>
              )}
              {activePlacement && (
                <li>
                  Shows on the site: <span className="text-brand-cream">as soon as the import finishes, in place of “Coming Soon”.</span>
                </li>
              )}
              {Object.keys(imageMapping).length > 0 && (
                <li>Images matched: <span className="text-brand-cream">{Object.keys(imageMapping).length}</span></li>
              )}
              {mode === 'new' && (
                <li>
                  Goes live:{' '}
                  <span className="text-brand-cream">automatically once every record is in. It stays a Draft until then.</span>
                </li>
              )}
            </ul>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(hasImageColumn ? 'images' : 'mapping')} className="border-brand-gold/20 text-brand-cream rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              onClick={handleImport}
              disabled={!readyToImport}
              className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
            >
              <Upload className="w-4 h-4 mr-1.5" /> Import {rowCount.toLocaleString()} Records
            </Button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-10 text-center">
          <Loader2 className="w-10 h-10 text-brand-gold mx-auto mb-4 animate-spin" />
          <h3 className="font-display text-lg font-semibold text-brand-cream mb-2">Importing Records...</h3>
          <p className="text-sm text-brand-muted">Please wait while records are being inserted into the database.</p>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (() => {
        const complete = !result.error && result.failures.length === 0;
        return (
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-6 sm:p-10 text-center">
          {complete ? (
            <CheckCircle className="w-12 h-12 text-brand-sage mx-auto mb-4" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-12 h-12 text-brand-gold mx-auto mb-4" aria-hidden="true" />
          )}
          <h3 className="font-display text-lg font-semibold text-brand-cream mb-2">
            {complete ? 'Import Complete' : result.inserted > 0 ? 'Imported with Problems' : 'Nothing Was Imported'}
          </h3>
          <p className="text-sm text-brand-muted mb-2">
            {result.inserted.toLocaleString()} of {result.total.toLocaleString()} records imported.
          </p>

          {result.error && (
            <p className="text-xs text-red-400 mt-2 break-words" role="alert">{result.error}</p>
          )}

          {result.failures.length > 0 && (
            <div className="mt-4 space-y-3 text-left">
              <ImportFailureList failures={result.failures} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-brand-muted">
                  Row numbers match your spreadsheet. The rows that went in are saved, so importing the whole file
                  again would duplicate them. Download the rows to fix, correct them, then import that file into{' '}
                  {targetName} as an existing collection.
                </p>
                <div className="shrink-0">
                  <ImportFailedRowsDownload
                    allRows={allRows}
                    rowNumbers={rowNumbers}
                    headers={fileHeaders}
                    failures={result.failures}
                    fileName={fileName}
                  />
                </div>
              </div>
            </div>
          )}

          {result.collection === 'published' && mode === 'new' && (
            <p className="text-sm text-brand-sage mt-4 flex items-center justify-center gap-1.5">
              <CheckCircle className="w-4 h-4" aria-hidden="true" /> {targetName} is live.
            </p>
          )}

          {result.linkedPlaceholder && result.collection === 'published' && result.inserted > 0 && (
            <p className="text-sm text-brand-sage mt-4 flex items-center justify-center gap-1.5">
              <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" /> {targetName} now shows its records instead of “Coming Soon”.
            </p>
          )}

          {result.collection === 'draft' && (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] px-4 py-3 text-left sm:flex-row sm:justify-between">
              <p className="text-xs text-brand-cream">
                {targetName} is a <span className="font-medium">Draft</span>, so visitors can&apos;t see it yet.
                {mode === 'new' && result.inserted < result.total && ' It stayed a Draft because not every row made it in.'}
              </p>
              {result.inserted > 0 && (
                <Button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl text-xs h-8 shrink-0"
                >
                  {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : 'Publish now'}
                </Button>
              )}
            </div>
          )}

          <div className="flex gap-3 justify-center mt-6">
            <Button
              onClick={() => {
                setStep('mode');
                setFileName('');
                setFileHeaders([]);
                setAllRows([]);
                setRowNumbers([]);
                setSampleRows([]);
                setColumnMapping({});
                setAcceptedNear({});
                setAckedUnlinked(null);
                setSelectedSlug('');
                setPlacement(null);
                setTaggedHeaders([]);
                setTableSchema(null);
                setTypeOverrides({});
                setResult(EMPTY_RESULT);
              }}
              variant="outline"
              className="border-brand-gold/20 text-brand-cream rounded-xl"
            >
              Import More
            </Button>
            <Button
              onClick={() => router.push('/admin/collections')}
              className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
            >
              Go to Collections
            </Button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
