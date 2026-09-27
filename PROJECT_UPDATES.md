# Project Updates

Newest first. Each entry records when it happened (UTC), what changed, and what comes next.

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

**Next actions**
- After this deploys, run `bookings_lockdown.sql`. It stops direct inserts through the public API key and makes one booking per slot a database rule. Running it before the deploy breaks the old booking page.
- After the deploy, check BotID is actually on: a request with no browser proof should get a 403. If it gets a 400 instead, BotID is failing open, most likely because OIDC is off in the client's Vercel project settings.
- `npm audit` reports a critical advisory for the installed Next.js 16.1.6 and a high one for `xlsx` 0.18.5 (npm's copy is unmaintained). Both predate this change and are worth a separate upgrade.

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
- Recover "Register of Free Persons", which is live and empty. Either delete it in Admin → Collections (with "drop table") and re-import it as a new collection, or re-import into it as an existing collection and convert `age` and `date_when_entered_the_state` to text on the Preview step.
- There's no test runner yet. The import rules in `lib/import/` are pure functions, ready for unit tests when one is added.
