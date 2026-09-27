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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
