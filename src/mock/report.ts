// In-memory report engine over the fake clicks / conversions. The real backend answers the same
// ReportRequest from ClickHouse; the frontend never depends on how.
import type { Click, Conversion, ReportFilter, ReportRequest, ReportResponse, ReportRow } from "@/api/types"
import { dayKey, hourKey, inRange, monthKey, resolveRange, weekdayKey } from "@/lib/dates"
import * as db from "./seed"
import { canSeeCampaign } from "./scope"

const byId = <T extends { id: number }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]))
const camp = byId(db.campaigns)
const strm = byId(db.streams)
const land = byId(db.landings)
const offr = byId(db.offers)
const nets = byId(db.affiliateNetworks)
const ogrp = byId(db.offerGroups)
const srcs = byId(db.trafficSources)
const usrs = byId(db.users)
const byStrId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]))
const fbAd = byStrId(db.fbAds)
const fbSet = byStrId(db.fbAdsets)
const fbCamp = byStrId(db.fbCampaigns)
const fbAcc = byStrId(db.fbAccounts)
const fbChain = (c: Click) => {
  const ad = fbAd.get(c.sub_id_6)
  const set = ad && fbSet.get(ad.adset_id)
  const fc = set && fbCamp.get(set.campaign_id)
  return { ad, set, fc, acc: (fc && fbAcc.get(fc.account_id)) ?? fbAcc.get(c.sub_id_1) }
}
// FB impressions are per ad / day: each click of that ad and day carries an equal share, so any grouping sums up.
const impShare = new Map<string, number>()
{
  const n = new Map<string, number>()
  for (const c of db.clicks) if (c.sub_id_6) n.set(`${c.sub_id_6}|${c.datetime.slice(0, 10)}`, (n.get(`${c.sub_id_6}|${c.datetime.slice(0, 10)}`) ?? 0) + 1)
  const imp = new Map(db.fbStats.map((x) => [`${x.ad_id}|${x.day}`, x.impressions]))
  for (const c of db.clicks) {
    const k = `${c.sub_id_6}|${c.datetime.slice(0, 10)}`
    if (c.sub_id_6 && imp.has(k)) impShare.set(c.sub_id, imp.get(k)! / n.get(k)!)
  }
}
const offerOf = (c: Click) => offr.get(c.offer_id ?? strm.get(c.stream_id)?.offers[0]?.offer_id ?? 0)

const convBySub = new Map<string, Conversion[]>()
export function registerConversion(c: Conversion) {
  convBySub.set(c.sub_id, [...(convBySub.get(c.sub_id) ?? []), c])
}
for (const c of db.conversions) registerConversion(c)

function dimensionValue(c: Click, dim: string, tz: string): string {
  switch (dim) {
    case "campaign": return camp.get(c.campaign_id)?.name ?? "—"
    case "campaign_id": return String(c.campaign_id)
    case "stream": return strm.get(c.stream_id)?.name ?? "—"
    case "stream_id": return String(c.stream_id)
    case "landing": return c.landing_id ? land.get(c.landing_id)?.name ?? "—" : "—"
    case "landing_id": return String(c.landing_id ?? "")
    case "offer": {
      const o = c.offer_id ?? strm.get(c.stream_id)?.offers[0]?.offer_id
      return o ? offr.get(o)?.name ?? "—" : "—"
    }
    case "offer_id": return String(c.offer_id ?? "")
    case "offer_group": {
      const o = offr.get(c.offer_id ?? strm.get(c.stream_id)?.offers[0]?.offer_id ?? 0)
      return o?.group_id ? ogrp.get(o.group_id)?.name ?? "—" : "—"
    }
    case "affiliate_network": {
      const o = offr.get(c.offer_id ?? strm.get(c.stream_id)?.offers[0]?.offer_id ?? 0)
      return o?.affiliate_network_id ? nets.get(o.affiliate_network_id)?.name ?? "—" : "—"
    }
    case "ts": return c.ts_id ? srcs.get(c.ts_id)?.name ?? "—" : "—"
    case "buyer": return usrs.get(c.buyer_id)?.login ?? "—"
    case "team": return usrs.get(c.buyer_id)?.team ?? "—"
    case "approach": return camp.get(c.campaign_id)?.approach || "—"
    case "product": {
      const o = offerOf(c)
      return (o?.group_id && ogrp.get(o.group_id)?.product) || "—"
    }
    case "agency": {
      const acc = fbChain(c).acc
      return acc ? db.accountOnDay(acc.id, c.datetime.slice(0, 10)).provider : "—"
    }
    case "fb_account": {
      const a = fbChain(c).acc
      return a ? `${a.name} · ${a.id}` : c.sub_id_1 || "—"
    }
    case "fb_campaign": return fbChain(c).fc?.name ?? "—"
    case "fb_adset": return fbChain(c).set?.name ?? "—"
    case "fb_ad": return fbChain(c).ad?.name ?? "—"
    case "reject_reason": return (convBySub.get(c.sub_id) ?? []).find((x) => x.status === "rejected")?.reject_reason || "—"
    case "day": return dayKey(c.datetime, tz)
    case "hour": return `${hourKey(c.datetime, tz)}:00`
    case "weekday": return weekdayKey(c.datetime, tz)
    case "month": return monthKey(c.datetime, tz)
    default: {
      const v = (c as unknown as Record<string, unknown>)[dim]
      return v == null || v === "" ? "—" : String(v)
    }
  }
}

interface Acc {
  clicks: number; uniq: number; bots: number; lp: number; cost: number; costFee: number; imp: number
  leads: number; sales: number; rejected: number; revLead: number; revSale: number; revRejected: number
}
const empty = (): Acc => ({ clicks: 0, uniq: 0, bots: 0, lp: 0, cost: 0, costFee: 0, imp: 0, leads: 0, sales: 0, rejected: 0, revLead: 0, revSale: 0, revRejected: 0 })

function add(a: Acc, c: Click) {
  a.clicks++
  if (c.is_unique_campaign) a.uniq++
  if (c.is_bot) a.bots++
  if (c.lp_clicked) a.lp++
  a.cost += c.cost
  const acc = fbChain(c).acc
  a.costFee += c.cost * (1 + (acc ? db.accountOnDay(acc.id, c.datetime.slice(0, 10)).fee : 0) / 100)
  a.imp += impShare.get(c.sub_id) ?? 0
  for (const cv of convBySub.get(c.sub_id) ?? []) {
    // a deposit was a registration first: «Лиды (реги)» counts both, «Продажи (депы)» only deposits
    if (cv.status === "lead") { a.leads++; a.revLead += cv.revenue }
    else if (cv.status === "sale") { a.leads++; a.sales++; a.revSale += cv.revenue }
    else if (cv.status === "rejected") { a.rejected++; a.revRejected += cv.rejected_revenue ?? 0 }
  }
}

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)
const div = (a: number, b: number) => (b ? a / b : 0)
const r2 = (v: number) => Math.round(v * 100) / 100

function metricsOf(a: Acc): Record<string, number> {
  const revenue = a.revLead + a.revSale
  return {
    clicks: a.clicks, campaign_unique_clicks: a.uniq, bots: a.bots, lp_clicks: a.lp, lp_ctr: r2(pct(a.lp, a.clicks)),
    leads: a.leads, sales: a.sales, rejected: a.rejected,
    cr: r2(pct(a.leads, a.clicks)), crs: r2(pct(a.sales, a.clicks)), approve: r2(pct(a.sales, a.leads)),
    cost: r2(a.cost), revenue: r2(revenue), sale_revenue: r2(a.revSale),
    profit: r2(revenue - a.cost), profit_confirmed: r2(a.revSale - a.cost),
    roi: r2(pct(revenue - a.cost, a.cost)), roi_confirmed: r2(pct(a.revSale - a.cost, a.cost)),
    epc_confirmed: r2(div(a.revSale, a.clicks)),
    cpc: r2(div(a.cost, a.clicks)), cpa: r2(div(a.cost, a.leads)), cps: r2(div(a.cost, a.sales)), avg_sale: r2(div(a.revSale, a.sales)),
    impressions: Math.round(a.imp), ctr: r2(pct(a.clicks, a.imp)), cpm: r2(div(a.cost, a.imp) * 1000),
    c2i: r2(pct(a.uniq, a.clicks)), i2r: r2(pct(a.leads, a.uniq)), i2d: r2(div(a.uniq, a.sales)),
    install_cost: r2(div(a.cost, a.uniq)), uepc: r2(div(a.revSale, a.uniq)),
    cost_fee: r2(a.costFee), profit_fee: r2(a.revSale - a.costFee), roi_fee: r2(pct(a.revSale - a.costFee, a.costFee)),
    rejected_revenue: r2(a.revRejected),
  }
}

function matches(c: Click, f: ReportFilter, tz: string) {
  const v = dimensionValue(c, f.name, tz)
  const e = f.expression
  const list = (Array.isArray(e) ? e : [e]).map(String)
  switch (f.operator) {
    case "EQUALS": return v === String(e)
    case "NOT_EQUAL": return v !== String(e)
    case "CONTAINS": return v.toLowerCase().includes(String(e).toLowerCase())
    case "NOT_CONTAIN": return !v.toLowerCase().includes(String(e).toLowerCase())
    case "IN_LIST": return list.includes(v)
    case "NOT_IN_LIST": return !list.includes(v)
    case "GREATER_THAN": return Number(v) > Number(e)
    case "LESS_THAN": return Number(v) < Number(e)
    case "IS_TRUE": return v === "true"
    case "IS_FALSE": return v === "false"
  }
}

export function filterClicks(req: Pick<ReportRequest, "range" | "filters">) {
  const tz = req.range.timezone
  const rr = resolveRange(req.range)
  return db.clicks.filter((c) => canSeeCampaign(c.campaign_id) && inRange(c.datetime, rr, tz) && req.filters.every((f) => matches(c, f, tz)))
}

// campaigns marked «Не учитывать в статистике» (the campaign still works; only the numbers skip it)
const excluded = (campaignId: number) => !!camp.get(campaignId)?.stats_excluded

export function buildReport(req: ReportRequest): ReportResponse {
  const tz = req.range.timezone
  // a filter on the campaign itself means «show this one»: links from the campaign page, problems, the click sheet
  const named = req.filters.some((f) => f.name === "campaign" || f.name === "campaign_id")
  const clicks = filterClicks(req).filter((c) => req.include_excluded || named || !excluded(c.campaign_id))
  const groups = new Map<string, { dims: string[]; acc: Acc }>()
  const total = empty()
  for (const c of clicks) {
    const dims = req.dimensions.map((d) => dimensionValue(c, d, tz))
    const key = dims.join("\u0001")
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { dims, acc: empty() }))
    add(g.acc, c)
    add(total, c)
  }
  let rows: ReportRow[] = [...groups.values()].map(({ dims, acc }) => {
    const row: ReportRow = {}
    req.dimensions.forEach((d, i) => (row[d] = dims[i]))
    const m = metricsOf(acc)
    for (const k of req.measures) row[k] = m[k] ?? null
    return row
  })
  const sort = req.sort[0] ?? (req.dimensions.some((d) => ["day", "hour", "month", "weekday"].includes(d))
    ? { name: req.dimensions[0], order: "DESC" as const }
    : { name: req.measures[0] ?? "clicks", order: "DESC" as const })
  rows.sort((a, b) => {
    const x = a[sort.name], y = b[sort.name]
    const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ru")
    return sort.order === "ASC" ? cmp : -cmp
  })
  const count = rows.length
  if (req.limit) rows = rows.slice(req.offset ?? 0, (req.offset ?? 0) + req.limit)
  const m = metricsOf(total)
  const summary: ReportRow = Object.fromEntries(req.measures.map((k) => [k, m[k] ?? null]))
  return { rows, total: count, summary }
}

// Per-entity stats used by list pages (campaigns, streams, offers ...). An excluded campaign still shows its own numbers
// (campaign and stream lists) but adds nothing to offers, landings, networks, sources.
export function statsBy(field: "campaign_id" | "stream_id" | "landing_id" | "offer_id" | "offer_group_id" | "ts_id" | "affiliate_network_id", range: ReportRequest["range"]) {
  const tz = range.timezone
  const rr = resolveRange(range)
  const map = new Map<number, Acc>()
  for (const c of db.clicks) {
    if (!canSeeCampaign(c.campaign_id) || !inRange(c.datetime, rr, tz)) continue
    if (field !== "campaign_id" && field !== "stream_id" && excluded(c.campaign_id)) continue
    let id: number | null
    if (field === "affiliate_network_id") {
      const o = offr.get(c.offer_id ?? strm.get(c.stream_id)?.offers[0]?.offer_id ?? 0)
      id = o?.affiliate_network_id ?? null
    } else if (field === "offer_group_id") {
      id = offr.get(c.offer_id ?? strm.get(c.stream_id)?.offers[0]?.offer_id ?? 0)?.group_id ?? null
    } else if (field === "offer_id") {
      id = c.offer_id ?? strm.get(c.stream_id)?.offers[0]?.offer_id ?? null
    } else id = c[field] as number | null
    if (id == null) continue
    let a = map.get(id)
    if (!a) map.set(id, (a = empty()))
    add(a, c)
  }
  return new Map([...map].map(([id, a]) => [id, metricsOf(a)]))
}
