# Design System & Requirements

---

## 1. Design principles

- **Quiet and uncluttered.** Every element earns its place. Empty areas are layout problems, not reasons for filler.
- **Calm, editorial minimalism.** Generous whitespace, restrained color, clear typographic hierarchy. Considered, not busy.
- **Purposeful additions only.** Add sections, copy, or controls intentionally, never to fill space.

---

## 2. Color

One muted sage accent on a warm cream neutral base. No pure black/white.

| Role              | Value                      | Use                                         |
| ----------------- | -------------------------- | ------------------------------------------- |
| Background        | `#fcf8ee`                  | Panels, tables, nav, cards                  |
| Surface / sidebar | `#f8f3e6`                  | Page canvas behind panels, row hover, wells |
| Accent tint       | `#e8ecdd` / `#f1f5e7`      | Active nav, stage plates, selected states   |
| Hairline          | `#e7e0d2`                  | Borders, dividers                           |
| Faint line        | `#f1ece2`                  | Row dividers                                |
| Text              | `#2c2f28`                  | Primary text, and dark landing bands        |
| Muted text        | `#a19a89`                  | Labels, secondary                           |
| Sub text          | `#837c6f`                  | Tertiary                                    |
| **Accent**        | `#6f7d5f` (deep `#5a6650`) | Primary actions, identity, active stage     |
| Gold              | `#8a6f3f`                  | "Offer" stage only                          |
| Muted rose        | `#b0908c`                  | "Rejected" / "Withdrawn" stages only        |

- Two levels, always. The page canvas is `surface`; panels, tables and nav sit on `background` above it. Never paint the canvas and the panels the same colour, or the page reads as one undifferentiated block.
- Every light neutral is warm: red channel highest, blue lowest. A grey or green-grey neutral makes the whole UI read as flat and clinical.
- `ink` is the exception and stays sage. It fills entire bands on the landing page, and at that size a warm dark reads as brown, not as near-black.
- Every accent-family tint stays sage: green channel highest. Light neutrals and accents therefore fall on opposite sides of neutral, and that temperature contrast is what makes the palette read as coloured.
- Large areas are never green. Full-width bands and page canvases use the cream ramp (`background` and `surface`); green is reserved for small elements that mean something, such as stage plates, active nav, selected rows and primary buttons. A pale green cannot look rich spread across a band on a cream ground, so it reads as cheap and washed out.
- The sage tints are settled. Do not retune them. They sit at hue 76 to 77 degrees with chroma near 15 and red about 11 above blue. At this hue warmth and chroma move together, so a tint cannot be made both warmer and more muted; pushing warmth past about 13 requires chroma the eye reads as loud, and dropping chroma below about 12 makes it read as blue against the cream. They work on a small plate and fail on a large fill: spread across a band, the eye adapts to the warm ground and reads them as blue, and every attempt to fix that by adding chroma or shifting hue toward 83 degrees made them look cheap or dirty instead. The fix is to keep them small, not to change them.
- Every badge that carries the sage tint uses the same fill. Changing one plate to a neutral fill and leaving the others green makes the badge set look inconsistent.
- Chroma stays low everywhere. Reach for the warm/cool axis before reaching for saturation.
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

- **Square corners by default.** The vast majority of the UI is square, including avatar/monogram tiles; rounding is allowed only in rare cases that clearly justify it.
- **Crisp 3px sage top edge** on primary surfaces for identity.
- Monogram tiles: background fill, 1px `#dcd3c1` border, sage letter, not filled blocks.
- Lay out with flex/grid + `gap`; prefer flat lists and tables with hairline dividers over boxed cards.

---

## 6. Things to AVOID (explicit)

- ❌ Pure black-and-white; must carry some thoughtful color.
- ❌ Rounded corners as a default; reserve rounding for rare, justified exceptions.
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
