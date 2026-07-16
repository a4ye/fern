# Design System & Requirements

---

## 1. Design principles

- **Quiet and uncluttered.** Every element earns its place. Empty areas are layout problems, not reasons for filler.
- **Calm, editorial minimalism.** Generous whitespace, restrained color, clear typographic hierarchy. Considered, not busy.
- **Purposeful additions only.** Add sections, copy, or controls intentionally, never to fill space.

---

## 2. Color

One muted sage accent on a warm off-white neutral base. No pure black/white.

| Role | Value | Use |
|------|-------|-----|
| Background | `#fbfbf9` | App canvas |
| Surface / sidebar | `#f4f5f0` | Sidebar, panels, wells |
| Accent tint | `#e6e9df` / `#f0f2ea` | Active nav, assistant blocks, selected states |
| Hairline | `#e6e7e0` | Borders, dividers |
| Faint line | `#eeeee8` | Row dividers |
| Text | `#2c2f28` | Primary text |
| Muted text | `#9aa08f` / `#a3a599` | Labels, secondary |
| Sub text | `#7c8274` | Tertiary |
| **Accent** | `#6f7d5f` (deep `#5a6650`) | Primary actions, identity, active stage |
| Gold | `#8a6f3f` | "Offer" stage only |
| Muted rose | `#b0908c` | "Rejected" / "Withdrawn" stages only |

- Accent used sparingly: primary buttons, top identity edge, active states, current stage.
- Stage colors: early stages muted, mid stages sage, offer gold, closed rose.

---

## 3. Typography

- **Single UI typeface: Be Vietnam Pro** (400/500/600) for everything, including numbers and stats.
- Display headings: weight 600.
- Micro-labels: ~10–11px, muted, weight 500 (normal case preferred).
- Minimum readable sizes; no text below ~10px.

---

## 4. Shape, spacing, layout

- **No rounded corners.** All corners square, including avatar/monogram tiles.
- **Crisp 3px sage top edge** on primary surfaces for identity.
- Monogram tiles: white fill, 1px `#d9ded0` border, sage letter, not filled blocks.
- Lay out with flex/grid + `gap`; prefer flat lists and tables with hairline dividers over boxed cards.
---

## 6. Things to AVOID (explicit)

- ❌ Pure black-and-white; must carry some thoughtful color.
- ❌ Rounded corners of any kind.
- ❌ Brutalist and terminal aesthetics.
- ❌ Left/side accent borders on cards.
- ❌ Decorative status dots. A colored dot is only for a real operational signal (e.g. "synced"), not for stage/status.
- ❌ Excessive card usage. Use lists, tables, or dividers instead.
- ❌ Emojis.
- ❌ Em dashes (—) in UI copy.
- ❌ Separator middle-dots (·) in body/content text.
- ❌ Random italics.
- ❌ Excessive uppercase / monospace text; no uppercase-mono label spam.
- ❌ Fonts: Inter, Instrument Serif. One UI typeface only (Be Vietnam Pro); do not mix a second font for numbers.
- ❌ Fabricated fixed-length progress tracks for stages (stage counts vary by company).
- ❌ Clutter and filler generally; don't add content without a clear purpose.

---