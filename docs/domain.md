# Business rules

How the tracker works from the business side. The same rules, in Russian, are shown in the app next to each feature («Для IT») and collected on the «Справка для IT» page (`/it-notes`, source `src/features/devnotes/notes.tsx`) — that file is the source of truth for the topics it covers; this page adds the rest.

Context: an in-house tracker (Keitaro analogue) for a 100+ person media-buying team. Facebook traffic → PWA → tracker → prelander → casino offer. Users: buyers, team leads, finance, admins.

## Traffic routing
- Campaign = approach + geo + buyer. Link: `https://<domain>/<alias>?<campaign parameters>` — the parameters (`sub_id_1…6`, `external_id`) carry the traffic-source macros (FB ad id goes to `sub_id_6`).
- Streams: intercepting (`forced`, checked first, no weights), regular (always by weight), default (catch-all). A returning visitor always gets the same stream, landing and offer while the uniqueness period lasts (Keitaro «привязка до оффера»); neither is a campaign setting. Filters per stream (country, region, device, bot …, `meta.ts` STREAM_FILTERS). Campaigns have no cost model, cost, traffic loss or API token fields: spend comes from the FB collector.
- Tags (`Campaign.tags`): free labels («тест», «скейл», «iOS») for filters in the campaign list and the report («Тег кампании»; a campaign with several tags counts under each).
- Redirect types (streams, landings, offers): only HTTP 302 (default, fastest), JS (an empty tracker page forwards the visitor; bots without JS stop) and «Без реферера» (like JS, the partner does not see the tracker domain).
- «Не учитывать в статистике» (`stats_excluded`): a test or service campaign keeps working but reports, dashboard and trends leave it out; the report can include it with the «Исключённые кампании» switch; a report filtered to that campaign always shows it.
- Offer geo (`country`, `regions`) restricts routing: a stream picks an offer only among those allowed for the click's country / region; shares of the rest are renormalised; no allowed offer → the stream does not match and the click goes on.
- Reference campaign (`is_template`) holds the standard streams; «Применить к кампаниям» copies them by name into linked campaigns (weights kept by default).

## Offers, caps, rates
- Offer group = advertiser product. Dated terms hold the caps (FTD / installs, per term and / or per day) and a fixed rate per offer. An offer never has its own cap.
- FTD = sales of the group's offers in the period; install = unique campaign click sent to an offer of the group. Day = the group's `cap_timezone`.
- A full cap sends the group's traffic to the first fallback offer that still has room; none → traffic keeps going and a critical problem is raised. Telegram alert once per threshold (`alert_at`, e.g. 50/80/90/100%).
- Offer replacement (`/offers/replace`) swaps an offer in every stream at once, with a preview per stream and undo. The preview can be narrowed by campaign name, approach, buyer, campaign group and geo (stream country filter, else the campaign geo); only the shown and ticked streams change.

## Conversions and postbacks
- Statuses used by reports and caps: `lead` (registration), `sale` (deposit), `rejected`. A rejection keeps the lost payout (`rejected_revenue`) and the partner's reason (`reject_reason`); finance loads rejections by CSV (`subid, status, payout, tid, reason`).
- Incoming postbacks from affiliate networks; outgoing S2S postbacks: the traffic source's postback (pixel via CAPI, PWA) is the default for all its campaigns and fires only for the chosen statuses; campaign postbacks are extra (team webhooks). Up to 5 retries.

## Facebook data and ad accounts
- FB entities `FbAdAccount › FbCampaign › FbAdset › FbAd` and daily `FbDayStat` (impressions, spend per ad) come from the team's collector. A click is matched to its ad by `sub_id_6`.
- Attribution of spend to a tracker campaign: by the tracker campaign id at the start of the FB campaign name (`<id> | <date> | …`). No id or an unknown id → the spend is **unallocated** (`spend_diff`), shown per account with the FB campaigns that caused it; above the account's alert threshold → problem + Telegram.
- Provider (agency or our farm) is set on the account once. Provider fee by period (`AdFeePeriod`: provider, all its accounts or one account, %, from date); the fee of a day = the latest row on or before that day, an account's own rows override the provider's. A raise never changes past spend. «Спэнд+%» = spend × (1 + fee of the day).
- Account → buyer by period (`AdAccountAssignment`); spend of a day belongs to that day's buyer. Handing accounts over is a per-user right (`User.account_transfer`): `all` (assign free accounts, transfer, release) or `team` (between buyers of one's own team).
- Token and proxy of an account: admins only. Currency, timezone and the FB creation date come from the FB API, never typed in. Admins can add many accounts at once from JSON (id, token, proxy, buyer, provider, fee).

## Approaches and ad naming
- Shared directory of approaches (name + code). Any buyer may add one while creating a campaign; rename / delete need settings rights.
- Ad naming template (Settings), e.g. `{язык}-{команда}-{номер}-{подход}-{штат}-{бренд}-{крео}`; the `{подход}` part must be a known code, otherwise a problem «Неверный нейминг FB».

## Reports
- The report table is AG Grid Community (MIT; the only page that uses it). Grouping rows are not AG Grid row grouping (Enterprise): each level is its own `reports.build` call, the grid shows the flattened tree.
- Up to 10 grouping levels over clicks; dimensions and metrics in `meta.ts`, formulas in `src/mock/report.ts`. Conversions are attributed to the click (date of the click), the conversions log filters by postback date.
- FB metrics: impressions, CTR, CPM, c2i, i2r, approve (r2d), i2d, install cost, uEPC, spend / profit / ROI with fee. «PBI: …» presets repeat the team's Power BI pages.

## Problems (`/problems`)
Server-side checks every 5 minutes, one row per open problem with numbers and links; mute 4 h / resolved / reopen; buyers see and handle only their campaigns' problems. Checks: affiliate network silent (expected ≥ 3 conversions by its usual CR), FB campaign / ad naming, spend without clicks, clicks without ad id, no spend loaded, outgoing postback errors, cap full without free fallback, terms ending / ended, unallocated account spend, FB API error on an account, domain down / no SSL.

## Roles
Demo roles (editable in Пользователи → Роли): admin (everything), team lead (the team's campaigns and split, offers, offer replacement for the team), buyer (own campaigns and stats, offers read-only), finance (all statistics, read-only), intern (own campaigns, partner money hidden). Access per section: `none / read / own / groups / full`; hidden metrics per role. On top of the role, a user can get single objects (Пользователи → «Отдельные доступы»): a campaign or a campaign group, «Просмотр и статистика» or «Изменение».
