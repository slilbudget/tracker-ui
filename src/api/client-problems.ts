// Problems (observability): checks the backend runs every few minutes over clicks, postbacks, FB stats,
// caps and domains. Each open problem is one row; a Telegram alert goes out when it opens.
// Mock: the checks run over the seed on every call; mute / resolve marks are kept in memory.
import type { FbDayStat, ID, Problem, ProblemCheck, ProblemKind } from "./types"
import * as db from "@/mock/seed"
import { canSeeCampaign } from "@/mock/scope"
import { capOf } from "./client-offers"
import { approachIndex, currentAdNaming } from "./client-directory"

const wait = <T,>(v: T, ms = 30): Promise<T> => new Promise((res) => setTimeout(() => res(structuredClone(v)), ms))
const H = 3600000
const ago = (iso: string) => Date.now() - new Date(iso).getTime()
const hours = (ms: number) => (ms < H ? `${Math.max(1, Math.round(ms / 60000))} мин` : `${Math.round(ms / H)} ч`)
const reportHref = (g: string[], filters: { name: string; expression: string }[], period = "today") =>
  `#/reports?${new URLSearchParams({ period, g: g.join(","), f: JSON.stringify(filters.map((f) => ({ ...f, operator: "EQUALS" }))) })}`
const campaignLink = (id: ID) => ({ label: db.campaigns.find((c) => c.id === id)?.name ?? `#${id}`, href: `#/campaigns/${id}` })

let checks: ProblemCheck[] = [
  { kind: "no_postbacks", enabled: true, threshold: null, notify: true },
  { kind: "fb_naming", enabled: true, threshold: null, notify: true },
  { kind: "spend_no_clicks", enabled: true, threshold: 5, notify: true },
  { kind: "clicks_no_ad", enabled: true, threshold: 20, notify: true },
  { kind: "no_spend", enabled: true, threshold: null, notify: false },
  { kind: "postback_out", enabled: true, threshold: 2, notify: true },
  { kind: "cap_full", enabled: true, threshold: null, notify: true },
  { kind: "terms_end", enabled: true, threshold: 3, notify: false },
  { kind: "spend_diff", enabled: true, threshold: null, notify: true },
  { kind: "account_error", enabled: true, threshold: null, notify: true },
  { kind: "domain", enabled: true, threshold: null, notify: true },
]
let chat = "Трекер | проблемы"
const marks = new Map<string, { status: "muted" | "resolved"; until: string | null }>()

const thresholdOf = (k: ProblemKind) => checks.find((c) => c.kind === k)?.threshold

// ---------- checks ----------

// A network is silent when, judging by its usual conversion rate, the clicks sent to its offers since the last
// postback should have brought at least 3 conversions (P(0 | λ=3) ≈ 5%) — or, with a manual threshold, after N hours.
function noPostbacks(): Problem[] {
  const out: Problem[] = []
  const manual = thresholdOf("no_postbacks")
  const from = Date.now() - 14 * 24 * H
  for (const n of db.affiliateNetworks.filter((x) => x.state === "active")) {
    const offerIds = new Set(db.offers.filter((o) => o.affiliate_network_id === n.id).map((o) => o.id))
    const convs = db.conversions.filter((c) => c.offer_id != null && offerIds.has(c.offer_id) && new Date(c.postback_datetime).getTime() > from)
    if (convs.length < 10) continue
    const last = Math.max(...convs.map((c) => new Date(c.postback_datetime).getTime()))
    const clicks = db.clicks.filter((c) => c.offer_id != null && offerIds.has(c.offer_id) && new Date(c.datetime).getTime() > from)
    const rate = convs.length / Math.max(1, clicks.length)
    const since = clicks.filter((c) => new Date(c.datetime).getTime() > last).length
    const expected = since * rate
    const silence = Date.now() - last
    if (manual != null ? silence < manual * H : expected < 3) continue
    out.push({
      id: `no_postbacks:${n.id}`, kind: "no_postbacks", severity: "critical",
      title: `${n.name}: нет постбеков ${hours(silence)}`,
      details: `С последнего постбека на её офферы пришло ${since} кликов. По обычной конверсии партнёрки (${(rate * 100).toFixed(1).replace(".", ",")}% за 14 дней) за это время ждали ~${Math.round(expected)} конверсий, не пришло ни одной. Проверьте постбек в кабинете партнёрки или напишите менеджеру.`,
      where: [{ label: n.name, href: `#/affiliate-networks?edit=${n.id}` }, { label: "Лог постбеков", href: "#/postbacks?tab=in" }],
      buyer_id: null, since: new Date(last).toISOString(), status: "open", muted_until: null,
    })
  }
  return out
}

// FB campaign naming must start with the id of the tracker campaign its links point to.
function fbNaming(): Problem[] {
  const out: Problem[] = []
  const target = new Map<string, Map<number, number>>() // fb campaign → tracker campaign → clicks
  const adset = new Map(db.fbAdsets.map((s) => [s.id, s.campaign_id]))
  const adCampaign = new Map(db.fbAds.map((a) => [a.id, adset.get(a.adset_id)!]))
  for (const c of db.clicks) {
    const fc = adCampaign.get(c.sub_id_6)
    if (!fc) continue
    const m = target.get(fc) ?? new Map<number, number>()
    m.set(c.campaign_id, (m.get(c.campaign_id) ?? 0) + 1)
    target.set(fc, m)
  }
  for (const fc of db.fbCampaigns) {
    const real = [...(target.get(fc.id) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as number | undefined
    if (real == null || !canSeeCampaign(real)) continue
    const named = Number(/^(\d+) \|/.exec(fc.name)?.[1] ?? NaN)
    const buyer = db.campaigns.find((c) => c.id === real)?.owner_id ?? null
    const base = { kind: "fb_naming" as const, buyer_id: buyer, since: fc.created_at, status: "open" as const, muted_until: null }
    const where = [{ label: `Кампания FB: ${fc.name}`, href: reportHref(["fb_adset", "fb_ad"], [{ name: "fb_campaign", expression: fc.name }], "7_days_ago") }, campaignLink(real)]
    if (Number.isNaN(named)) {
      out.push({ ...base, id: `fb_naming:${fc.id}`, severity: "warning", title: "В названии кампании FB нет ID кампании трекера", details: `Ссылка ведёт в кампанию ${real}. Без ID в названии трафик не привязать к байеру, если метки в ссылке потеряются. Переименуйте: «${real} | ${fc.name}».`, where })
    } else if (named !== real) {
      out.push({ ...base, id: `fb_naming:${fc.id}`, severity: "critical", title: `В названии кампании FB ID ${named}, а ссылка ведёт в ${real}`, details: `Расход этой кампании FB будет засчитан не той кампании трекера (и, возможно, не тому байеру). Исправьте ссылку в объявлениях или название.`, where })
    }
  }
  return out
}

// Ad names follow the standard naming; the approach code must be one of the directory.
function adNaming(): Problem[] {
  const idx = approachIndex(currentAdNaming())
  if (idx < 0) return []
  const codes = new Set(db.approaches.map((a) => a.code))
  const out: Problem[] = []
  const seen = new Map<string, { campaign: number; at: string }>()
  for (const c of db.clicks) if (c.sub_id_6 && ago(c.datetime) < 7 * 24 * H && !seen.has(c.sub_id_6)) seen.set(c.sub_id_6, { campaign: c.campaign_id, at: c.datetime })
  for (const ad of db.fbAds) {
    const hit = seen.get(ad.id)
    if (!hit || !canSeeCampaign(hit.campaign)) continue
    const code = ad.name.split("-")[idx] ?? ""
    if (codes.has(code)) continue
    out.push({
      id: `ad_naming:${ad.id}`, kind: "fb_naming", severity: "warning",
      title: `Неизвестный подход «${code}» в названии объявления`,
      details: `Объявление «${ad.name}»: такого кода нет в справочнике подходов (${[...codes].join(", ")}). В отчёте по подходам оно не попадёт в свой подход. Исправьте название или добавьте подход.`,
      where: [campaignLink(hit.campaign), { label: "Справочник подходов", href: "#/settings" }],
      buyer_id: db.campaigns.find((x) => x.id === hit.campaign)?.owner_id ?? null, since: hit.at, status: "open", muted_until: null,
    })
  }
  return out
}

// An ad spends today but the tracker got no clicks from it: wrong link or lost macros.
function spendNoClicks(): Problem[] {
  const min = thresholdOf("spend_no_clicks") ?? 5
  const today = new Date().toISOString().slice(0, 10)
  const clicked = new Set(db.clicks.filter((c) => c.datetime.slice(0, 10) === today).map((c) => c.sub_id_6))
  const byCampaign = new Map<string, FbDayStat[]>()
  for (const s of db.fbStats) {
    if (s.day !== today || clicked.has(s.ad_id)) continue
    const set = db.fbAdsets.find((x) => x.id === db.fbAds.find((a) => a.id === s.ad_id)?.adset_id)
    if (set) byCampaign.set(set.campaign_id, [...(byCampaign.get(set.campaign_id) ?? []), s])
  }
  const out: Problem[] = []
  for (const [fcId, stats] of byCampaign) {
    const spend = stats.reduce((a, s) => a + s.spend, 0)
    if (spend < min) continue
    const fc = db.fbCampaigns.find((x) => x.id === fcId)!
    const acc = db.fbAccounts.find((a) => a.id === fc.account_id)
    const named = Number(/^(\d+) \|/.exec(fc.name)?.[1] ?? NaN)
    if (!Number.isNaN(named) && !canSeeCampaign(named)) continue
    out.push({
      id: `spend_no_clicks:${fcId}`, kind: "spend_no_clicks", severity: "critical",
      title: `Кампания FB тратит, а кликов в трекере нет: ${spend.toFixed(2).replace(".", ",")} $ сегодня`,
      details: `${stats.length} объявл. с расходом и показами (${stats.reduce((a, s) => a + s.impressions, 0)}), но ни одного клика по ним. Проверьте ссылку и метки в объявлениях.`,
      where: [{ label: `Кампания FB: ${fc.name}`, href: "#/reports?period=today&g=fb_account" }, ...(Number.isNaN(named) ? [] : [campaignLink(named)])],
      buyer_id: acc?.buyer_id ?? null, since: fc.created_at, status: "open", muted_until: null,
    })
  }
  return out
}

// Clicks without the FB ad id: the link lost its macros, spend can't be matched to these clicks.
function clicksNoAd(): Problem[] {
  const share = thresholdOf("clicks_no_ad") ?? 20
  const out: Problem[] = []
  for (const c of db.campaigns.filter((x) => x.state === "active" && !x.is_template && canSeeCampaign(x.id))) {
    const recent = db.clicks.filter((k) => k.campaign_id === c.id && ago(k.datetime) < 6 * H)
    const lost = recent.filter((k) => !k.sub_id_6)
    if (recent.length < 10 || (lost.length / recent.length) * 100 < share) continue
    out.push({
      id: `clicks_no_ad:${c.id}`, kind: "clicks_no_ad", severity: "warning",
      title: `${Math.round((lost.length / recent.length) * 100)}% кликов без ID объявления`,
      details: `${lost.length} из ${recent.length} кликов за 6 ч пришли без меток FB ({{ad.id}}, {{adset.id}}). Расход по ним не привязать к объявлениям. Проверьте URL-параметры в объявлениях.`,
      where: [campaignLink(c.id), { label: "Лог кликов", href: `#/clicks?campaign=${c.id}` }],
      buyer_id: c.owner_id, since: lost.map((k) => k.datetime).sort()[0], status: "open", muted_until: null,
    })
  }
  return out
}

// Clicks yesterday but no spend: the spend collector did not load this campaign's accounts.
function noSpend(): Problem[] {
  const out: Problem[] = []
  for (const c of db.campaigns.filter((x) => x.state === "active" && !x.is_template && canSeeCampaign(x.id))) {
    const day = db.clicks.filter((k) => k.campaign_id === c.id && ago(k.datetime) < 24 * H && !k.is_bot)
    if (day.length < 20 || day.some((k) => k.cost > 0)) continue
    out.push({
      id: `no_spend:${c.id}`, kind: "no_spend", severity: "warning", title: "Есть клики, но нет расхода за сутки",
      details: `${day.length} кликов за 24 ч без расхода. Сборщик расходов не загрузил кабинеты кампании: ROI и прибыль сейчас завышены.`,
      where: [campaignLink(c.id), { label: "Отчёт по кабинетам", href: reportHref(["fb_account"], [{ name: "campaign", expression: c.name }]) }],
      buyer_id: c.owner_id, since: day.map((k) => k.datetime).sort()[0], status: "open", muted_until: null,
    })
  }
  return out
}

// Outgoing S2S postbacks (pixel, SKAK) failing: the ad network does not learn about deposits.
function postbackOut(): Problem[] {
  const min = thresholdOf("postback_out") ?? 2
  const byCampaign = new Map<number, typeof db.postbackLog>()
  for (const p of db.postbackLog) {
    if (p.direction !== "out" || p.result === "ok" || p.campaign_id == null || ago(p.datetime) > 24 * H || !canSeeCampaign(p.campaign_id)) continue
    byCampaign.set(p.campaign_id, [...(byCampaign.get(p.campaign_id) ?? []), p])
  }
  return [...byCampaign].filter(([, xs]) => xs.length >= min).map(([id, xs]): Problem => ({
    id: `postback_out:${id}`, kind: "postback_out", severity: "warning",
    title: `Исходящие постбеки не доходят: ${xs.length} за 24 ч`,
    details: `Последняя ошибка: ${xs[0].message || `HTTP ${xs[0].http_code}`}. Пиксель не получает депы, оптимизация FB ухудшится.`,
    where: [campaignLink(id), { label: "Исходящие постбеки", href: "#/postbacks?tab=out" }],
    buyer_id: db.campaigns.find((c) => c.id === id)?.owner_id ?? null, since: xs[xs.length - 1].datetime, status: "open", muted_until: null,
  }))
}

function caps(): Problem[] {
  const days = thresholdOf("terms_end") ?? 3
  const out: Problem[] = []
  const today = new Date()
  for (const g of db.offerGroups.filter((x) => x.state === "active")) {
    const cap = capOf(g)
    const href = `#/offer-groups?edit=${g.id}`
    if (cap.status === "full" && !g.fallback_offer_ids.length) {
      out.push({
        id: `cap_full:${g.id}`, kind: "cap_full", severity: "critical", title: `${g.name}: капа отлита, запасного оффера нет`,
        details: "Трафик продолжает идти на офферы группы, депы сверх капы партнёрка может не оплатить. Добавьте запасной оффер или замените оффер в кампаниях.",
        where: [{ label: g.name, href }, { label: "Замена оффера", href: "#/offers/replace" }],
        buyer_id: null, since: new Date(today.getTime() - 5 * H).toISOString(), status: "open", muted_until: null,
      })
    }
    const term = cap.term
    if (term) {
      const left = Math.ceil((new Date(`${term.to}T23:59:59`).getTime() - today.getTime()) / (24 * H))
      const next = g.terms.some((t) => t.from > term.to)
      if (left <= days && !next) out.push({
        id: `terms_end:${g.id}`, kind: "terms_end", severity: "warning", title: `${g.name}: условия заканчиваются через ${left} дн.`,
        details: "Следующего периода нет: после окончания у группы не будет ставки и капы. Продлите условия.",
        where: [{ label: g.name, href }], buyer_id: null, since: new Date(today.getTime() - 24 * H).toISOString(), status: "open", muted_until: null,
      })
    }
  }
  return out
}

// Account checks: unallocated spend above the account's own threshold, FB API errors.
function accounts(kind: "spend_diff" | "account_error"): Problem[] {
  const out: Problem[] = []
  for (const a of db.fbAccounts) {
    if (!a.active) continue
    const mine = a.buyer_id == null ? canSeeCampaign(null) : db.campaigns.some((c) => c.owner_id === a.buyer_id && canSeeCampaign(c.id))
    if (!mine) continue
    const where = [{ label: `Кабинет ${a.name} · ${a.id}`, href: `#/ad-accounts?edit=${a.id}` }]
    const diff = a.spend_diff + a.spend_offset
    if (kind === "spend_diff" && diff > a.alert_on_spend_diff) out.push({
      id: `spend_diff:${a.id}`, kind, severity: "warning", title: `Нераспределённый расход ${diff.toFixed(2).replace(".", ",")} $ в кабинете ${a.name}`,
      details: `Порог кабинета ${a.alert_on_spend_diff} $. Этот расход FB списал, но он не привязался ни к одной кампании трекера: объявления без ссылки трекера или без ID объявления. Найдите объявления или оставьте комментарий в кабинете.`,
      where, buyer_id: a.buyer_id, since: a.balance_checked_at ?? new Date().toISOString(), status: "open", muted_until: null,
    })
    if (kind === "account_error" && a.last_error) out.push({
      id: `account_error:${a.id}`, kind, severity: "critical", title: `Кабинет ${a.name}: ошибка FB API`,
      details: `${a.last_error}. Метрики, расход и баланс кабинета не обновляются с ${a.balance_checked_at ? new Date(a.balance_checked_at).toLocaleString("ru") : "—"}. Обновите токен или проверьте прокси.`,
      where, buyer_id: a.buyer_id, since: a.balance_checked_at ?? new Date().toISOString(), status: "open", muted_until: null,
    })
  }
  return out
}

function domains(): Problem[] {
  return db.domains.filter((d) => d.status === "error" || (!d.is_ssl && d.campaigns_count > 0)).map((d): Problem => ({
    id: `domain:${d.id}`, kind: "domain", severity: d.status === "error" ? "critical" : "warning",
    title: d.status === "error" ? `Домен ${d.name} не работает` : `Домен ${d.name} без SSL`,
    details: d.error_description || "Ссылки на http открываются с предупреждением в браузере.",
    where: [{ label: d.name, href: `#/domains?edit=${d.id}` }], buyer_id: null,
    since: new Date(Date.now() - 3 * H).toISOString(), status: "open", muted_until: null,
  }))
}

const RUNNERS: Record<ProblemKind, () => Problem[]> = {
  no_postbacks: noPostbacks, fb_naming: () => [...fbNaming(), ...adNaming()], spend_no_clicks: spendNoClicks, clicks_no_ad: clicksNoAd, no_spend: noSpend,
  postback_out: postbackOut, cap_full: () => caps().filter((p) => p.kind === "cap_full"), terms_end: () => caps().filter((p) => p.kind === "terms_end"), domain: domains,
  spend_diff: () => accounts("spend_diff"), account_error: () => accounts("account_error"),
}

function run(): Problem[] {
  const out = checks.filter((c) => c.enabled).flatMap((c) => RUNNERS[c.kind]())
  const now = Date.now()
  for (const p of out) {
    const m = marks.get(p.id)
    if (!m) continue
    if (m.status === "muted" && m.until && new Date(m.until).getTime() < now) { marks.delete(p.id); continue }
    p.status = m.status
    p.muted_until = m.until
  }
  const rank = { critical: 0, warning: 1 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.since < b.since ? 1 : -1))
}

export const problemsApi = {
  list: () => wait(run()),
  // open problems count for the nav badge
  count: () => wait(run().filter((p) => p.status === "open").length),
  mute: (id: string, hoursN: number) => { marks.set(id, { status: "muted", until: new Date(Date.now() + hoursN * H).toISOString() }); return wait({ ok: true }) },
  resolve: (id: string) => { marks.set(id, { status: "resolved", until: null }); return wait({ ok: true }) },
  reopen: (id: string) => { marks.delete(id); return wait({ ok: true }) },
  checks: () => wait({ checks, chat }),
  saveChecks: (v: { checks: ProblemCheck[]; chat: string }) => { checks = v.checks; chat = v.chat; return wait({ ok: true }) },
}

// FB entities for the click sheet and filter dictionaries.
export const fbApi = {
  accounts: () => wait(db.fbAccounts.filter((a) => (a.buyer_id == null ? canSeeCampaign(null) : db.campaigns.some((c) => c.owner_id === a.buyer_id && canSeeCampaign(c.id)))).map((a) => ({ ...a, api_token: "", proxy: "" }))),
  // ad id → ad, ad set, campaign, account (the chain the click sheet shows)
  chain: (adId: string) => {
    const ad = db.fbAds.find((a) => a.id === adId)
    const set = ad && db.fbAdsets.find((s) => s.id === ad.adset_id)
    const campaign = set && db.fbCampaigns.find((c) => c.id === set.campaign_id)
    const account = campaign && db.fbAccounts.find((a) => a.id === campaign.account_id)
    return wait(ad ? { ad, adset: set ?? null, campaign: campaign ?? null, account: account ?? null } : null)
  },
}
