# Project Updates

Newest first. Each entry records when it happened (UTC), what changed, and what comes next.

## 2026-09-27T18:47Z: Import wizard types columns from every row and checks before writing

Importing "Register of Free Persons" failed on every batch (`invalid input syntax for type integer: "7months"`, then `"-"`), so nothing was imported. The wizard typed each column from only the first 20 rows, which made `age` and `date_when_entered_the_state` integer columns. Later rows held values like "7months" and "-", and one bad value failed its whole 500-row batch. The wizard now types columns from every row, checks the file against the real table before writing anything, and reports problems by spreadsheet row.

**Minor updates**
- New columns are typed from every row. A column is a whole number only if every value is a clean whole number (no leading zeros, fits `integer`); anything else stays text, exactly as written. Each new column's type can be changed on the Mapping step, which also says why a number-looking column stayed text.
- The Preview step checks every row against the target table's real column types and NOT NULL columns (read from PostgREST's OpenAPI description) before anything is written. Problems are listed with spreadsheet row numbers. A number or yes/no column can be converted to text in one click, without losing data, and the wizard warns when that column sets the collection's document order.
- New collections are created as Drafts and published only once every record has landed, so a failed import no longer leaves an empty collection live. The Done step offers "Publish now" for Drafts.
- If the database still rejects a batch, it is split until the exact rows are found. The good rows land, and the rejected rows are reported by spreadsheet row and reason.
- Slugs are unique across the whole table. Appending used to restart at `-0`, and record pages look records up by slug.
- Blank cells in NOT NULL columns that have a default (e.g. `ocr_text` on older tables) now take the default instead of failing.
- Smaller fixes: whitespace-only cells and rows count as blank; an "ID" header maps to `source_id` instead of the uuid primary key; image names Excel stored as numbers now match; a blank cell no longer overwrites a value from another header mapped to the same column; a new collection's slug is checked for clashes up front.
- Images step: the committed-folders panel (with Auto-Match) sits below the storage browser again, not inside its header row, and stays visible while no folder is open.

**Next actions**
- Recover "Register of Free Persons", which is live and empty. Either delete it in Admin → Collections (with "drop table") and re-import it as a new collection, or re-import into it as an existing collection and convert `age` and `date_when_entered_the_state` to text on the Preview step.
- Consider a "Download failed rows" button on the Done step so rejected rows can be fixed and re-imported without copying them by hand.
- There's no test runner yet. The import rules in `lib/import/` are pure functions, ready for unit tests when one is added.
