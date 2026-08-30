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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Browser importer

The optional Chrome/Firefox importer reads public job postings from the user's
browser and shares its field parser with the server fallback. Build unpacked
extensions with:

```bash
bun run extension:build
```

See [`extension/README.md`](extension/README.md) for local installation,
production-origin configuration, and store-release settings. Deploy the latest
database migrations before enabling the supported-ATS fallback; they provide
the shared import cache and distributed provider rate budgets.

## Version history storage

Version history stays entirely in PostgreSQL. Recent user actions are stored as
one sparse row per action, including bulk edits and imports. Older rows move
into lossless gzip-compressed `bytea` chunks while the newest 100 actions per
list remain directly queryable.

Recent actions can be undone and redone repeatedly. Ordinary edits reuse their
sparse before/after patch in both directions. An undo that removes applications
or status events keeps the deleted snapshots inside that undo row, so redo is
possible without making every normal history action larger.

Every entry is also a restorable version of the whole list. The restore path
starts with the current list and reverses the later lossless actions, including
actions inside compressed archives. It writes one compact before/after delta
for the restoration itself, which makes the restore undoable and redoable
without storing a full list snapshot for every action. New imports retain only
compact company and role summaries for their history details. Full application
rows are stored only when a delete or an actual undo needs them.

Archiving is self-maintaining and needs no cron job. A small fraction of normal
history writes checks for one eligible chunk after the user's edit commits.
Each pass archives up to 500 actions older than 90 days, and row locks make
concurrent passes safe. Apply database migrations before deploying code that
writes history.
