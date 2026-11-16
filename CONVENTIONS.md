# Tracker frontend: conventions

Own ad tracker (Keitaro analogue) for a 100+ person media-buying team. Facebook traffic → PWA → tracker → prelander → casino offer.
Users: buyers, team leads, finance, admins. They live in tables all day: speed of reading numbers and changing a split matters most.

## Stack

React 19 + TS + Vite, Tailwind v4, shadcn/ui (preset radix-mira, compact), TanStack Query v5, TanStack Table v8,
react-router v8 (hash router), lucide-react icons (directly or via `@/components/icon`). Besides shadcn, only recharts (charts), sonner (toasts), cmdk (search), react-day-picker (calendar) and AG Grid Community (the report table only, `features/reports/ReportGrid.tsx`; every other table is DataTable).

## Design rules (strict, from the product owner)

- Minimal and strict. **No shadows, no animations, no gradients, no glass, no decorative cards.** Borders and spacing only.
- One accent: green `primary` #7dc171 (Keitaro green; also `success`, `ring`, `chart-1`); selection = `accent` (green-tinted graphite). Links `text-link` light blue. Status colors: `text-success`, `text-warning`, `text-destructive`. Everything else neutral.
- Type scale (16px root, owner 10/11): page title `text-xl` semibold → section / sheet / dialog title `text-base` (sections medium, panel titles semibold) →
  body `text-sm` (table cells, controls, forms, menus, nav) → table headers `text-[13px]` muted → hints, form labels' notes, footers, badges `text-xs` muted.
  KPI tiles: value `text-2xl` semibold, label and sub-line `text-xs`. Hints stay small on purpose: the hierarchy is what makes the main things stand out.
- Dense: tables at 13px with 32px rows (global rules at the end of `index.css`), totals row medium weight; controls h-8 (shadcn default size), `sm` h-7 only inside rows and popovers. Numbers right-aligned, `num` class (tabular).
- Dark only (Keitaro-like palette in `src/index.css`). Use only theme tokens (`bg-background`, `bg-card`, `bg-muted`, `border`,
  `text-muted-foreground`...), never raw colors. Font: system Helvetica Neue / Arial (UI), Menlo / Consolas (ids, urls); no webfonts.
- Reuse first: ready shadcn components / registries and lucide icons; never draw custom icons or hand-roll what a maintained component does.
- Tables: same column order and header names for the same metric everywhere (names from `METRICS` in `src/api/meta.ts`), numbers right,
  text left, header alignment = cell alignment.
- Works from 360px wide: toolbars wrap, tables scroll horizontally, side sheets go full width.
- Russian UI copy, short and concrete. Buttons name the action («Создать поток», «В архив»). Errors say what is wrong and how to fix.
- Keitaro is the functional reference: same sections, entities, fields, terms. Improve the UX, never drop a function.

## Structure

- `src/api/types.ts` domain model (field names = Keitaro API). `src/api/meta.ts` dictionaries (filters, actions, metrics, dimensions).
- `api` in `src/api/client.ts` = the API contract (sub-groups live in `client-*.ts` and are mounted on `api`). Pages call only `api.*`
  through TanStack Query, never `client-*` objects or `src/mock`. New endpoint: a function on `api`, one-endpoint-shaped; mock helpers in `api/mock-util.ts`.
  Backend handoff: [docs/backend.md](docs/backend.md); business rules: [docs/domain.md](docs/domain.md).
- `src/features/<section>/` one folder per section. Do not edit other sections' folders.
- Shared: `components/page.tsx` (Page, PageHeader, Toolbar, Section), `components/data-table.tsx` (DataTable),
  `components/common.tsx` (StateDot, SearchInput, StateFilter, metricColumns, metricSummary, ConfirmDialog, EntitySheet, FormRow,
  CopyButton, downloadCsv), `components/period-select.tsx`, `components/slicer.tsx` («Поле: все ▾» multi-pick), `components/columns-dialog.tsx` (log column settings: all fields by group + order), `app/state.tsx` (useAccess, useHiddenMetrics, usePeriod, useUrlParam).
- Reference implementation of a list section: `src/features/landings/LandingsPage.tsx`. Copy its structure.

## Patterns

- Filters, search, period, open sheet live in the URL (`useUrlParam`, `usePeriod`): every view is shareable by link.
- Create / edit = right side sheet (`EntitySheet`), deep-linked with `?edit=<id|new>`. Modal dialogs only for confirmations.
- Delete = «В архив» with `ConfirmDialog`; restore in Архив.
- Permissions: `useAccess(resource)`. No `canView` → section hidden (shell does it). No `canEdit` → hide create / bulk / delete,
  open sheets read-only. Hide metrics from `useHiddenMetrics()`.
- Rows passed to DataTable must be a new array when stats or lookups load (include them in the useMemo deps).
- Toasts (`sonner`) after successful mutations; invalidate the matching query keys.
- Query keys: `[entity]`, `[entity, id]`, `["stats", entity, range]`.
- Verify: `npx tsc -b` must pass. Screenshot check: `npx vite build && npx vite preview`.

## Quiet visuals (owner, 09/11)
- One line colour for every outline and divider: `border` / `border-input` (both = `--border`). No thicker or brighter lines anywhere; no `border-2` except the active nav underline.
- No divider under the navbar, under section titles, or inside sheet header/footer. Add a line only where it separates rows of data.
- No hover and no press effects anywhere (rows, links, buttons, tabs): nothing moves or changes colour under the cursor or on click. Keyboard highlight in menus and selects = `bg-muted`; keyboard focus ring stays.
- Tables look the same everywhere: header row on `bg-background` (no fill), muted header text, 1px row lines, totals row `bg-muted`.
- Selects open below the field (`position="popper"`), not over it.
- Style direction (owner): plain flat admin of the early 2010s (Bootstrap 3 / Keitaro era, forum-like): ordinary buttons and fields, 4px corners (`--radius: 0.25rem`, no big rounding, no pills except dots/switches), simple tables with thin lines, no decorative effects. Everything obvious at first glance.
- Exceptions to the single line colour: checkbox/radio outlines use `muted-foreground/50` (otherwise unchecked boxes vanish).
- Focus: text fields show only a 1px `border-ring` on focus (no glow); buttons keep the keyboard focus ring; dialogs/sheets don't autofocus a field on open.
- Phones (≤640px): inputs, selects and non-ghost buttons are 16px text / 36px high (index.css), so a toolbar row is uniform and iOS doesn't zoom.
- Toasts: top-right under the navbar, no shadow.

- Tables never pin the first column on phones: the whole table scrolls sideways. Inner vertical scroll areas only from `md` up.
- Top bar: graphite `--header` (#1a1c1d), a shade darker than the page, no bottom line; the current section is a green underline.
- Column widths (`components/column-resize.tsx`, desktop only): untouched table = automatic layout, the main text column (DataTable `growId`, report grouping column) takes the free width. A click on a divider changes nothing; the first real move freezes every column at its on-screen width (no jump) and only the dragged column follows the pointer while the main column gives / takes the space (at its 160px minimum the table scrolls). Dragging the main column fixes it and an empty last column takes the rest. No divider on the last column. Min = header label (numeric: also the widest value), max 640px, double click = fit to content, «Сбросить ширину колонок» = automatic again. Remembered per table (`trk.colw3.<key>`; report: per grouping).
- Metric sets (Основные / Воронка / Финансы, `METRIC_PRESETS`) are the same in «Колонки», the report «Метрики» popover and trends (`chart` = max 5).
- Filters on their default («Все …», Select value "all") are muted; a chosen filter is in the normal text colour (select.tsx, no call-site code).
- Spend: no BM / System User tokens in the tracker for now. Costs come from the team's own collector through `api.campaigns.updateCosts` (per ad / day) and by hand: campaign menu → «Обновить расходы».

Business rules (offers and caps, FB data, ad accounts, approaches, problems) are in [docs/domain.md](docs/domain.md); keep that file and the «Для IT» notes (`src/features/devnotes/notes.tsx`) in step with the code.
