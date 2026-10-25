This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Importing records (Admin → Import)

The import wizard loads an `.xlsx` into a new or existing collection. The rules live in `lib/import/`.

- **Any size of file:** the spreadsheet is read in the browser, in a Web Worker (`lib/import/read-spreadsheet.ts`), and the rows go to the server in chunks of up to 5,000 rows or 3 MB (`lib/import/chunks.ts`). Vercel refuses any request or response over 4.5 MB, which used to stop files past roughly 17,000 rows. Every chunk is checked before any is written, then they're saved one after another with a progress bar. Keep the tab open until it finishes.
- **If a chunk fails partway** (a dropped connection, a timeout), the wizard counts the table's rows to see whether it landed. A chunk that fully landed is counted, one where nothing landed is retried once, and anything else stops the import. The rows that didn't go in end up in **Download rows to fix**, so only those need importing again.
- **Column types:** a new column is a whole number only if every value in the file is one; otherwise it's text, kept exactly as transcribed ("7months", "-", "abt 30"). You can change a new column's type on the Mapping step.
- **Checked before writing:** the Preview step compares every row with the table's real column types (read from PostgREST's OpenAPI description with the service key) and flags mismatches and blank required cells by spreadsheet row. An existing number or yes/no column can be converted to text there.
- **Drafts:** a new collection stays a Draft until every record is in, then publishes itself.
- **Partial failures:** if the database rejects some rows anyway, the rest are saved and the rejected rows are listed by spreadsheet row. **Download rows to fix** gives you just those rows with the reason beside each. Correct them and import that file into the same collection; the wizard skips the two helper columns. Re-importing the whole file would duplicate the rows already saved.
- **"Coming Soon" collections:** a collection with no table and no tabs shows up under Import to Existing marked *Empty*. Pick where its records go: the table its sibling tabs share (each row tagged, e.g. `collection_tag = aaron_lopez`) or a table of its own. The import connects the collection to that table (`link-collection`) and it shows its records straight away (`lib/import/placeholders.ts`).
- **Tab tags:** tabs that share a table are told apart by a tag column (`discriminator_column`/`discriminator_value`). Every import into such a tab writes the tag on every row; a file column feeding the tag column is replaced by it.
- **Record counts** are re-synced after every import, parents included.
- **Image matching** (`lib/import/image-matching.ts`) runs on its own on the image step. Only exact name matches link (extension, case and punctuation ignored); near misses wait for confirmation, and Preview won't import names without a file until you confirm.

## Folders and AI descriptions

- **Folders** are collections that hold other collections as tabs, never records (`display_type = 'folder'`, needs `collections_folders_migration.sql`). Create them from Import Records → Create Folder, or "+ New folder…" in Create New Collection's parent picker. Move collections between folders from Admin → Collections → Edit. Rules live in `lib/collections/folders.ts`.
- **Generate with AI** writes short and long descriptions with Claude Sonnet (`lib/ai/descriptions.ts`, official Anthropic SDK, needs `ANTHROPIC_API_KEY`).

## AI features (branch `ai-features`, not live yet)

Every Claude call goes through the official Anthropic SDK (`lib/ai/`), is logged with its tokens and cost in `ai_usage`, and counts toward one monthly AI budget. Needs `ai_features_migration.sql` (run 2026-10-25) and `ANTHROPIC_API_KEY`. Prices live in `lib/ai/models.ts`.

- **Caps and budget** (`lib/ai/limits.ts`, Admin → AI Usage): free accounts get 10 assistant questions a day and 50 a month, members and donors 40 and 400, admins no cap. The assistant pauses for everyone but admins once the month's AI spend reaches $450, and admin tools stop at the $500 budget. All five numbers are editable on the AI Usage page (`app_settings.ai_limits`). A question claims its slot atomically (`ai_reserve_assistant_message`), so two sent together can't both slip under a cap. A question that fails before answering never counts against the user, though anything it spent counts toward the budget.
- **Research assistant** (bubble on every signed-in page, full view at `/assistant`; `lib/assistant/`): Claude Sonnet 5 with tools for searching the archive, collections, records, related records, bookmarks and recent activity. Tools read with the service key and apply the paywall themselves: members-only matches reach a free account as counts only, and related records in locked collections hide their names. Answers stream as JSON lines from `/api/assistant/chat`; each saved answer keeps its exact API turns so later questions replay real history. The standing instructions are prompt-cached, so a typical question costs about 1¢.
- **Scan transcription** (Admin → Transcriptions; `lib/transcription/`): Claude reads each scanned page from Supabase's resize endpoint at 2576px and writes it out word for word. One transcript per page (`scan_transcriptions`, keyed `bucket/path`), shown under the scan in the record viewer as an AI transcription; admins can correct it in place (Claude's original stays in `ai_text`). A pilot runs the same pages through Sonnet 5 and Opus 5.5 so the batch model can be chosen. Collections are transcribed through the Batch API at half price; a run is refused if it would pass the month's budget, and batches still running hold their estimate against it. Pages whose records already have OCR text are skipped unless "Also redo" is ticked. Search finds names in transcripts and shows them as "On scanned pages" hits, one per page, only where the viewer can open the collection.
- **Import suggestions** (`lib/ai/mapping.ts`): when a file is read, Claude checks the column matches in the background; differences show under each column with Accept and Apply all, never applied on their own. New collections also get suggested table and search columns on the Preview step.

## Storage (Admin → Upload Images)

A file manager over Supabase Storage (`components/admin/storage-*`, `lib/storage/`, `/api/admin/storage`).

- **Buckets, folders, files:** create, rename and delete from the page. Bucket and folder names are cleaned to lowercase letters, numbers and hyphens; file renames keep the name as typed (spreadsheets match scans by filename) and keep the extension. New buckets are always public, since record pages link to files by their public URL. Folders are real: an empty folder is kept with Supabase's hidden `.emptyFolderPlaceholder` file, and a folder emptied by deletes gets one back.
- **Renames keep record links working.** Storage has no rename, so every object moves to its new key (in batches of 50 the browser drives), then every collection record linking to a moved file is rewritten in the same shape it had (`bucket/path`, raw URL, or percent-encoded URL). Links are found in each collection table's `image_path` and in `collections.thumbnail_url`. Files that fail to move keep their old links; the dialog offers a retry.
- **Deletes warn first:** the dialog lists how many records, in which collections, link to what's being deleted, and asks for the name to be typed for folders, buckets and anything linked.
- **Locked buckets:** `forum-media` and `family-tree-media` are view-only here, because the forum and family tree link to their files by name.
- **Uploads** go straight into the open folder through signed URLs (no size limit). Names already in the folder are flagged with Replace / Skip instead of being overwritten. Dropping files onto the open folder uploads them at once.
- **Attach to records:** *Add new records from a spreadsheet* runs the import wizard with the upload folder already in its image pool (new uploads join it as they land); *Link to existing records* writes uploaded files' paths onto records whose chosen column matches the filename.

## Public forms and bot protection

The contact form, booking and newsletter signup are public, so each one is guarded in layers:

- **Vercel BotID** (`lib/bot-protection.ts`), invisible to people. A route only works if it's listed in `instrumentation-client.ts` *and* calls `isAutomatedRequest()`; keep the two in step. In production it needs the project's Vercel OIDC token, and without one it fails open and logs `[bot-protection] … BotID check failed`.
- **A honeypot field** (`website`) that people never see. Anything submitted with it filled gets a normal-looking reply and is dropped.
- **Rate limits** in Postgres (`lib/rate-limit.ts`).

Bookings are created only through `/api/bookings` (see `bookings_lockdown.sql`), never straight from the browser. Anything a visitor types is escaped with `lib/html.ts` before it goes into an email.

## Family tree name matching

Old records spell one person several ways, so the tree search, the "Save to family tree" picker and archive suggestions all allow for variants (`lib/names/`):

- **Similar spelling:** same Soundex code and spelled within a letter or two (Pinkard/Pinckard, Elijah/Eilja), or one letter added, dropped or swapped (Johnson/Johnston).
- **Nickname:** period nicknames and clerks' abbreviations (`lib/names/nicknames.ts`: Wm, Jno, Thos, Polly, Patsy…). Add a line there to teach it a new group.

Exact matches always rank first, and variants are labeled. Archive suggestions find variant candidates with the Postgres function in `family_tree_name_variants.sql`, then score them in `lib/family-tree/variant-matching.ts`. Without that function, suggestions are exact-only.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
