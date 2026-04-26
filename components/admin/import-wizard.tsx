'use client';

import { useState, useCallback } from 'react';
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

type Step = 'mode' | 'collection' | 'upload' | 'mapping' | 'images' | 'preview' | 'importing' | 'done';

interface StorageFile {
  name: string;
  isFolder: boolean;
  path: string;
  url: string;
}

type CollectionInfo = Pick<Collection, 'slug' | 'name' | 'table_name' | 'parent_slug' | 'display_columns' | 'search_columns' | 'has_images' | 'has_ocr' | 'discriminator_column' | 'discriminator_value'>;

interface ImportWizardProps {
  collections: CollectionInfo[];
}

// Normalize a string for fuzzy matching
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
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
  const [fileColumnTypes, setFileColumnTypes] = useState<Record<string, string>>({});
  const [sampleRows, setSampleRows] = useState<Record<string, unknown>[]>([]);
  const [allRows, setAllRows] = useState<Record<string, unknown>[]>([]);
  const [rowCount, setRowCount] = useState(0);

  // Column mapping: fileCol -> dbCol
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [dbColumns, setDbColumns] = useState<string[]>([]);
  const [newTableName, setNewTableName] = useState('');

  // Image matching
  const [storageBucket, setStorageBucket] = useState('');
  const [storageFolder, setStorageFolder] = useState('');
  const [storageFiles, setStorageFiles] = useState<StorageFile[]>([]);
  const [imageMapping, setImageMapping] = useState<Record<string, string>>({});
  const [imageColumn, setImageColumn] = useState('');
  const [browsingStorage, setBrowsingStorage] = useState(false);
  const [availableBuckets, setAvailableBuckets] = useState<{ name: string; public: boolean }[]>([]);
  const [loadingBuckets, setLoadingBuckets] = useState(false);

  // Import progress
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ inserted: 0, total: 0, errors: [] as string[] });
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

      setFileHeaders(data.headers);
      setFileColumnTypes(data.columnTypes);
      setSampleRows(data.sampleRows);
      setAllRows(data.allRows);
      setRowCount(data.rowCount);

      // Fetch DB schema for existing collections
      if (mode === 'existing' && selectedCollection?.table_name) {
        const schemaRes = await fetch(`/api/admin/import?action=schema&table=${selectedCollection.table_name}`);
        const schemaData = await schemaRes.json();
        if (schemaData.columns) {
          setDbColumns(schemaData.columns);
          // Auto-map by matching names
          const mapping: Record<string, string> = {};
          for (const header of data.headers) {
            const normHeader = normalize(header);
            const match = schemaData.columns.find((c: string) => normalize(c) === normHeader);
            if (match) mapping[header] = match;
          }
          setColumnMapping(mapping);
        }
      } else {
        // New collection — DB columns will be derived from file
        const cols = data.headers.map((h: string) => h.replace(/[^a-z0-9_ ]/gi, '').replace(/\s+/g, '_').toLowerCase());
        setDbColumns(cols);
        const mapping: Record<string, string> = {};
        data.headers.forEach((h: string, i: number) => { mapping[h] = cols[i]; });
        setColumnMapping(mapping);
        setNewTableName(newCollection.slug.replace(/-/g, '_') || 'new_table');
      }

      setStep('mapping');
    } catch {
      toast.error('Failed to parse file');
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

  // Auto-match image names to storage files
  const autoMatchImages = useCallback(() => {
    if (!imageColumn || storageFiles.length === 0) return;
    const files = storageFiles.filter((f) => !f.isFolder);
    const mapping: Record<string, string> = {};

    for (const row of allRows) {
      const imgName = String(row[imageColumn] || '').trim();
      if (!imgName || mapping[imgName]) continue;
      const match = fuzzyMatch(imgName, files);
      if (match) mapping[imgName] = match.path;
    }

    setImageMapping(mapping);
  }, [imageColumn, storageFiles, allRows]);

  // Step: Do the import
  const handleImport = async () => {
    setImporting(true);
    setStep('importing');

    const tableName = mode === 'existing'
      ? selectedCollection?.table_name!
      : newTableName;

    // If new collection, create the table first
    if (mode === 'new') {
      const columns = Object.values(columnMapping)
        .filter(Boolean)
        .filter((c) => !['id', 'slug', 'created_at', 'image_path', 'ocr_text'].includes(c))
        .map((c) => ({
          name: c,
          type: fileColumnTypes[Object.keys(columnMapping).find((k) => columnMapping[k] === c)!] || 'text',
        }));

      const createRes = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-table', tableName: newTableName, columns }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        toast.error(createData.error || 'Failed to create table');
        setImporting(false);
        setStep('preview');
        return;
      }

      // Create collection metadata. Exclude system columns from display/search —
      // image_path renders inside the record modal, not as a table column;
      // ocr_text and slug aren't useful in either view.
      const RESERVED_DISPLAY = new Set(['image_path', 'ocr_text', 'slug', 'id', 'created_at']);
      const userMappedCols = Object.values(columnMapping)
        .filter(Boolean)
        .filter((c) => !RESERVED_DISPLAY.has(c));
      const displayCols = userMappedCols.slice(0, 7);
      const searchCols = userMappedCols.slice(0, 3);

      await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-collection',
          slug: newCollection.slug,
          name: newCollection.name,
          shortDescription: newCollection.shortDescription,
          longDescription: newCollection.longDescription,
          category: newCollection.category,
          era: newCollection.era || null,
          region: newCollection.region || null,
          tableName: newTableName,
          parentSlug: newCollection.parentSlug || null,
          displayType: newCollection.displayType,
          accessTier: newCollection.accessTier,
          displayColumns: displayCols,
          searchColumns: searchCols,
          hasImages: newCollection.hasImages,
          hasOcr: newCollection.hasOcr,
        }),
      });
    }

    // Insert records
    const res = await fetch('/api/admin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'insert-records',
        tableName: tableName,
        records: allRows,
        columnMapping,
        imageMapping: Object.keys(imageMapping).length > 0 ? imageMapping : undefined,
      }),
    });

    const data = await res.json();
    setProgress({ inserted: data.inserted || 0, total: data.total || allRows.length, errors: data.errors || [] });
    setImporting(false);
    setStep('done');

    if (data.success) {
      toast.success(`Imported ${data.inserted} records`);
    } else {
      toast.error(`Imported ${data.inserted}/${data.total} with errors`);
    }
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
              <option key={c.slug} value={c.slug}>{c.name}{c.parent_slug ? ` (${c.parent_slug})` : ''}</option>
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
              <Label>Slug</Label>
              <Input
                value={newCollection.slug}
                onChange={(e) => setNewCollection({ ...newCollection, slug: e.target.value })}
                placeholder="e.g. cherokee-agency"
                className="bg-brand-card border-brand-gold/[0.15]"
              />
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
              disabled={!newCollection.name || !newCollection.slug}
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
            Map your spreadsheet columns to database columns. {rowCount} rows detected.
          </p>

          <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl overflow-hidden">
            <div className="grid grid-cols-3 gap-4 px-4 py-3 border-b border-brand-gold/[0.08] text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
              <span>Spreadsheet Column</span>
              <span>Maps To</span>
              <span>Sample Value</span>
            </div>
            <div className="divide-y divide-brand-gold/[0.04]">
              {fileHeaders.map((header) => (
                <div key={header} className="grid grid-cols-3 gap-4 px-4 py-2.5 items-center">
                  <span className="text-sm text-brand-cream">{header}</span>
                  <select
                    value={columnMapping[header] || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                    className="px-2 py-1.5 bg-brand-bg border border-brand-gold/[0.08] rounded-lg text-xs text-brand-cream"
                  >
                    <option value="">— Skip —</option>
                    {(mode === 'existing' ? dbColumns : dbColumns).map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                    <option value="image_path">image_path</option>
                    <option value="ocr_text">ocr_text</option>
                    <option value="slug">slug</option>
                  </select>
                  <span className="text-xs text-brand-muted truncate">
                    {sampleRows[0] ? String(sampleRows[0][header] ?? '') : ''}
                  </span>
                </div>
              ))}
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

              {/* Auto-match button */}
              <div className="px-4 py-3 border-t border-brand-gold/[0.08]">
                <Button
                  onClick={autoMatchImages}
                  disabled={!imageColumn}
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
            Preview of {Math.min(5, sampleRows.length)} of {rowCount} rows to be imported.
          </p>

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
              <li>Records: <span className="text-brand-cream">{rowCount}</span></li>
              <li>Columns mapped: <span className="text-brand-cream">{Object.values(columnMapping).filter(Boolean).length}</span></li>
              <li>Target: <span className="text-brand-cream">{mode === 'existing' ? selectedCollection?.name : newCollection.name}</span></li>
              <li>Table: <span className="text-brand-cream font-mono">{mode === 'existing' ? selectedCollection?.table_name : newTableName}</span></li>
              {Object.keys(imageMapping).length > 0 && (
                <li>Images matched: <span className="text-brand-cream">{Object.keys(imageMapping).length}</span></li>
              )}
            </ul>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(hasImageColumn ? 'images' : 'mapping')} className="border-brand-gold/20 text-brand-cream rounded-xl">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              onClick={handleImport}
              className="bg-brand-gold text-brand-bg hover:bg-brand-gold-light rounded-xl"
            >
              <Upload className="w-4 h-4 mr-1.5" /> Import {rowCount} Records
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
      {step === 'done' && (
        <div className="bg-brand-card border border-brand-gold/[0.08] rounded-2xl p-10 text-center">
          {progress.errors.length === 0 ? (
            <CheckCircle className="w-12 h-12 text-brand-sage mx-auto mb-4" />
          ) : (
            <AlertCircle className="w-12 h-12 text-brand-gold mx-auto mb-4" />
          )}
          <h3 className="font-display text-lg font-semibold text-brand-cream mb-2">
            {progress.errors.length === 0 ? 'Import Complete' : 'Import Completed with Errors'}
          </h3>
          <p className="text-sm text-brand-muted mb-2">
            {progress.inserted} of {progress.total} records imported.
          </p>

          {progress.errors.length > 0 && (
            <div className="bg-brand-bg border border-red-500/20 rounded-xl p-4 mt-4 text-left max-h-40 overflow-y-auto">
              {progress.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-400 mb-1">{err}</p>
              ))}
            </div>
          )}

          <div className="flex gap-3 justify-center mt-6">
            <Button
              onClick={() => {
                setStep('mode');
                setFileHeaders([]);
                setAllRows([]);
                setSampleRows([]);
                setColumnMapping({});
                setImageMapping({});
                setSelectedSlug('');
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
      )}
    </div>
  );
}
