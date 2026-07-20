@AGENTS.md

# Project Context

## Stack

- **Runtime / package manager**: Bun (`bun install`, `bun run <script>`) — no npm, no yarn
- **Framework**: Next.js 16 App Router
- **Language**: TypeScript 5 (strict mode)
- **Styling**: Tailwind CSS 4
- **React**: 19.2

## Scripts

```
bun run dev          # start dev server (Turbopack)
bun run build        # production build (Turbopack)
bun run start        # serve production build
bun run lint         # eslint
bun run lint:fix     # eslint --fix
bun run format       # prettier --write .
bun run format:check # prettier --check .
```

## Code Style

Enforced by Prettier + ESLint. Key settings:

- Double quotes
- 4-space indentation
- Semicolons
- Trailing commas
- 80-char print width
- `@typescript-eslint/no-explicit-any` is an error — avoid `any`
- `no-console` is a warning — use structured logging or remove before committing

## UI & Design

- Follow `DESIGN.md` for all UI. Design tokens are Tailwind theme values in `src/app/globals.css` (`bg-background`, `bg-surface`, `text-ink`, `text-sub`, `text-muted`, `border-hairline`, `border-faint`, `bg-accent`, `accent-tint`, `gold`, `rose`, `tile-border`)
- Default to square corners; `rounded-*` is available but reserved for the rare case that justifies it
- Prefer built-in Tailwind scale values over arbitrary ones: `text-xs` not `text-[11px]`, `h-0.75` not `h-[3px]`
- Icons: Iconify Tailwind plugin, e.g. `icon-[simple-icons--github]`. Add sets with `bun add -d @iconify-json/<set>`
- Brand marks (`Logo`, `CARET_PATH`, `SLASH_PATH`) live in `src/components/brand/logo.tsx`; favicon is `src/app/icon.svg`

## Component Conventions

- Arrow-function components only. Pages/layouts: `export default X;` on the line directly after the definition; never anonymous default exports
- Extract to `src/components/<area>/` (e.g. `brand/`, `login/`) only when reused or bulky/static (SVG art); keep small single-use elements (a lone button) inline in the page
- Verify UI changes in a real browser. A dev server is usually already running at `localhost:3000` — check before starting another (`bun run dev` will fail on the port)

## Git

- Never run `git commit` or `git push` — the repo owner always commits their own work

## Next.js 16 — Key Differences from Prior Versions

Read `node_modules/next/dist/docs/` before writing code. The most impactful changes:

### `middleware` → `proxy`

The `middleware.ts` convention is deprecated. The file is now `proxy.ts` and the export is `proxy`:

```ts
// proxy.ts
export function proxy(request: Request) { ... }
```

`skipMiddlewareUrlNormalize` is now `skipProxyUrlNormalize` in `next.config.ts`. The `edge` runtime is NOT supported in `proxy` — it runs Node.js only. To keep using the edge runtime, keep using `middleware.ts`.

### Async Request APIs — synchronous access removed

`params`, `searchParams`, `cookies()`, `headers()`, and `draftMode()` are async-only. The v15 synchronous compatibility shim is gone.

```ts
// Page component
export default async function Page({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
}
```

Run `bunx next typegen` to generate `PageProps` / `LayoutProps` type helpers automatically.

### Linting: `next lint` removed

`next lint` is gone. Use ESLint directly (`bun run lint`). `next build` no longer runs linting automatically.

### Turbopack is default

Both `next dev` and `next build` use Turbopack by default — no flag needed. Custom `webpack` config in `next.config.ts` will cause `next build` to fail. Opt out with `--webpack` flag if needed.

`turbopack` config moves from `experimental.turbopack` to top-level:

```ts
const nextConfig: NextConfig = {
    turbopack: {/* options */},
};
```

### Caching APIs

- `cacheLife` / `cacheTag`: `unstable_` prefix removed — use bare names
- `revalidateTag` now requires a second `cacheLife` profile argument

### React Compiler

Built-in support is stable but **not enabled by default**. Enable in `next.config.ts`:

```ts
const nextConfig: NextConfig = {
    reactCompiler: true,
};
```
