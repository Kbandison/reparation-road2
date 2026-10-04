# Project Updates

Newest first. Each entry records when it happened (UTC), what changed, and what comes next.

## 2026-10-04T21:17Z: Folders can be created and moved into; AI descriptions run on Claude

Folders (collections that hold other collections as tabs) could only be made in the database: Create New Collection needs a spreadsheet, and nothing let an admin move a collection into a folder. An empty folder also looked exactly like an empty tab, so the import offered it as a target. Separately, "Generate with AI" ran on Fireworks' Llama 3.3; it now uses Claude Sonnet like the site assistant.

**Minor updates**
- `collections_folders_migration.sql` (run once by hand) allows `display_type = 'folder'`, marks the 16 existing folders, and marks the 7 empty state collections (TN, KY, MD, AL, PA, NY, Civilian) as folders since they'll get tabs.
- Import Records has a third option, **Create Folder**: name, slug, parent folder, category, era, region, access tier and descriptions (the fields every existing folder uses). Folders go live at once and can sit inside folders. After creating one, "Create a collection inside it" starts a new collection there.
- Create New Collection's parent picker lists only folders (a collection with its own records hides any tabs under it) and has "+ New folder…" to make one without leaving the form.
- Admin → Collections → Edit has an **Inside folder** picker. A collection or folder can't move into itself or anything inside it, and folder record totals re-sync after a move. The API enforces the same rules (`lib/collections/folders.ts`).
- Empty folders are never offered as import targets.
- AI descriptions (`lib/ai/descriptions.ts`) use `claude-sonnet-5` through the official Anthropic SDK with schema-checked output, billed to `ANTHROPIC_API_KEY`. Folders get a folder-specific prompt that includes the names of the collections inside. Fireworks is no longer used.
- New dependencies: `@anthropic-ai/sdk`, `zod` (zod's range matches `future-checklist`).

**Next actions**
- Run `collections_folders_migration.sql` in the Supabase SQL editor. Until then, creating a folder shows a message asking for it.
- Make sure `ANTHROPIC_API_KEY` is set in the Vercel project's production environment before deploying; `FIREWORKS_API_KEY` can be removed afterwards.
- The site assistant on `future-checklist` is pinned to `claude-sonnet-4-6`; move it to `claude-sonnet-5` when that branch merges.
- `npm audit` shows 8 high findings in dev-only tooling (the `shadcn` CLI's `fast-glob`/`ts-morph`); production dependencies have none.

## 2026-10-04T20:56Z: Import links scans automatically; Register of Guardian repaired

The first import through the new flow, "Free Colored Register of Guardian" (428 records), saved bare filenames like `L20047_1845_no.2-53_001` instead of links to the scans already in `register-of-guardian-sc`. The wizard only matched images after a click on Auto-Match Images, and imported anyway without it. The Upload Images version showed the folder already added, which made the step look finished.

**Minor updates**
- Matching now runs by itself on the image step, and again whenever the names, folders or uploads change. The image column is preselected. Logic lives in `lib/import/image-matching.ts`.
- Only exact matches link automatically. Names are compared without file extension, case or punctuation, and only real extensions are dropped (scan names contain dots). Near misses (one name containing the other, e.g. a missing `…_001` next to `…_001b`) are listed for the admin to confirm instead of being guessed.
- The Preview step lists any image names still without a file and won't import until the admin confirms importing them without images.
- Link to existing records uses the same comparison. It used to cut names at the last dot, so it couldn't repair names like these.
- TIFF scans get thumbnails in the storage manager (Supabase renders them as WebP).
- Data: linked all 427 unlinked Register of Guardian records to `register-of-guardian-sc/<file>` (294 distinct scans, all exact) and corrected its record count from 157 to 428. The row fixed by hand was left alone.
- Data: new tab "Agenoria" under Slave Merchant Trade for the one record tagged with that vessel (`collection_tag` normalized to `agenoria`, set up like John Brown & Co.). The parent's count is now 1,645.

**Next actions**
- About 430 back-of-page scans (`…b` files) in `register-of-guardian-sc` aren't linked to any record. Records hold one image each; left as is for now.

## 2026-10-04T20:01Z: "Coming Soon" collections are importable, Upload Images is a full storage manager

Twenty-eight collections (21 tabs, plus 7 empty state collections) had no table, so they showed "Coming Soon" and couldn't be filled: Import to Existing only listed collections with a table, and Create New refused their slugs. The Upload Images page's "Add folder" only changed the upload destination in the browser, so a folder vanished on refresh if nothing was uploaded into it. Both are fixed, along with a bug that made records imported into a shared-table tab invisible.

**Minor updates**
- Placeholder collections appear under Import to Existing, marked *Empty*. The wizard suggests where their records go: the table their sibling tabs share, with a tag (the 10 slave-merchant tabs go to `slave_merchants` with `collection_tag = aaron_lopez`, etc.; Alabama and Louisiana go to `slave_importation` with `state = alabama`/`louisiana`), or a table of their own (Native American agencies, NC/SC, the state collections). The new `link-collection` action points the collection at its table only if it still has none. The collections stay live.
- Imports into a tab that shares its table now write the tab's tag on every row. Before, rows went in without it and never showed in the tab unless the spreadsheet happened to carry a matching column.
- Record counts (and parents' totals) re-sync after every import.
- `create-table` accepts a file whose only columns are built-ins, and creates the table whenever it doesn't exist yet.
- Removed the orphaned duplicate tab `ms-persons-of-color-passports`: its parent didn't exist, and it showed the same 97 records as the live "Mississippi Passport & Slave Affidavits" tab. The records are untouched.
- Upload Images is now a file manager: buckets → folders → files with thumbnails, current folder kept in the URL. Create, rename and delete buckets (delete only), folders and files. Names get the bucket cleanup (lowercase-hyphen); file renames keep their name and extension.
- Renaming a file or folder moves every object and rewrites every collection record's `image_path` link (any of the three stored formats) to match, so no image breaks. Deletes show how many records link to what's going and need the name typed for folders, buckets and anything linked.
- `forum-media` and `family-tree-media` are view-only in the manager. Their bucket names now come from `lib/storage/names.ts`.
- New buckets are always public, and any file type can be uploaded. Uploads flag names already in the folder (Replace / Skip) instead of silently overwriting.
- "Attach to records" has two modes. *Add new records from a spreadsheet* runs the import wizard with the upload folder already in its image pool, so records and scans go in together. *Link to existing records* works as before.
- Storage actions moved out of `/api/admin/import` into `/api/admin/storage` (which existed but was unused).
- Verified: typecheck, production build, lint (same 11 pre-existing errors, none new). Reference finding and rewriting were checked read-only against live data (renaming `slave-importation/kentucky` would update all 273 Kentucky links). Bucket/folder/file create, list, rename, delete and the overwrite guard were run end to end in a throwaway bucket, since deleted. Logged-out requests to the storage API get 403.

**Next actions**
- Click through Upload Images and a placeholder import while logged in as an admin (not yet done in a browser).
- The import wizard's image step and the record editor's image picker still list folders with the older `list()` call, which may cap very large folders; switch them to the paged listing in `lib/storage/objects.ts`.
- Most of the 7 empty state collections will get tabs: create each tab with Create New Collection (parent = the state collection) rather than importing into the state collection itself.

## 2026-09-27T20:07Z: Security upgrades, npm audit down from 26 findings to 0

Next.js 16.1.6 carried about 30 advisories, including two critical remote-code-execution bugs (one in the image optimizer) and several middleware/proxy bypasses. That matters here because `middleware.ts` is what sends logged-out visitors away from `/admin` and `/dashboard`. `xlsx` 0.18.5 had a prototype-pollution bug and a ReDoS when reading crafted files. npm no longer carries fixed versions, because SheetJS now publishes only from its own CDN.

**Minor updates**
- Next.js and `eslint-config-next` 16.1.6 → 16.3.6, still pinned to exact versions. The 16.2 and 16.3 notes call for no app changes, and the app's own `error.tsx` and `not-found.tsx` mean 16.2's new default error page never shows.
- `xlsx` 0.18.5 → 0.20.3, installed with SheetJS's documented command from `cdn.sheetjs.com`. The lockfile pins its sha512 integrity hash.
- `npm audit fix` cleared the rest within existing version ranges. Resend went 6.9.3 → 6.30.0, which drops the vulnerable `svix`/`uuid` chain; `ws`, `sharp` and `postcss` are updated too. Resend 6.30 marks `audienceId` as deprecated in favour of "segments", but still sends those calls to the same `/audiences/{id}/contacts` endpoints, so the newsletter is unaffected.
- Verified: typecheck, production build, and lint (the same 22 pre-existing issues as before, none new). The import, download and email tests pass on the new versions. On a dev server, pages load, logged-out visitors are sent from `/admin` and `/dashboard` to `/login`, and the admin API refuses them.

**Next actions**
- `middleware.ts` is a deprecated file convention in Next 16. It still works. The official codemod (`npx @next/codemod@latest middleware-to-proxy .`) renames it to `proxy.ts`, which runs on Node.js instead of Edge. Do this as its own change and test the logins.
- Move the newsletter's Resend calls from `audienceId` to segments before a future Resend major drops the deprecated field.
- The 22 old lint problems (11 errors) never block a deploy, because `next build` doesn't lint, but they're worth a cleanup pass.

## 2026-09-27T19:36Z: Bot protection on the public forms, and the booking email relay closed

The client kept getting contact-form spam from bots: random-letter names, random-string messages, and Gmail addresses stuffed with dots. The contact route's only defense was a rate limit, which a bot sending a few messages a day never hits. The same route also emailed a "Your Research Session is Booked" message to any address a caller named, with the caller's text placed straight into the HTML, so anyone could send Reparation Road–branded mail with their own links to strangers.

**Minor updates**
- Vercel BotID now guards the contact form, bookings and newsletter signup. It's invisible to people and turns away scripts and automated browsers. It fails open (logged) if BotID can't run, and a person it misreads is pointed to info@ instead of being silently dropped.
- The contact and booking forms got a honeypot field; the newsletter already had one. Bots that fill it get a normal-looking reply, and nothing is sent or saved.
- Bookings are created by a new `/api/bookings` route. It checks the session, date and time against the real options and the free slots, and builds the confirmation from the saved booking. The booking branch of `/api/contact` is gone.
- Everything a visitor types is escaped before it goes into an email, including the signup notice and welcome emails. `escapeHtml` moved to `lib/html.ts`.
- The booking page now shows which slots are actually taken. Bookings RLS only lets people read their own rows, so every slot used to look open and double bookings were possible.
- Booking dates are saved as the day the visitor picked. `toISOString()` used to save the day before for anyone east of UTC.
- Booking emails show dates like "Monday, October 5, 2026". Replies to the confirmation reach info@ instead of noreply@, and Adam's notification includes the booker's notes and replies go to the booker.

**Verified in production:** a request with no browser proof gets 403 on the contact and booking routes, so BotID is active and the project's OIDC token works. A real browser signed up for the newsletter normally. `bookings_lockdown.sql` has been run.

**Next actions**
- Done: the Next.js and `xlsx` advisories were fixed in the security upgrade above.

## 2026-09-27T18:47Z: Import wizard types columns from every row and checks before writing

Importing "Register of Free Persons" failed on every batch (`invalid input syntax for type integer: "7months"`, then `"-"`), so nothing was imported. The wizard typed each column from only the first 20 rows, which made `age` and `date_when_entered_the_state` integer columns. Later rows held values like "7months" and "-", and one bad value failed its whole 500-row batch. The wizard now types columns from every row, checks the file against the real table before writing anything, and reports problems by spreadsheet row.

**Minor updates**
- New columns are typed from every row. A column is a whole number only if every value is a clean whole number (no leading zeros, fits `integer`); anything else stays text, exactly as written. Each new column's type can be changed on the Mapping step, which also says why a number-looking column stayed text.
- The Preview step checks every row against the target table's real column types and NOT NULL columns (read from PostgREST's OpenAPI description) before anything is written. Problems are listed with spreadsheet row numbers. A number or yes/no column can be converted to text in one click, without losing data, and the wizard warns when that column sets the collection's document order.
- New collections are created as Drafts and published only once every record has landed, so a failed import no longer leaves an empty collection live. The Done step offers "Publish now" for Drafts.
- If the database still rejects a batch, it is split until the exact rows are found. The good rows land, and the rejected rows are reported by spreadsheet row and reason.
- The Done step can download the rejected rows as an .xlsx: "Why it failed" and "Original row" come first, then the file's own columns unchanged. When that file is imported back, the wizard skips the two helper columns, and a second round keeps pointing "Original row" at the master spreadsheet. The spreadsheet library loads only on click.
- Slugs are unique across the whole table. Appending used to restart at `-0`, and record pages look records up by slug.
- Blank cells in NOT NULL columns that have a default (e.g. `ocr_text` on older tables) now take the default instead of failing.
- Smaller fixes: whitespace-only cells and rows count as blank; an "ID" header maps to `source_id` instead of the uuid primary key; image names Excel stored as numbers now match; a blank cell no longer overwrites a value from another header mapped to the same column; a new collection's slug is checked for clashes up front.
- Images step: the committed-folders panel (with Auto-Match) sits below the storage browser again, not inside its header row, and stays visible while no folder is open.

**Next actions**
- Done: the register was re-imported as "Register of Free Person" (`register_of_free_person`, 4,114 records, published automatically). `age` and `date_when_entered_the_state` are text, with values like "7months" and "-" kept as written.
- Optional: drop the empty leftover table from the failed run (`DROP TABLE public.register_of_free_persons;`, 0 rows, no collection uses it), and consider renaming the collection to the plural.
- There's no test runner yet. The import rules in `lib/import/` are pure functions, ready for unit tests when one is added.
