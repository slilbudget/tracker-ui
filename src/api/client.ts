// API client. Today it answers from the in-memory mock; each function is one backend endpoint.
// Swap the bodies for fetch() calls when the Go API is ready, keeping the signatures.
import type {
  AffiliateNetwork, ApiKey, AuditEntry, Campaign, Click, Conversion, DateRange, Domain, Group, GroupType, ID,
  Landing, Offer, PostbackLogEntry, ReportFilter, ReportRequest, ReportResponse, Role, Settings,
  Stream, TrafficSource, User,
} from "./types"
import * as db from "@/mock/seed"
import { buildReport, filterClicks, statsBy } from "@/mock/report"
import { canSeeCampaign, viewerGroupIds, viewerUser } from "@/mock/scope"
import { inRange, resolveRange } from "@/lib/dates"
import { offersApi } from "./client-offers"
import { fbApi, problemsApi } from "./client-problems"
import { directoryApi } from "./client-directory"
import { accountsApi } from "./client-accounts"
import { statsApi } from "./client-stats"
import { integrationsApi, systemApi } from "./client-system"
import { catalogApi } from "./client-catalog"
import { nextId, now, wait } from "./mock-util"


class ApiError extends Error {
  fields?: Record<string, string>
  constructor(message: string, fields?: Record<string, string>) {
    super(message)
    this.fields = fields
  }
}

function crud<T extends { id: ID }>(table: T[], opts: { touch?: boolean } = {}) {
  return {
    list: () => wait(table.filter((x) => (x as { state?: string }).state !== "deleted")),
    archived: () => wait(table.filter((x) => (x as { state?: string }).state === "deleted")),
    get: (id: ID) => {
      const x = table.find((t) => t.id === id)
      if (!x) return Promise.reject(new ApiError("Не найдено"))
      return wait(x)
    },
    create: (data: Omit<T, "id">) => {
      const x = { ...data, id: nextId(table) } as T
      if (opts.touch) Object.assign(x, { created_at: now(), updated_at: now() })
      table.push(x)
      return wait(x)
    },
    update: (id: ID, patch: Partial<T>) => {
      const x = table.find((t) => t.id === id)
      if (!x) return Promise.reject(new ApiError("Не найдено"))
      Object.assign(x, patch, opts.touch ? { updated_at: now() } : {})
      return wait(x)
    },
    remove: (id: ID) => {
      const x = table.find((t) => t.id === id) as (T & { state?: string }) | undefined
      if (x && "state" in x) x.state = "deleted"
      else {
        const i = table.findIndex((t) => t.id === id)
        if (i >= 0) table.splice(i, 1)
      }
      return wait({ ok: true })
    },
    restore: (id: ID) => {
      const x = table.find((t) => t.id === id) as (T & { state?: string }) | undefined
      if (x) x.state = "active"
      return wait({ ok: true })
    },
  }
}

// The mock stores offer_id only after a landing click; the offer the stream sends to is the same one
// the reports and the click path show, so the log shows it too.
const withOffer = (c: Click): Click => (c.offer_id != null ? c : { ...c, offer_id: db.streams.find((s) => s.id === c.stream_id)?.offers[0]?.offer_id ?? null })

export const api = {
  campaigns: {
    ...crud<Campaign>(db.campaigns, { touch: true }),
    list: () => wait(db.campaigns.filter((c) => c.state !== "deleted" && canSeeCampaign(c.id))),
    // archived or outside the viewer's scope = not found
    get: (id: ID) => {
      const c = db.campaigns.find((x) => x.id === id)
      return c && c.state !== "deleted" && canSeeCampaign(id) ? wait(c) : Promise.reject(new ApiError("Кампания не найдена"))
    },
    // the owner is the current user (the backend takes it from the session)
    create: (data: Omit<Campaign, "id">) => {
      const c: Campaign = { ...data, id: nextId(db.campaigns), owner_id: viewerUser().id, created_at: now(), updated_at: now() }
      db.campaigns.push(c)
      return wait(c)
    },
    stats: (range: DateRange) => wait(Object.fromEntries(statsBy("campaign_id", range))),
    // «Обновить расходы» (as in Keitaro): the sum replaces the cost of the matching clicks of the period and is spread
    // evenly over them. The team's spend collector calls the same endpoint per ad / day (sub_id_6 = ad id).
    // Clicks are the only place cost lives: a period without clicks takes no cost (returns clicks: 0).
    updateCosts: (q: { campaign_id: ID; range: DateRange; cost: number; unique_only: boolean; sub_id_1?: string; sub_id_6?: string }) => {
      const rr = resolveRange(q.range)
      const rows = db.clicks.filter((c) =>
        c.campaign_id === q.campaign_id && canSeeCampaign(c.campaign_id) && inRange(c.datetime, rr, q.range.timezone) &&
        (!q.unique_only || c.is_unique_campaign) && (!q.sub_id_1 || c.sub_id_1 === q.sub_id_1) && (!q.sub_id_6 || c.sub_id_6 === q.sub_id_6))
      const each = rows.length ? q.cost / rows.length : 0
      for (const c of rows) c.cost = each
      return wait({ clicks: rows.length })
    },
    templateDiff: offersApi.templates.diff,
    applyTemplate: offersApi.templates.apply,
    clone: (id: ID) => {
      const src = db.campaigns.find((c) => c.id === id)
      if (!src || !canSeeCampaign(id)) return Promise.reject(new ApiError("Кампания не найдена"))
      // a copy of the reference is an ordinary campaign linked to it, owned by whoever cloned it
      const copy = {
        ...structuredClone(src), id: nextId(db.campaigns), name: `${src.name} (копия)`, created_at: now(), updated_at: now(), owner_id: viewerUser().id,
        is_template: false, template_id: src.is_template ? src.id : src.template_id,
      }
      db.campaigns.push(copy)
      for (const s of db.streams.filter((s) => s.campaign_id === id))
        db.streams.push({ ...structuredClone(s), id: nextId(db.streams), campaign_id: copy.id })
      return wait(copy)
    },
  },
  streams: {
    ...crud<Stream>(db.streams),
    byCampaign: (campaignId: ID) =>
      wait(canSeeCampaign(campaignId) ? db.streams.filter((s) => s.campaign_id === campaignId && s.state !== "deleted").sort((a, b) => a.position - b.position) : []),
    stats: (range: DateRange) => wait(Object.fromEntries(statsBy("stream_id", range))),
    // Bulk weight update: the split editor saves all weights in one call.
    setWeights: (weights: { id: ID; weight: number }[]) => {
      for (const w of weights) {
        const s = db.streams.find((x) => x.id === w.id)
        if (s) Object.assign(s, { weight: w.weight, updated_at: now() })
      }
      return wait({ ok: true })
    },
    reorder: (campaignId: ID, ids: ID[]) => {
      ids.forEach((id, i) => {
        const s = db.streams.find((x) => x.id === id && x.campaign_id === campaignId)
        if (s) s.position = i + 1
      })
      return wait({ ok: true })
    },
  },
  landings: { ...crud<Landing>(db.landings, { touch: true }), stats: (range: DateRange) => wait(Object.fromEntries(statsBy("landing_id", range))) },
  offers: { ...crud<Offer>(db.offers, { touch: true }), stats: (range: DateRange) => wait(Object.fromEntries(statsBy("offer_id", range))) },
  offerGroups: offersApi.offerGroups,
  offerSwap: offersApi.offerSwap,
  problems: problemsApi,
  adAccounts: accountsApi,
  approaches: directoryApi.approaches,
  adNaming: directoryApi.adNaming,
  fb: fbApi,
  stats: statsApi,
  system: systemApi,
  catalog: catalogApi,
  affiliateNetworks: {
    ...crud<AffiliateNetwork>(db.affiliateNetworks, { touch: true }),
    stats: (range: DateRange) => wait(Object.fromEntries(statsBy("affiliate_network_id", range))),
  },
  trafficSources: {
    ...crud<TrafficSource>(db.trafficSources, { touch: true }),
    stats: (range: DateRange) => wait(Object.fromEntries(statsBy("ts_id", range))),
  },
  domains: {
    ...crud<Domain>(db.domains),
    check: (id: ID) => {
      const d = db.domains.find((x) => x.id === id)
      if (d) d.next_check_at = new Date(Date.now() + 15 * 60000).toISOString()
      return wait(d)
    },
  },
  groups: {
    // campaign groups are access scopes: a scoped viewer gets only their own
    list: (type: GroupType) => wait(db.groups.filter((g) => g.type === type && (type !== "campaigns" || viewerGroupIds() == null || viewerGroupIds()!.includes(g.id)))),
    create: (g: Omit<Group, "id">) => {
      const x = { ...g, id: nextId(db.groups) }
      db.groups.push(x)
      return wait(x)
    },
    update: (id: ID, patch: Partial<Group>) => {
      Object.assign(db.groups.find((g) => g.id === id) ?? {}, patch)
      return wait({ ok: true })
    },
    remove: (id: ID) => {
      const i = db.groups.findIndex((g) => g.id === id)
      if (i >= 0) db.groups.splice(i, 1)
      return wait({ ok: true })
    },
  },
  reports: {
    build: (req: ReportRequest): Promise<ReportResponse> => wait(buildReport(req)),
  },
  clicks: {
    log: (q: { range: DateRange; filters: ReportFilter[]; search?: string; limit: number; offset: number }) => {
      let rows = filterClicks(q)
      if (q.search) rows = rows.filter((c) => c.sub_id.includes(q.search!) || c.ip.includes(q.search!) || c.external_id.includes(q.search!))
      return wait({ rows: rows.slice(q.offset, q.offset + q.limit).map(withOffer), total: rows.length })
    },
    get: (subId: string) => { const c = db.clicks.find((x) => x.sub_id === subId && canSeeCampaign(x.campaign_id)); return wait(c ? withOffer(c) : null) },
  },
  conversions: {
    log: (q: { range: DateRange; search?: string; status?: string; campaign_id?: ID; network_id?: ID; buyer_id?: ID; limit: number; offset: number }) => {
      const rr = resolveRange(q.range)
      let rows = db.conversions.filter((c) => canSeeCampaign(c.campaign_id) && inRange(c.postback_datetime, rr, q.range.timezone))
      if (q.status) rows = rows.filter((c) => c.status === q.status)
      if (q.campaign_id) rows = rows.filter((c) => c.campaign_id === q.campaign_id)
      if (q.network_id) rows = rows.filter((c) => db.offers.find((o) => o.id === c.offer_id)?.affiliate_network_id === q.network_id)
      if (q.buyer_id) rows = rows.filter((c) => db.campaigns.find((x) => x.id === c.campaign_id)?.owner_id === q.buyer_id)
      if (q.search) rows = rows.filter((c) => c.sub_id.includes(q.search!) || c.tid.includes(q.search!))
      return wait({ rows: rows.slice(q.offset, q.offset + q.limit) as Conversion[], total: rows.length })
    },
  },
  postbacks: {
    log: (q: { direction?: "in" | "out"; result?: string; search?: string; limit: number; offset: number }) => {
      let rows = db.postbackLog.filter((p) => p.campaign_id == null ? canSeeCampaign(null) : canSeeCampaign(p.campaign_id))
      if (q.direction) rows = rows.filter((p) => p.direction === q.direction)
      if (q.result) rows = rows.filter((p) => p.result === q.result)
      if (q.search) rows = rows.filter((p) => p.sub_id.includes(q.search!) || p.url.includes(q.search!))
      return wait({ rows: rows.slice(q.offset, q.offset + q.limit) as PostbackLogEntry[], total: rows.length })
    },
    summary: () => {
      const day = Date.now() - 86400000
      const last = db.postbackLog.filter((p) => Date.parse(p.datetime) > day && canSeeCampaign(p.campaign_id))
      return wait({
        in_ok: last.filter((p) => p.direction === "in" && p.result === "ok").length,
        in_errors: last.filter((p) => p.direction === "in" && p.result !== "ok").length,
        out_ok: last.filter((p) => p.direction === "out" && p.result === "ok").length,
        out_errors: last.filter((p) => p.direction === "out" && p.result !== "ok").length,
        zero_payout: last.filter((p) => p.direction === "in" && p.status === "dep" && p.payout === 0).length,
        last_in_at: db.postbackLog.find((p) => p.direction === "in")?.datetime ?? null,
      })
    },
  },
  users: { ...crud<User>(db.users) },
  roles: { ...crud<Role>(db.roles) },
  apiKeys: {
    list: (userId?: ID) => wait(db.apiKeys.filter((k) => !userId || k.user_id === userId)),
    create: (userId: ID, name: string) => {
      const k: ApiKey = { id: nextId(db.apiKeys), user_id: userId, name, prefix: `trk_${Math.random().toString(16).slice(2, 6)}`, created_at: now(), last_used_at: null }
      db.apiKeys.push(k)
      return wait({ ...k, secret: `${k.prefix}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}` })
    },
    remove: (id: ID) => {
      const i = db.apiKeys.findIndex((k) => k.id === id)
      if (i >= 0) db.apiKeys.splice(i, 1)
      return wait({ ok: true })
    },
  },
  audit: { list: () => wait(db.audit as AuditEntry[]) },
  integrations: integrationsApi,
  settings: {
    get: () => wait(db.settings as Settings),
    update: (patch: Partial<Settings>) => wait(Object.assign(db.settings, patch)),
  },
  me: () => wait(viewerUser()),
  // Global search: by name or exact ID in every section, plus an exact subid → the click.
  search: (q: string) => {
    const s = q.trim().toLowerCase()
    if (!s) return wait([])
    const hit = (x: { id: number; name: string }) => x.name.toLowerCase().includes(s) || String(x.id) === s
    const campName = (id: number) => db.campaigns.find((c) => c.id === id)?.name ?? ""
    const click = s.length >= 6 ? db.clicks.find((c) => c.sub_id.toLowerCase() === s && canSeeCampaign(c.campaign_id)) : undefined
    return wait([
      ...(click ? [{ type: "click" as const, id: 0, name: click.sub_id, hint: campName(click.campaign_id) }] : []),
      ...db.campaigns.filter((x) => x.state !== "deleted" && canSeeCampaign(x.id) && hit(x)).map((x) => ({ type: "campaign" as const, id: x.id, name: x.name, hint: "" })),
      ...db.streams.filter((x) => x.state !== "deleted" && canSeeCampaign(x.campaign_id) && hit(x)).slice(0, 10).map((x) => ({ type: "stream" as const, id: x.id, name: x.name, campaign_id: x.campaign_id, hint: campName(x.campaign_id) })),
      ...db.offers.filter(hit).map((x) => ({ type: "offer" as const, id: x.id, name: x.name, hint: "" })),
      ...db.landings.filter(hit).map((x) => ({ type: "landing" as const, id: x.id, name: x.name, hint: "" })),
      ...db.affiliateNetworks.filter(hit).map((x) => ({ type: "affiliate_network" as const, id: x.id, name: x.name, hint: "" })),
      ...db.trafficSources.filter(hit).map((x) => ({ type: "traffic_source" as const, id: x.id, name: x.name, hint: "" })),
      ...db.domains.filter(hit).map((x) => ({ type: "domain" as const, id: x.id, name: x.name, hint: "" })),
      ...db.users.filter((x) => x.login.toLowerCase().includes(s) || String(x.id) === s).map((x) => ({ type: "user" as const, id: x.id, name: x.login, hint: "" })),
    ].slice(0, 40))
  },
}
