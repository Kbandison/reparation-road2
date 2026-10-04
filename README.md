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

- **Column types:** a new column is a whole number only if every value in the file is one; otherwise it's text, kept exactly as transcribed ("7months", "-", "abt 30"). You can change a new column's type on the Mapping step.
- **Checked before writing:** the Preview step compares every row with the table's real column types (read from PostgREST's OpenAPI description with the service key) and flags mismatches and blank required cells by spreadsheet row. An existing number or yes/no column can be converted to text there.
- **Drafts:** a new collection stays a Draft until every record is in, then publishes itself.
- **Partial failures:** if the database rejects some rows anyway, the rest are saved and the rejected rows are listed by spreadsheet row. **Download rows to fix** gives you just those rows with the reason beside each. Correct them and import that file into the same collection; the wizard skips the two helper columns. Re-importing the whole file would duplicate the rows already saved.
- **"Coming Soon" collections:** a collection with no table and no tabs shows up under Import to Existing marked *Empty*. Pick where its records go: the table its sibling tabs share (each row tagged, e.g. `collection_tag = aaron_lopez`) or a table of its own. The import connects the collection to that table (`link-collection`) and it shows its records straight away (`lib/import/placeholders.ts`).
- **Tab tags:** tabs that share a table are told apart by a tag column (`discriminator_column`/`discriminator_value`). Every import into such a tab writes the tag on every row; a file column feeding the tag column is replaced by it.
- **Record counts** are re-synced after every import, parents included.
- **Image matching** (`lib/import/image-matching.ts`) runs on its own on the image step. Only exact name matches link (extension, case and punctuation ignored); near misses wait for confirmation, and Preview won't import names without a file until you confirm.

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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
