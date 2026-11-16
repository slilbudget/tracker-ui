# Backend handoff

The frontend is complete enough to define the backend. It runs on an in-browser fake API; this document says what to build so the UI can switch to real HTTP with no page changes.

## Where the contract lives

| What | File |
|---|---|
| Domain model (entities, fields, enums) | `src/api/types.ts` |
| Every endpoint the UI calls | the `api` object in `src/api/client.ts` (sub-groups come from `client-*.ts`) |
| Dictionaries: report dimensions, metrics, stream filters, actions, statuses, regions | `src/api/meta.ts` |
| Report math (how every metric is computed) | `src/mock/report.ts` |
| Business rules in plain words | [domain.md](domain.md) and the «Справка для IT» page (`/it-notes`, source `src/features/devnotes/notes.tsx`) |
| Who sees what (scope) | `src/mock/scope.ts` + the `Role.access` matrix in `types.ts` |

**The seam.** Pages import only `api` from `@/api/client` and call it through TanStack Query. Each function = one endpoint; it returns a Promise of plain JSON. To go live, replace the function bodies with `fetch` calls (one `request(method, path, body)` helper) and keep the signatures. Mock-only helpers are in `src/api/mock-util.ts` and `src/mock/*`; nothing in `src/features` depends on them except the demo switches in the user menu (`roles`, `EMPTY_DB` in `app/shell.tsx`, `setViewerRole` in `app/state.tsx`), which go away with a real session.

## Endpoints

160 functions. Generic CRUD (`list`, `archived`, `get`, `create`, `update`, `remove` = move to archive, `restore`) behaves the same for every entity that has `state`. `stats(range)` returns `{ [entityId]: { clicks, leads, sales, cost, revenue, … } }` for list pages.

| Group | Functions |
|---|---|
| `campaigns` | `list`, `archived`, `get`, `access`, `create`, `update`, `remove`, `restore`, `stats`, `updateCosts`, `templateDiff`, `applyTemplate`, `clone` |
| `streams` | `list`, `archived`, `get`, `create`, `update`, `remove`, `restore`, `byCampaign`, `stats`, `setWeights`, `reorder` |
| `landings` | `list`, `archived`, `get`, `create`, `update`, `remove`, `restore`, `stats` |
| `offers` | `list`, `archived`, `get`, `create`, `update`, `remove`, `restore`, `stats` |
| `offerGroups` | `list`, `caps`, `stats`, `create`, `update`, `remove` |
| `offerSwap` | `preview`, `usage`, `apply`, `undo`, `history` |
| `problems` | `list`, `count`, `mute`, `resolve`, `reopen`, `checks`, `saveChecks` |
| `adAccounts` | `list`, `get`, `create`, `update`, `assign`, `release` |
| `adAccounts.providers` | `list`, `create`, `update` |
| `adAccounts.fees` | `list`, `create`, `remove` |
| `approaches` | `list`, `create`, `update`, `remove` |
| `adNaming` | `get`, `update` |
| `fb` | `accounts`, `chain` |
| `stats` | `names`, `clickPath` |
| `stats.conversions` | `get`, `update`, `create`, `previewImport`, `importRows` |
| `system.postbacks` | `retry` |
| `system.settings` | `get`, `update` |
| `system.users` | `resetPassword`, `reset2fa` |
| `system.profile` | `changePassword`, `twoFactorSetup`, `setTwoFactor` |
| `system.archive` | `purge` |
| `catalog` | `landingFiles`, `setLandingZip`, `checkUrl`, `removeDomain` |
| `affiliateNetworks` | `list`, `archived`, `get`, `create`, `update`, `remove`, `restore`, `stats` |
| `trafficSources` | `list`, `archived`, `get`, `create`, `update`, `remove`, `restore`, `stats` |
| `domains` | `list`, `archived`, `get`, `create`, `update`, `remove`, `restore`, `check` |
| `groups` | `list`, `create`, `update`, `remove` |
| `reports` | `build` |
| `clicks` | `log`, `get` |
| `conversions` | `log` |
| `postbacks` | `log`, `summary` |
| `users` | `list`, `archived`, `get`, `create`, `update`, `remove`, `restore` |
| `roles` | `list`, `archived`, `get`, `create`, `update`, `remove`, `restore` |
| `apiKeys` | `list`, `create`, `remove` |
| `audit` | `list` |
| `integrations` | `get`, `list`, `save`, `setState`, `sync`, `remove` |
| `settings` | `get`, `update` |
| `(root)` | `me`, `search` |

Suggested REST mapping: `GET /campaigns`, `GET /campaigns/:id`, `POST /campaigns`, `PATCH /campaigns/:id`, `DELETE /campaigns/:id` (archive), `POST /campaigns/:id/restore`, `GET /campaigns/stats?from&to&tz`; non-CRUD functions become `POST /<group>/<function>` (e.g. `POST /offer-swap/preview`). `reports.build` takes `ReportRequest` and returns `ReportResponse` (types.ts) — the main analytical endpoint, intended for ClickHouse.

## Conventions the backend must define

- **IDs.** `ID = number` for tracker entities. String ids: FB entities (`act_…`, ad / ad set / campaign ids), clicks (`sub_id`), conversions (`conversion_id`), problems. IDs are assigned by the server.
- **Dates.** Stored and sent as UTC ISO-8601 (`ISODate`). Day boundaries are computed in a timezone: reports and lists in `DateRange.timezone` (the user's), caps in the group's `cap_timezone`, FB stats in the account's `timezone`. Date-only values are `YYYY-MM-DD`.
- **Pagination.** Logs (`clicks.log`, `conversions.log`, `postbacks.log`) take `limit/offset` and return `{ rows, total }`. At real volume use cursor pagination and an approximate total; add paging to `audit.list`, `offerSwap.history`, `problems.list`.
- **Errors.** The UI shows `error.message` in a toast; write messages in Russian for the user. Proposed envelope: `{ error: { code, message, fields?: { [field]: message } } }` with 400 / 403 / 404 / 409 / 422.
- **Auth.** Session cookie or JWT; 2FA (TOTP); API keys (`ApiKey.prefix` is shown, the secret only once at creation). `me()` returns the current user; the UI will also need the role (`access`, `hidden_metrics`) from it.
- **Scope.** `Role.access[resource]`: `none | read | own | groups | full`. `own` = campaigns the user owns or in their group; `groups` = campaigns in `User.group_ids`. On top of the role, `User.grants` give single objects (a campaign or a campaign group, `read` or `edit`). Rules (`src/mock/scope.ts`):
  - visible = in the role scope (role `none` = nothing) **or** granted. A grant opens the campaign, its streams, clicks, conversions and report rows — not the buyer's ad accounts or their problems (those follow the role only, `inRoleScope`).
  - edit (campaign / streams separately) = the resource level is `full`, or `own`/`groups` and the campaign is in the role scope, **or** an `edit` grant. A `read` grant never edits.
  - `campaigns.access(id)` → `{ level, streams }`, each `edit | read | none`; the campaign page is read-only until it answers. Every write checks it: `campaigns.update/remove/restore`, all `streams.*` writes, `setWeights`, `reorder`, `applyTemplate` (skips campaigns without stream edit), `offerSwap.*` (only campaigns whose streams the viewer may edit). `clone` needs only visibility (it reads the source).
  - Only users with `users: full` may change `User.grants` (enforce on the server; the mock does not check it).
  Apply scope in **every** endpoint (lists, `get`, logs, reports, dictionaries), not only in lists. `hidden_metrics` must be removed server-side from reports, logs and offer payouts.
- **Secrets.** FB account `api_token` / `proxy` and integration `token` / `proxy_password` are write-only for non-admins: lists return a mask (`EAAG…abcd`, «задан»), `get` returns the value only with full access. Encrypt at rest. Never accept a masked value back as a new secret.
- **Server-owned fields.** `id`, `created_at`, `updated_at`, `owner_id` (from the session), computed fields (`FbAdAccount.buyer_id / agency / agency_fee / total_spend / spend_diff`, `Offer.payout_value` as the current rate) are never taken from the request.
- **Excluded campaigns.** `Campaign.stats_excluded` («Не учитывать в статистике») does not change routing. `reports.build` skips such campaigns unless `include_excluded: true` (report switch «Исключённые кампании», default false) or a filter names the campaign (`campaign` / `campaign_id`: links from the campaign page, problems, the click sheet); dashboard and trends always skip them; entity stats (`stats(range)`) skip them except for the campaign and stream lists. Logs show every click and conversion.
- **Column settings.** The clicks and conversions logs keep the chosen columns and their order per user (`trk.logcols.*` in localStorage now; move to user preferences). `conversions.log` rows carry the click fields (`ConversionLogRow.click`: geo, device, `sub_id_1…6`, `external_id`, source).
- **Audit.** Every change writes `AuditEntry` (who, what, when, IP).

## What the mock simplifies (do it properly)

These came out of the final code review. The UI already behaves correctly against a backend that does them.

1. **Cost and impressions** live on clicks in the mock (`updateCosts` spreads a sum evenly). Store spend / impressions per ad per day (`FbDayStat`) and join them in reports, so spend without clicks is not lost and totals reconcile with the account. The team's spend collector needs ingest endpoints for `FbCampaign / FbAdset / FbAd / FbDayStat`.
2. **Conversion history.** One row changes lead → sale. Keep per-status timestamps (or an event log): a registration in October that deposits in November counts in November's cap and rate. Uniqueness: `(sub_id, tid)`.
3. **Deposit rate** = the `OfferTerm` that covers the postback date, not `Offer.payout_value` at the moment of saving.
4. **Caps** count in `cap_timezone`; the install = a unique campaign click attributed to the offer by the same rule as reports.
5. **Problems** are persisted incidents: own id, opened / closed by the check every 5 min; «resolved» closes this incident only, a recurrence opens a new one. Return typed references (`{ type: "campaign", id }`) instead of UI links.
6. **Report filters** by id dimensions (`campaign_id`, `offer_id` …), not by display names; return `{ id, label }` per dimension value.
7. **Campaign geo.** The offer-swap preview needs a campaign geo; the mock takes the stream country filter or the first segment of the campaign name (`US | …`). Add `Campaign.geo` (ISO-2 list).
8. **Stream updates from a reference campaign** should update matched streams in place (keep stream ids and history) instead of archive + re-create.
9. **Ad accounts.** Assignment periods never overlap; the current buyer is the period covering today. Fee rows: changing the past is an admin action with audit; account rows may need an end date.
10. **Teams.** `User.team` is free text; make Team an entity (used by the `team` report dimension and the «внутри команды» account-transfer right).
11. **Settings** are split into `settings` (tracker) and `system.settings` (bot rules); merge or keep, but document.

## Demo data

`src/mock/seed.ts` generates a deterministic company (8 buyers in 2 teams, 10 campaigns, 36 offers in 27 offer groups, ~44k clicks over 45 days) with planted anomalies for every problem check. User menu → «Данные» → «Пустой трекер» starts the same UI from a clean database (admin, roles, settings only).
