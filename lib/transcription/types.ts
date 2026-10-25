/**
 * Shapes shared by the transcription admin page and /api/admin/transcription.
 * Safe to import from client components.
 */

export interface TranscriptionJob {
  id: string;
  created_at: string;
  created_by: string | null;
  collection_slug: string;
  table_name: string;
  model: string;
  include_ocr: boolean;
  batch_id: string | null;
  status: 'submitting' | 'processing' | 'ingesting' | 'done' | 'failed' | 'canceled';
  /** Batch request i (custom_id "s<i>") transcribes image_keys[i]. */
  image_keys: string[];
  scan_count: number;
  succeeded: number;
  failed: number;
  estimated_cost: number | null;
  actual_cost: number | null;
  error: string | null;
  ended_at: string | null;
  ingested_at: string | null;
}

/** A job as the admin page receives it, without its scan keys. */
export type TranscriptionJobView = Omit<TranscriptionJob, 'image_keys'>;

export interface AiBudget {
  /** The monthly AI budget in USD. */
  budget: number;
  /** Logged spend this month. */
  spent: number;
  /** Estimates of batches still running, not yet logged. */
  committed: number;
  remaining: number;
}

export interface TranscriptionOverview {
  collections: { slug: string; name: string; parentName: string | null; transcribed: number }[];
  jobs: TranscriptionJobView[];
  /** The model batches use. */
  model: string;
  models: { id: string; label: string }[];
  /** Batch cost per scan for each model: measured from the pilot once there's enough of it. */
  perScan: Record<string, { usd: number; measured: boolean }>;
  budget: AiBudget;
}

export interface ScanCounts {
  total: number;
  transcribed: number;
  /** Scans where a record on the page already has OCR text. */
  withOcr: number;
  /** Untranscribed scans with no OCR text: what a batch does by default. */
  toDo: number;
  /** Every untranscribed scan, OCR'd or not. */
  toDoWithOcr: number;
  recordsWithoutScan: number;
}

export interface TrialRow {
  id: string;
  image_key: string;
  collection_slug: string | null;
  model: string;
  text: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  notes: string | null;
  error: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  created_at: string;
}
