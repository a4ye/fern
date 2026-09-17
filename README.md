# Fern

Fern is a job application tracker. When you paste a posting link, the company, role,
location, and pay automatically fill themselves in. Applications are grouped into lists.

## Features

- **Link import.** Paste a posting URL and Fern reads the fields from it. Installing the browser extension improves the coverage.
- **Spreadsheet import.** Bring an existing CSV or XLSX file into Fern.
- **Charts.** Funnel, timeline, and Sankey views of where applications went.
- **Version history.** Every change can be undone, redone, or restored.

## Stack

Next.js, TypeScript, Tailwind CSS, PostgreSQL,
Better Auth, and Bun. Queries are written in SQL and generated with sqlc;
migrations run through dbmate.

## Getting started

[Bun](https://bun.sh) and a PostgreSQL database is required.

### 1. Install

```bash
git clone https://github.com/a4ye/fern.git
cd fern
bun install
cp .env.example .env
```

Put your settings in `.env`, not `.env.local`. The migration tool reads `.env`
only.

### 2. Set up the database

Any PostgreSQL database works. To use a local one:

```bash
createdb fern
```

```bash
POSTGRES_URL=postgres://localhost:5432/fern?sslmode=disable
```

### 3. Create a GitHub OAuth app

Sign-in uses GitHub OAuth. Go to **GitHub → Settings → Developer settings →
OAuth Apps → New OAuth App** and set:

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

Copy the client ID, generate a client secret, and put both in `.env`:

```bash
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

### 4. Generate an auth secret

```bash
openssl rand -base64 32
```

```bash
BETTER_AUTH_SECRET=<the generated value>
BETTER_AUTH_URL=http://localhost:3000
```

### 5. Get an exchange rate key

Get a free key from [ExchangeRate-API](https://www.exchangerate-api.com):

```bash
EXCHANGE_RATE_API_KEY=...
```

### 6. Run the migrations

```bash
bun run db:migrate
```

### 7. Start the dev server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with GitHub.

Both scripts use the first user in the database. Pass an email as the last
argument to pick a different one.

`bun run db:test-account` creates a throwaway account and prints a cookie you
can paste into the browser console to sign in as it. Use it when you want to
try account deletion without touching your own data.

### Optional: the rest of the settings

The remaining variables in `.env.example` are for optional features.

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_GENERATIVE_AI_API_KEY`, and `EMAIL_SYNC_APPROVED_EMAILS` turn on
  Gmail sync. Read the billing note in `.env.example` before using it with a
  real inbox.
- `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` turn on error reporting.
- `JOB_TRACKER_EXTENSION_APP_ORIGINS` lists the deployed URLs the browser
  extension may connect to. Development builds already accept `localhost`.

### Changing the database schema

Migrations live in `db/migrations` and queries in `db/queries`.

```bash
bun run db:new add_something     # create a migration file
bun run db:migrate               # apply it
bun run db:rollback              # undo the last one
```

If you edit a file in `db/queries`, regenerate the typed query code:

```bash
bun run db:generate
```

That step needs [sqlc](https://sqlc.dev) installed separately.

## Project structure

```
src/app/            Routes. page.tsx is the landing page, dashboard/ is the app
src/app/dashboard/  The *-actions.ts files are the server actions the UI calls
src/components/     UI, one folder per area: dashboard, landing, settings, login
src/db/             Database access. gen/ comes from sqlc and is not edited
src/lib/            Shared logic: link and sheet parsing, pay, dates, auth, email
src/proxy.ts        Next.js request proxy, formerly middleware.ts
db/migrations/      Schema migrations, applied by dbmate
db/queries/         SQL that sqlc compiles into src/db/gen
db/seed.ts          Sample data scripts
extension/          Browser extension source and its build script
scripts/            Generators for the city index, flag SVGs, and usage metrics
public/             Static files, including the built extension downloads
```

Tests sit next to what they test, as `*.test.ts`.

## Other scripts

The database and seed commands are covered above. The rest:

| Command                  | What it does                                    |
| ------------------------ | ----------------------------------------------- |
| `bun run dev`            | Start the dev server                            |
| `bun run build`          | Build the extension, then the app               |
| `bun run start`          | Serve the production build                      |
| `bun test`               | Run the tests                                   |
| `bun run lint`           | ESLint (`lint:fix` to fix)                      |
| `bun run format`         | Prettier (`format:check` to check only)         |
| `bun run metrics [days]` | Print how often imports and suggestions worked  |
| `bun run cities:build`   | Rebuild the city index from GeoNames            |
| `bun run flags:sync`     | Rebuild the flag SVGs after changing currencies |

## Browser extension

Some job sites block server-side fetching. The extension reads those postings
in your own browser and sends back only the parsed fields.

```bash
bun run extension:build
```

The unpacked builds land in `extension/dist/`. See
[`extension/README.md`](extension/README.md) for installing them.

## Data attribution

The city index is built from GeoNames data. See [`NOTICE.md`](NOTICE.md).

## License

Fern is licensed under the GNU Affero General Public License, version 3. The
full terms are in [`LICENSE`](LICENSE).
