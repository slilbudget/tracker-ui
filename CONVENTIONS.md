# Tracker frontend: conventions

Own ad tracker (Keitaro analogue) for a 100+ person media-buying team. Facebook traffic → PWA → tracker → prelander → casino offer.
Users: buyers, team leads, finance, admins. They live in tables all day: speed of reading numbers and changing a split matters most.

## Stack

React 19 + TS + Vite, Tailwind v4, shadcn/ui (preset radix-mira, compact), TanStack Query v5, TanStack Table v8,
react-router v8 (hash router), lucide-react icons (directly or via `@/components/icon`). Besides shadcn, only recharts (charts), sonner (toasts), cmdk (search) and react-day-picker (calendar).

## Design rules (strict, from the product owner)

- Minimal and strict. **No shadows, no animations, no gradients, no glass, no decorative cards.** Borders and spacing only.
- One accent: green `primary` #7dc171 (Keitaro green; also `success`, `ring`, `chart-1`); selection = `accent` (green-tinted graphite). Links `text-link` light blue. Status colors: `text-success`, `text-warning`, `text-destructive`. Everything else neutral.
- Type scale (16px root, owner 10/11): page title `text-xl` semibold → section / sheet / dialog title `text-base` (sections medium, panel titles semibold) →
  body `text-sm` (table cells, controls, forms, menus, nav) → table headers `text-[13px]` muted → hints, form labels' notes, footers, badges `text-xs` muted.
  KPI tiles: value `text-2xl` semibold, label and sub-line `text-xs`. Hints stay small on purpose: the hierarchy is what makes the main things stand out.
- Dense: tables at `text-sm`, row height h-9, totals row medium weight; controls h-8 (shadcn default size), `sm` h-7 only inside rows and popovers. Numbers right-aligned, `num` class (tabular).
- Dark only (Keitaro-like palette in `src/index.css`). Use only theme tokens (`bg-background`, `bg-card`, `bg-muted`, `border`,
  `text-muted-foreground`...), never raw colors. Font: Inter (UI), JetBrains Mono (ids, urls).
- Reuse first: ready shadcn components / registries and lucide icons; never draw custom icons or hand-roll what a maintained component does.
- Tables: same column order and header names for the same metric everywhere (names from `METRICS` in `src/api/meta.ts`), numbers right,
  text left, header alignment = cell alignment.
- Works from 360px wide: toolbars wrap, tables scroll horizontally, side sheets go full width.
- Russian UI copy, short and concrete. Buttons name the action («Создать поток», «В архив»). Errors say what is wrong and how to fix.
- Keitaro is the functional reference (`../refs/keitaro/*.png`, `../.notes/research-keitaro-ui.md`): same sections, entities, fields, terms.
  Improve the UX, never drop a function.

## Structure

- `src/api/types.ts` domain model (field names = Keitaro API). `src/api/meta.ts` dictionaries (filters, actions, metrics, dimensions).
- `src/api/client.ts` = the API contract. Pages call only `api.*` through TanStack Query. Need a new endpoint? Add a function to
  `client.ts` (mock body over `src/mock/seed.ts`), keep it one-endpoint-shaped.
- `src/features/<section>/` one folder per section. Do not edit other sections' folders.
- Shared: `components/page.tsx` (Page, PageHeader, Toolbar, Section), `components/data-table.tsx` (DataTable),
  `components/common.tsx` (StateDot, SearchInput, StateFilter, metricColumns, metricSummary, ConfirmDialog, EntitySheet, FormRow,
  CopyButton, downloadCsv), `components/period-select.tsx`, `app/state.tsx` (useAccess, useHiddenMetrics, usePeriod, useUrlParam).
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
- Column widths: drag the divider at the right edge of a header (desktop only, `components/column-resize.tsx`). First drag fixes all widths (table-layout fixed), only the dragged column changes; empty last column takes free space. Min = header label (numeric columns: also the widest value, digits are never cut), max 640px, double click = fit to content, «Сбросить ширину колонок» resets. Remembered per table (`trk.colw2.<key>`; report: per grouping).
- Metric sets (Основные / Воронка / Финансы, `METRIC_PRESETS`) are the same in «Колонки», the report «Метрики» popover and trends (`chart` = max 5).
- Filters on their default («Все …», Select value "all") are muted; a chosen filter is in the normal text colour (select.tsx, no call-site code).
- Spend: no BM / System User tokens in the tracker for now. Costs come from the team's own collector through `api.campaigns.updateCosts` (per ad / day) and by hand: campaign menu → «Обновить расходы».

## Offers, caps, reference campaigns (10/11)
- Offer group (`OfferGroup`) = advertiser product with the cap; dated terms hold caps (FTD / installs, per term or per day) and the fixed rate per offer. An offer never has its own cap.
- Offer geo (`country`, `regions`) is a routing restriction, not a label: a stream sends a click only to offers allowed for its place.
- Offer replacement (`/offers/replace`, resource `offer_swap`: full = all campaigns, groups = the team's) always shows the preview of every stream and can be undone.
- Reference campaign: `is_template` / `template_id`; «Применить к кампаниям» copies streams by name, keeps weights by default.
- Mock-only logic lives in `api/client-offers.ts` (cap counting, swap, template diff); install = unique campaign click (AAA 10/11).

## Facebook data, PBI reports, problems (10/11)
- FB entities (`FbAdAccount › FbCampaign › FbAdset › FbAd`, daily `FbDayStat` impressions / spend) come from the team's collector; a click is matched to its ad by `sub_id_6` (ad id). Report dimensions `agency`, `fb_account`, `fb_campaign`, `fb_adset`, `fb_ad`, plus `team`, `approach` (campaign field), `product`, `reject_reason`.
- Impressions are per ad / day; the mock gives each click an equal share so any grouping sums up. Real backend: join FB stats by ad id + day; impressions / CPM / CTR are exact only on ad-derived dimensions.
- FB metrics: `impressions`, `ctr`, `cpm`, `c2i`, `i2r`, `approve` (= r2d), `i2d`, `install_cost`, `uepc`, `cost_fee` / `profit_fee` / `roi_fee` (spend + agency %, the PBI «Спэнд+%»), `rejected_revenue`. Preset «Facebook» = PBI column set.
- Report: up to 10 levels; «PBI: …» groupings repeat the FacebookNew pages (also set columns / filters); slicers row = IN_LIST filters (hidden behind «Быстрые фильтры» on phones).
- Rejections carry `reject_reason` (partner wording) and `rejected_revenue` (lost payout); CSV import 5th column `reason`.
- Problems (`/problems`, resource `problems`, `api/client-problems.ts`): checks run server-side every 5 min, one row per open problem with numbers and links; mute 4 h / resolved / reopen. Buyers handle only problems of their campaigns. Header shows the open count (red if critical).
- Click sheet «Откуда пришёл и куда ушёл»: account › FB campaign (naming check) › ad set › ad, partner postbacks, outgoing postbacks.

## AAA edits 11/11 (Google Doc, screens in refs/aaa-1111/)
- Caps editor = table FTD / installs × «за период» / «в день»; empty cell = no cap.
- Offer geo: countries + regions of those countries (`REGIONS` in meta: US states, DE Länder, CA provinces …); region filter options = all regions.
- Campaign: tracking link already carries the parameters (name=source macro); campaign S2S tab shows the source postback (sent by default for all campaigns of the source) + extra campaign postbacks.
- Approaches: shared directory (`Approach` {name, code}), «Новый» in campaign forms for any buyer, managed in Settings with the ad naming template (`{подход}` token); unknown code in an ad name → problem.
- Offer swap pickers show the current cap of each offer's group; full ones last.
- «Для IT» notes (`features/devnotes/notes.tsx`): collapsed note next to a feature + `/it-notes` page; toggle in the user menu.
- Ad accounts (`/ad-accounts`, resource `ad_accounts`, `api/client-accounts.ts`): account (token / proxy admin only), assignment to a buyer by period with provider fee (spend of a day → that day's buyer and fee: `accountOnDay`), providers tab. Problems `spend_diff`, `account_error`. Nav: «Кабинеты» after «Кампании»; «Тренды» moved into «Отчёты».
