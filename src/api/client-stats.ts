// Extra endpoints for the reports / dashboard / logs screens (mock bodies over the seed):
// id → name dictionaries, conversion edits (status / payout with a reason), CSV import, click path.
import type { Click, Conversion, ConversionStatus, ID, StreamFilter } from "./types"
import { streamFilterDef } from "./meta"
import * as db from "@/mock/seed"
import { registerConversion } from "@/mock/report"
import { audit, wait } from "./mock-util"

const names = <T extends { id: number; name: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x.name])) as Record<number, string>
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("")

// ---------- conversions ----------

export interface ImportRow {
  line: number
  subid: string
  status: ConversionStatus
  payout: number | null // null = take from the offer for sales, 0 otherwise
  tid: string
  reason: string // rejected only: chargeback, multi-account … (4th CSV column)
}
interface ImportCheck {
  line: number
  action: "create" | "update" | null
  error: string | null
}


// Payout a conversion gets when the user did not set one.
function defaultPayout(c: Pick<Conversion, "offer_id">, status: ConversionStatus) {
  if (status === "rejected" || status === "lead" || status === "registration") return 0
  return db.offers.find((o) => o.id === c.offer_id)?.payout_value ?? 0
}

const logAudit = (summary: string) => audit("conversions", summary)

// The one status transition used by manual edits and the CSV import, so both leave the same data:
// a rejection keeps the lost payout and the reason; leaving «rejected» clears both.
function setStatus(c: Conversion, status: ConversionStatus, reason = "") {
  if (status === c.status) { if (status === "rejected" && reason) c.reject_reason = reason; return }
  if (status === "rejected") { c.rejected_revenue = c.revenue; c.reject_reason = reason }
  else { c.rejected_revenue = 0; c.reject_reason = "" }
  c.previous_status = c.status
  c.status = status
}

const STATUS_RU: Record<ConversionStatus, string> = {
  lead: "лид", sale: "продажа", rejected: "отклонено", rebill: "повторная", registration: "регистрация", deposit: "депозит",
}

function matchRow(r: ImportRow) {
  // a conversion of the same click; when a TID is given it must match too
  return db.conversions.find((c) => c.sub_id === r.subid && (!r.tid || c.tid === r.tid))
}

const conversionsApi = {
  get: (id: string) => wait(db.conversions.find((c) => c.conversion_id === id) ?? null),

  // Status and / or payout for one or many conversions. The reason goes to the audit log.
  update: (ids: string[], patch: { status?: ConversionStatus; revenue?: number; reason: string; reject_reason?: string }) => {
    let n = 0
    for (const id of ids) {
      const c = db.conversions.find((x) => x.conversion_id === id)
      if (!c) continue
      if (patch.status && patch.status !== c.status) {
        setStatus(c, patch.status, patch.reject_reason)
        // payout follows the status unless it is set explicitly
        if (patch.revenue === undefined) c.revenue = c.revenue > 0 && patch.status !== "rejected" ? c.revenue : defaultPayout(c, patch.status)
      }
      if (patch.revenue !== undefined) c.revenue = patch.revenue
      n++
    }
    if (n) {
      const what = [patch.status ? `статус → ${STATUS_RU[patch.status]}` : "", patch.revenue !== undefined ? `выплата → ${patch.revenue}$` : ""].filter(Boolean).join(", ")
      logAudit(`Конверсии (${n}): ${what}. Причина: ${patch.reason || "не указана"}`)
    }
    return wait({ updated: n })
  },

  // Manual add: one conversion for an existing click.
  create: (row: Omit<ImportRow, "line">) => {
    const click = db.clicks.find((c) => c.sub_id === row.subid)
    if (!click) return Promise.reject(new Error("Клик с таким subid не найден"))
    const conv = fromClick(click, row)
    db.conversions.unshift(conv)
    registerConversion(conv)
    logAudit(`Конверсия добавлена вручную: ${row.subid}, ${STATUS_RU[row.status]}`)
    return wait(conv)
  },

  // Dry run of a CSV import: which lines create / update a conversion and which fail.
  previewImport: (rows: ImportRow[]) => {
    const clicks = new Map<string, Click>()
    const wanted = new Set(rows.map((r) => r.subid))
    for (const c of db.clicks) if (wanted.has(c.sub_id)) clicks.set(c.sub_id, c)
    return wait(
      rows.map((r): ImportCheck => {
        if (!clicks.has(r.subid)) return { line: r.line, action: null, error: "клик с таким subid не найден" }
        return { line: r.line, action: matchRow(r) ? "update" : "create", error: null }
      }),
    )
  },

  importRows: (rows: ImportRow[]) => {
    let created = 0, updated = 0
    for (const r of rows) {
      const click = db.clicks.find((c) => c.sub_id === r.subid)
      if (!click) continue
      const ex = matchRow(r)
      if (ex) {
        setStatus(ex, r.status, r.reason)
        ex.revenue = r.payout ?? defaultPayout(ex, r.status)
        updated++
      } else {
        const conv = fromClick(click, r)
        db.conversions.unshift(conv)
        registerConversion(conv)
        created++
      }
    }
    logAudit(`Загрузка конверсий из CSV: создано ${created}, обновлено ${updated}`)
    return wait({ created, updated })
  },
}

function fromClick(click: Click, r: Pick<ImportRow, "status" | "payout" | "tid"> & { reason?: string }): Conversion {
  const offer_id = click.offer_id ?? db.streams.find((s) => s.id === click.stream_id)?.offers[0]?.offer_id ?? null
  return {
    conversion_id: hex(16), sub_id: click.sub_id, campaign_id: click.campaign_id, stream_id: click.stream_id, landing_id: click.landing_id,
    offer_id, click_datetime: click.datetime, postback_datetime: new Date().toISOString(), status: r.status, original_status: r.status,
    previous_status: null, revenue: r.payout ?? defaultPayout({ offer_id }, r.status), tid: r.tid || hex(10),
    reject_reason: r.status === "rejected" ? r.reason ?? "" : "", rejected_revenue: 0,
  }
}

// ---------- click path ----------

export interface PathCheck { filter: string; mode: StreamFilter["mode"]; payload: string[]; ok: boolean | null }
interface PathStep {
  stream_id: ID
  name: string
  type: "forced" | "regular" | "default"
  checks: PathCheck[]
  passed: boolean
  chosen: boolean
}
interface ClickPath {
  campaign: { id: ID; name: string } | null
  steps: PathStep[]
  stream: { id: ID; name: string; campaign_id: ID } | null
  landing: { id: ID; name: string } | null
  offer: { id: ID; name: string; network: { id: ID; name: string } | null } | null
}

// Demo evaluation: only filters the click carries data for; others are "not evaluated" (null).
function evalFilter(f: StreamFilter, c: Click): boolean | null {
  const has = (v: string) => f.payload.some((p) => p.toLowerCase() === v.toLowerCase())
  let hit: boolean
  switch (f.name) {
    case "country": hit = has(c.country); break
    case "region": hit = has(c.region); break
    case "city": hit = has(c.city); break
    case "os": hit = has(c.os); break
    case "browser": hit = has(c.browser); break
    case "device_type": hit = has(c.device_type); break
    case "connection_type": hit = has(c.connection_type); break
    case "bot": hit = c.is_bot === (f.payload[0] !== "0"); break
    default: return null
  }
  return f.mode === "accept" ? hit : !hit
}

const clickPath = (subId: string) => {
  const c = db.clicks.find((x) => x.sub_id === subId)
  if (!c) return wait<ClickPath | null>(null)
  const camp = db.campaigns.find((x) => x.id === c.campaign_id)
  const rank = { forced: 0, regular: 1, default: 2 } as const
  const streams = db.streams
    .filter((s) => s.campaign_id === c.campaign_id && s.state === "active")
    .sort((a, b) => rank[a.type] - rank[b.type] || a.position - b.position)
  const steps: PathStep[] = streams.map((s) => {
    const checks = s.filters.map((f): PathCheck => ({ filter: streamFilterDef(f.name)?.name ?? f.name, mode: f.mode, payload: f.payload, ok: evalFilter(f, c) }))
    const results = checks.map((x) => x.ok).filter((x): x is boolean => x !== null)
    const passed = s.id === c.stream_id || (s.filter_or ? results.some(Boolean) || !results.length : results.every(Boolean))
    return { stream_id: s.id, name: s.name, type: s.type, checks, passed, chosen: s.id === c.stream_id }
  })
  const stream = db.streams.find((s) => s.id === c.stream_id)
  const landing = c.landing_id ? db.landings.find((l) => l.id === c.landing_id) : null
  const offerId = c.offer_id ?? stream?.offers[0]?.offer_id
  const offer = offerId ? db.offers.find((o) => o.id === offerId) : null
  const net = offer?.affiliate_network_id ? db.affiliateNetworks.find((n) => n.id === offer.affiliate_network_id) : null
  return wait<ClickPath | null>({
    campaign: camp ? { id: camp.id, name: camp.name } : null,
    steps,
    stream: stream ? { id: stream.id, name: stream.name, campaign_id: stream.campaign_id } : null,
    landing: landing ? { id: landing.id, name: landing.name } : null,
    offer: offer ? { id: offer.id, name: offer.name, network: net ? { id: net.id, name: net.name } : null } : null,
  })
}

export const statsApi = {
  // id → name dictionaries for resolving ids in click / conversion logs.
  names: () =>
    wait({
      campaigns: names(db.campaigns),
      streams: names(db.streams),
      landings: names(db.landings),
      offers: names(db.offers),
      sources: names(db.trafficSources),
      networks: names(db.affiliateNetworks),
      buyers: Object.fromEntries(db.users.map((u) => [u.id, u.login])) as Record<number, string>,
      // offer → its affiliate network, campaign → its buyer (log columns «Партнёрка» and «Байер»)
      offerNetwork: Object.fromEntries(db.offers.map((o) => [o.id, o.affiliate_network_id])) as Record<number, number>,
      campaignOwner: Object.fromEntries(db.campaigns.map((c) => [c.id, c.owner_id])) as Record<number, number>,
    }),
  conversions: conversionsApi,
  clickPath,
}
export type Names = Awaited<ReturnType<typeof statsApi.names>>
