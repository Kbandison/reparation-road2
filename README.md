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
- **Add a column to existing records** (fourth option on the first step; `components/admin/import-add-column.tsx`, `lib/import/add-column.ts`, `/api/admin/record-columns`): fills a new or existing text column, such as each record's image link, on records already in a collection. Rows are matched to records on one to three columns (case and extra spaces ignored). Before anything is written it lists unmatched rows, rows that fit more than one record, and rows that give one record two different values. Values are written by record id, only to that collection's rows.
- **Blurred images on import:** a new collection can be set to blur its images (Collection step), with a link for every record and a per-record link column (Preview step). The blur runs in the browser right after the records are saved, and the collection publishes only once every image is blurred. Imports into a collection that's already blurred blur their new images the same way.

## Folders and AI descriptions

- **Deleting a collection** keeps its data table unless "Also delete the data table" is ticked (several collections can share a table). A kept table holds on to its name: importing a new collection with the same slug finds it, and the wizard offers **Replace the leftover table** (type its name to confirm). **Admin → Collections → Unused tables** (`lib/collections/unused-tables.ts`, `/api/admin/tables`) lists every records table no collection uses, with a peek at its rows and a remove that re-checks it's unused and never cascades into anything that depends on it.
- **Folders** are collections that hold other collections as tabs, never records (`display_type = 'folder'`, needs `collections_folders_migration.sql`). Create them from Import Records → Create Folder, or "+ New folder…" in Create New Collection's parent picker. Move collections between folders from Admin → Collections → Edit. Rules live in `lib/collections/folders.ts`.
- **Generate with AI** writes short and long descriptions with Claude Sonnet (`lib/ai/descriptions.ts`, official Anthropic SDK, needs `ANTHROPIC_API_KEY`).

## Citations and sources

- **Collection level:** Admin → Collections → Edit has a Citation & Source section. The citation format is a template with placeholders (`{{record_title}}`, `{{url}}`, …) and a live preview; the source is the archival provenance. Needs `collection_citation_template.sql`.
- **Folders cover their tabs:** a tab that leaves either field blank uses its folder's, then that folder's folder. The two fall back independently, and `{{collection_name}}` is always the record's own tab.
- **Record level:** a record's edit window can override either field for that record alone (`record_citations`, from `reparation_road_record_citations.sql`).
- **Where it shows:** under "Cite this Record" on every record (the collection page itself doesn't show it). The rules live in `lib/collections/citation.ts`.

## Blurred images (rights and licensing)

Some collections can't show their scans in full. Admin → Collections → Edit → **Blurred images** handles it (`lib/collections/blur.ts`; needs `image_blur_migration.sql`).

- **Blurring** runs in the admin's browser (`lib/images/blur-scan.ts`): each scan is shrunk to 200 pixels on its long side, which removes the detail for good (the shape of the lines stays, no letter does), then softened and scaled back up. A PDF comes out as a blurred PDF, rendered with PDF.js, whose worker and decoders `scripts/copy-pdfjs-assets.mjs` copies into `public/pdfjs/` before every dev start and build.
- **Storage:** copies go to the public `blurred-images` bucket. Every link to the scan, in any collection and in cover images, is pointed at the copy (the same link rewriting the storage manager uses). The original moves to the private `restricted-images` bucket. `blurred_scans` records each one, so **Restore the originals** puts everything back. The Upload Images page shows both buckets read-only.
- **Everywhere:** because the links themselves change, every page shows the copy. A scan in a blurred collection that hasn't been processed yet shows "Image being prepared", never the original (`scanState`).
- **Links:** a blurred image opens the original at its source. A record's own link (the collection's link column) wins over the collection-wide link. Hovering shows "View the original image" (always visible on touch screens). Without a link, an image keeps its usual zoom and a PDF keeps "Open in new tab".

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
