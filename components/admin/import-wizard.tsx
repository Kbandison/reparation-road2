'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
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
import type { Collection } from '@/lib/types';
import { collectionCategories, collectionEras, collectionRegions } from '@/lib/constants';
import { BUILT_IN_COLUMNS, SYSTEM_COLUMNS, findConflicts, prepareRows, toTableName } from '@/lib/import/records';
import { profileColumn, typeLabel, type ColumnProfile } from '@/lib/import/values';
import type { ImportColumnType, ImportFailure, TableColumns } from '@/lib/import/types';
import { ImportColumnTypeField } from './import-column-type-field';
import { ImportPreflight } from './import-preflight';
import { ImportFailureList } from './import-failure-list';

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
}

const EMPTY_RESULT: ImportResult = { inserted: 0, total: 0, failures: [], error: null, collection: 'none' };

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

type CollectionInfo = Pick<Collection, 'slug' | 'name' | 'table_name' | 'parent_slug' | 'display_columns' | 'search_columns' | 'sort_columns' | 'has_images' | 'has_ocr' | 'discriminator_column' | 'discriminator_value' | 'is_published'>;

interface ImportWizardProps {
  collections: CollectionInfo[];
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

function fuzzyMatch(imageName: string, files: StorageFile[]): StorageFile | null {
  const norm = normalize(imageName);
  if (!norm) return null;

  // Exact match (without extension)
  for (const f of files) {
    if (f.isFolder) continue;
    const nameNoExt = f.name.replace(/\.[^.]+$/, '');
    if (normalize(nameNoExt) === norm) return f;
  }

  // Partial match
  for (const f of files) {
    if (f.isFolder) continue;
    const nameNoExt = f.name.replace(/\.[^.]+$/, '');
    const fNorm = normalize(nameNoExt);
    if (fNorm.includes(norm) || norm.includes(fNorm)) return f;
  }

  return null;
}

export function ImportWizard({ collections }: ImportWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('mode');
  const [mode, setMode] = useState<'existing' | 'new'>('existing');

  // Collection selection
  const [selectedSlug, setSelectedSlug] = useState('');

  // New collection form
  const [newCollection, setNewCollection] = useState({
    name: '', slug: '', category: 'legal', era: '', region: '',
    parentSlug: '', displayType: 'table', accessTier: 'explorer',
    hasImages: false, hasOcr: false,
    shortDescription: '', longDescription: '',
  });
  const [generating, setGenerating] = useState(false);

  // File data
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
  const [imageMapping, setImageMapping] = useState<Record<string, string>>({});
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
  const collectionBySlug = new Map(collections.map((c) => [c.slug, c]));
  const parentLabel = (c: CollectionInfo): string => {
    if (!c.parent_slug) return c.name;
    const parent = collectionBySlug.get(c.parent_slug);
    return parent ? `${parent.name} → ${c.name}` : c.name;
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
        ? (selectedCollection?.table_name ?? '')
        : (toTableName(newCollection.slug) || 'new_table');
      const schema = await loadTableSchema(table);
      if (mode === 'existing' && !schema.exists) {
        toast.error(`This collection's table (${table}) doesn't exist`);
        setUploading(false);
        return;
      }
      const existingCols = schema.exists ? schema.columns : [];

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
        for (const header of data.headers) {
          if (looksLikeImageColumn(header)) {
            mapping[header] = 'image_path';
            continue;
          }
          const normHeader = normalize(header);
          const match = existingCols.find((c: string) => normalize(c) === normHeader);
          mapping[header] = match || toColumnName(header);
        }
        // Offer both the existing columns and any new ones as mapping targets.
        setDbColumns([...new Set([...existingCols, ...(data.headers as string[]).map(toColumnName)])]);
        setColumnMapping(mapping);
      } else {
        // New collection — DB columns are derived from the file (plus any a
        // leftover table already has).
        const cols: string[] = (data.headers as string[]).map((h) => toColumnName(h));
        setDbColumns([...new Set([...existingCols, ...cols])]);
        const mapping: Record<string, string> = {};
        data.headers.forEach((h: string, i: number) => {
          // Image-like columns always go to image_path so no redundant DB column is created.
          mapping[h] = looksLikeImageColumn(cols[i]) ? 'image_path' : cols[i];
        });
        setColumnMapping(mapping);
        setNewTableName(table);
      }

      setStep('mapping');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse file');
    }
    setUploading(false);
  }, [mode, selectedCollection, newCollection.slug]);

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

  // Commit the folder currently open in the browser to the match pool.
  const addCurrentFolder = async () => {
    if (!storageBucket) return;
    const key = `${storageBucket}:${storageFolder}`;
    if (sourceFolders.some((f) => `${f.bucket}:${f.folder}` === key)) {
      toast.error('That folder is already added');
      return;
    }

    setAddingFolder(true);
    try {
      const params = new URLSearchParams({
        action: 'storage-files',
        bucket: storageBucket,
        folder: storageFolder,
        recursive: String(recurseNext),
      });
      const res = await fetch(`/api/admin/import?${params}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to read that folder');
        return;
      }

      const files = (data.items || []).filter((f: StorageFile) => !f.isFolder);
      if (files.length === 0) {
        toast.error(
          recurseNext ? 'No images found in that folder or below it' : 'No images directly in that folder — try including subfolders',
        );
        return;
      }

      setSourceFolders((prev) => [
        ...prev,
        {
          id: key,
          bucket: storageBucket,
          folder: storageFolder,
          recursive: recurseNext,
          files,
          truncated: Boolean(data.truncated),
        },
      ]);
      if (data.truncated) {
        toast.error(`Stopped at ${files.length} files — that folder is very large`);
      } else {
        toast.success(`Added ${files.length} image${files.length === 1 ? '' : 's'}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read that folder');
    } finally {
      setAddingFolder(false);
    }
  };

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
        const key = normalize(file.name.replace(/\.[^.]+$/, ''));
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


  // Auto-match image names to storage files
  const autoMatchImages = useCallback(() => {
    if (!imageColumn || matchPool.length === 0) return;
    const files = matchPool;
    const mapping: Record<string, string> = {};

    for (const row of allRows) {
      const imgName = String(row[imageColumn] || '').trim();
      if (!imgName || mapping[imgName]) continue;
      const match = fuzzyMatch(imgName, files);
      if (match) mapping[imgName] = match.path;
    }

    setImageMapping(mapping);
  }, [imageColumn, matchPool, allRows]);

  const targetTable = mode === 'existing' ? (selectedCollection?.table_name ?? '') : newTableName;
  const targetName = mode === 'existing' ? (selectedCollection?.name ?? '') : newCollection.name;

  // Every row as the record it will become, tagged with its spreadsheet row.
  const preparedRows = useMemo(
    () => prepareRows(allRows, rowNumbers, columnMapping),
    [allRows, rowNumbers, columnMapping],
  );
  const mappedColumns = useMemo(
    () => [...new Set(Object.values(columnMapping).filter(Boolean))],
    [columnMapping],
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
    () => (tableSchema?.exists ? findConflicts(preparedRows, mappedColumns, tableSchema) : []),
    [tableSchema, preparedRows, mappedColumns],
  );

  const slugTaken = mode === 'new' && !!newCollection.slug && collections.some((c) => c.slug === newCollection.slug);

  // Problems with where the rows are going, rather than with the rows themselves.
  const blockers = useMemo(() => {
    if (mode !== 'new') return [];
    const list: string[] = [];
    if (slugTaken) {
      list.push(`A collection with the slug "${newCollection.slug}" already exists. Import into it as an existing collection, or change the slug.`);
    }
    if (tableSchema?.exists) {
      // An empty table no collection uses is a leftover from a failed run and is
      // safe to reuse. Anything else would mix these rows into someone else's.
      const owner = collections.find((c) => c.table_name === newTableName);
      if (owner && owner.slug !== newCollection.slug) {
        list.push(`The table ${newTableName} already belongs to "${owner.name}". Import into that collection instead, or change the slug.`);
      } else if (tableSchema.rowCount !== 0) {
        list.push(`A table named ${newTableName} already holds ${tableSchema.rowCount?.toLocaleString() ?? 'some'} records. Change the slug so this collection gets its own table.`);
      }
    }
    return list;
  }, [mode, slugTaken, newCollection.slug, tableSchema, collections, newTableName]);

  // Columns that keep the target collection in document order: sort_columns
  // when set, else the first display column (see lib/collections/queries.ts).
  const orderColumns = mode === 'existing' && selectedCollection
    ? (selectedCollection.sort_columns?.length ? selectedCollection.sort_columns : selectedCollection.display_columns.slice(0, 1))
    : [];

  const unmappedRequired = importConflicts.filter((c) => c.kind === 'unmapped');
  const readyToImport = tableSchema !== null && importConflicts.length === 0 && blockers.length === 0;

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
    const recordsPayload = {
      tableName,
      records: allRows,
      rowNumbers,
      columnMapping,
      imageMapping: Object.keys(imageMapping).length > 0 ? imageMapping : undefined,
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

    let collectionCreated = false;
    try {
      // 1. Make sure every mapped column exists. create-table is idempotent
      //    (CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS): new columns get
      //    the types chosen on the Mapping step, existing ones are left alone.
      const columns = Object.entries(newColumnTypes).map(([name, type]) => ({ name, type }));
      if (columns.length > 0) {
        const created = await postImport({ action: 'create-table', tableName, columns });
        if (!created.ok) return await backToPreview(created.data.error || 'Failed to prepare table columns');
      }

      if (mode === 'new') {
        // 2. Have the server confirm the whole file fits BEFORE the collection
        //    exists. A problem here leaves nothing behind but an empty table,
        //    which the next attempt reuses.
        const check = await postImport({ ...recordsPayload, action: 'insert-records', dryRun: true });
        if (!check.ok) return await backToPreview(check.data.error || 'The file failed its final check', check.status === 422);

        // 3. Collection metadata, created as a Draft so visitors see nothing
        //    until every record is in. image_path renders inside the record
        //    modal and ocr_text/slug aren't useful columns, so none of them
        //    are displayed or searched.
        const userMappedCols = mappedColumns.filter((c) => !SYSTEM_COLUMNS.has(c) && !BUILT_IN_COLUMNS.has(c));
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

      setResult({
        inserted: inserted.data.inserted ?? 0,
        total: inserted.data.total ?? allRows.length,
        failures: inserted.data.failures ?? [],
        error: null,
        collection,
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

  // Check if image step is needed
  const hasImageColumn = Object.values(columnMapping).includes('image_path');

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
          <Label>Select Collection</Label>
          <select
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="w-full px-3 py-2.5 bg-brand-card border border-brand-gold/[0.08] rounded-xl text-sm text-brand-cream focus:outline-none focus:border-brand-gold/25"
          >
            <option value="">Choose a collection...</option>
            {collections.filter((c) => c.table_name).map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}{c.parent_slug ? ` (${c.parent_slug})` : ''}{c.is_published ? '' : ' · Draft'}</option>
            ))}
          </select>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('mode')} className="border-brand-gold/20 text-brand-cream rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              onClick={() => setStep('upload')}
              disabled={!selectedSlug}
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

          {(() => {
            const skipped = fileHeaders.filter((h) => !columnMapping[h]);
            return skipped.length > 0 ? (
              <div className="flex items-start gap-2 rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] px-4 py-3">
                <AlertCircle className="w-4 h-4 text-brand-gold mt-0.5 shrink-0" />
                <p className="text-xs text-brand-cream">
                  <span className="font-medium">{skipped.length} column{skipped.length === 1 ? '' : 's'} will NOT be imported</span> (set to “Skip”):{' '}
                  <span className="text-brand-muted">{skipped.join(', ')}</span>. Pick a target for them below if you want them kept.
                </p>
              </div>
            ) : null;
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
            Select the storage folder containing the images, then we&apos;ll match them to your spreadsheet.
          </p>

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

              <div className="border-t border-brand-gold/[0.08] px-4 py-3">
                <Button
                  onClick={autoMatchImages}
                  disabled={!imageColumn || matchPool.length === 0}
                  className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl text-xs"
                >
                  <ImageIcon className="w-3.5 h-3.5 mr-1.5" />
                  Auto-Match Images
                </Button>
                {Object.keys(imageMapping).length > 0 && (
                  <span className="text-xs text-brand-sage ml-3">
                    {Object.keys(imageMapping).length} matched
                  </span>
                )}
                {unresolvedConflicts.length > 0 && (
                  <span className="text-xs text-brand-burgundy-light ml-3">
                    {unresolvedConflicts.length} still ambiguous
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Match preview */}
          {Object.keys(imageMapping).length > 0 && (
            <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
              <div className="divide-y divide-brand-gold/[0.04]">
                {Object.entries(imageMapping).slice(0, 20).map(([name, path]) => (
                  <div key={name} className="px-4 py-1.5 flex items-center justify-between text-xs">
                    <span className="text-brand-cream">{name}</span>
                    <div className="flex items-center gap-1.5 text-brand-sage">
                      <CheckCircle className="w-3 h-3" />
                      <span className="truncate max-w-[200px]">{path.split('/').pop()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unmatched count */}
          {imageColumn && allRows.length > 0 && Object.keys(imageMapping).length > 0 && (
            (() => {
              const uniqueNames = new Set(allRows.map((r) => String(r[imageColumn] || '').trim()).filter(Boolean));
              const unmatched = [...uniqueNames].filter((n) => !imageMapping[n]);
              if (unmatched.length === 0) return <p className="text-xs text-brand-sage flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> All images matched</p>;
              return (
                <p className="text-xs text-brand-gold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {unmatched.length} image name{unmatched.length > 1 ? 's' : ''} unmatched
                </p>
              );
            })()
          )}

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
                {mode === 'new' && tableSchema?.exists && blockers.length === 0 && (
                  <span> (the empty table left by an earlier attempt, reused)</span>
                )}
              </li>
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
            <div className="mt-4 space-y-3">
              <ImportFailureList failures={result.failures} />
              <p className="text-xs text-brand-muted text-left">
                Row numbers match your spreadsheet. The rows that went in are saved, so importing the whole file
                again would duplicate them. Fix just these rows, then import them into {targetName} as an existing
                collection.
              </p>
            </div>
          )}

          {result.collection === 'published' && mode === 'new' && (
            <p className="text-sm text-brand-sage mt-4 flex items-center justify-center gap-1.5">
              <CheckCircle className="w-4 h-4" aria-hidden="true" /> {targetName} is live.
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
                setFileHeaders([]);
                setAllRows([]);
                setRowNumbers([]);
                setSampleRows([]);
                setColumnMapping({});
                setImageMapping({});
                setSelectedSlug('');
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
