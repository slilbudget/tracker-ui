// Offer groups with caps, mass offer replacement and reference («эталонные») campaigns.
// Same contract style as client.ts: each function is one backend endpoint.
import type {
  CapProgress, ID, OfferGroup, OfferGroupCap, OfferSwapRequest, OfferSwapRow, Stream, StreamFilter, StreamOffer, TemplateDiff,
} from "./types"
import * as db from "@/mock/seed"
import { canSeeCampaign } from "@/mock/scope"
import { statsBy } from "@/mock/report"
import { audit, nextId, now, wait } from "./mock-util"

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const log = (summary: string, resource: "offers" | "campaigns" | "streams", resource_id: ID | null) => audit(resource, summary, resource_id)

// ---------- caps ----------

// FTD = confirmed sales of the group's offers. Install = a unique click of the tracker link
// (the visitor reached the link from the installed PWA), counted on the campaign level.
export function capOf(g: OfferGroup): OfferGroupCap {
  const today = ymd(new Date())
  const term = g.terms.find((t) => t.from <= today && today <= t.to) ?? null
  if (!term) return { term: null, caps: [], pct: 0, status: g.terms.length ? "no_term" : "none" }
  const ids = new Set(db.offers.filter((o) => o.group_id === g.id).map((o) => o.id))
  const termStart = new Date(`${term.from}T00:00:00`)
  const dayStart = new Date(`${today}T00:00:00`)
  const caps: CapProgress[] = term.caps.map((c) => {
    const from = c.window === "day" ? dayStart : termStart
    const done = c.metric === "ftd"
      ? db.conversions.filter((cv) => cv.status === "sale" && cv.offer_id != null && ids.has(cv.offer_id) && new Date(cv.postback_datetime) >= from).length
      : db.clicks.filter((ck) => ck.is_unique_campaign && ck.offer_id != null && ids.has(ck.offer_id) && new Date(ck.datetime) >= from).length
    return { ...c, done }
  })
  const pct = caps.reduce((m, c) => Math.max(m, c.value ? (c.done / c.value) * 100 : 0), 0)
  // «warn» from the lowest alert threshold below 100% (80% when none is set)
  const below = g.alert_at.filter((x) => x < 100)
  const warnAt = below.length ? Math.min(...below) : 80
  const status = !caps.length ? "none" : pct >= 100 ? "full" : pct >= warnAt ? "warn" : "ok"
  return { term, caps, pct, status }
}

// ---------- offer replacement ----------

interface SwapRecord {
  id: ID; datetime: string; user_id: ID; from_offer_id: ID; to_offer_id: ID | null; streams: number; campaigns: number; undone: boolean
  snapshot: { stream_id: ID; offers: StreamOffer[]; filters: StreamFilter[] }[]
}
// two earlier replacements for the history (no snapshot: too old to undo)
const general = db.offers.filter((o) => !o.regions.length && o.country.includes("US"))
const swaps: SwapRecord[] = general.length < 8 ? [] : [
  { id: 2, datetime: new Date(Date.now() - 26 * 3600000).toISOString(), user_id: 2, from_offer_id: general[1].id, to_offer_id: general[4].id, streams: 7, campaigns: 6, undone: false, snapshot: [] },
  { id: 1, datetime: new Date(Date.now() - 74 * 3600000).toISOString(), user_id: 1, from_offer_id: general[7].id, to_offer_id: null, streams: 4, campaigns: 4, undone: false, snapshot: [] },
]

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

function swapRows(q: OfferSwapRequest): OfferSwapRow[] {
  const from = db.offers.find((o) => o.id === q.from_offer_id)
  const to = q.to_offer_id != null ? db.offers.find((o) => o.id === q.to_offer_id) : null
  // the same offer, or a target that does not exist / is archived: nothing to replace
  if (!from || q.to_offer_id === from.id || (q.to_offer_id != null && (!to || to.state === "deleted"))) return []
  const live = new Set(db.campaigns.filter((c) => c.state !== "deleted" && canSeeCampaign(c.id)).map((c) => c.id))
  return db.streams
    .filter((s) => s.state !== "deleted" && live.has(s.campaign_id) && s.offers.some((x) => x.offer_id === from.id))
    .filter((s) => !q.stream_ids || q.stream_ids.includes(s.id))
    .map((s) => {
      const old = s.offers.find((x) => x.offer_id === from.id)!
      let after: StreamOffer[]
      if (!to) {
        const rest = s.offers.filter((x) => x.offer_id !== from.id)
        const sum = rest.reduce((a, x) => a + x.share, 0)
        // the removed share goes to the remaining offers in proportion; last one takes the rounding
        after = rest.map((x) => ({ ...x, share: sum ? Math.round((x.share / sum) * 100) : Math.round(100 / rest.length) }))
        const diff = 100 - after.reduce((a, x) => a + x.share, 0)
        if (after.length) after[after.length - 1].share += diff
      } else if (s.offers.some((x) => x.offer_id === to.id)) {
        after = s.offers.filter((x) => x.offer_id !== from.id).map((x) => (x.offer_id === to.id ? { ...x, share: x.share + old.share } : x))
      } else {
        after = s.offers.map((x) => (x.offer_id === from.id ? { ...x, offer_id: to.id } : x))
      }
      // a state filter that only repeated the old offer's restriction is no longer needed
      let filtersAfter = s.filters
      if (q.drop_geo_filters && from.regions.length) {
        const stillNeeded = after.some((x) => sameSet(db.offers.find((o) => o.id === x.offer_id)?.regions ?? [], from.regions))
        if (!stillNeeded) filtersAfter = s.filters.filter((f) => !(f.name === "region" && f.mode === "accept" && sameSet(f.payload, from.regions)))
      }
      return {
        campaign_id: s.campaign_id, stream_id: s.id, stream_name: s.name,
        before: s.offers, after, filters_before: s.filters, filters_after: filtersAfter,
      }
    })
}

// ---------- reference campaigns ----------

const signature = (s: Stream) =>
  JSON.stringify([s.type, s.state, s.schema, s.action_type, s.action_payload, s.filter_or, s.filters, s.landings, s.offers, s.offer_selection])
const liveStreams = (cid: ID) => db.streams.filter((s) => s.campaign_id === cid && s.state !== "deleted")

export const offersApi = {
  offerGroups: {
    list: () => wait(db.offerGroups.filter((g) => g.state !== "deleted")),
    caps: () => wait(Object.fromEntries(db.offerGroups.map((g) => [g.id, capOf(g)]))),
    stats: (range: Parameters<typeof statsBy>[1]) => wait(Object.fromEntries(statsBy("offer_group_id", range))),
    create: (v: Omit<OfferGroup, "id">) => {
      const g = { ...v, id: nextId(db.offerGroups), created_at: now(), updated_at: now() }
      db.offerGroups.push(g)
      return wait(g)
    },
    // Saving the terms also moves each offer's current rate (payout_value), which the revenue of new FTDs uses.
    update: (id: ID, patch: Partial<OfferGroup>) => {
      const g = db.offerGroups.find((x) => x.id === id)
      if (!g) return Promise.reject(new Error("Оффер-группа не найдена"))
      Object.assign(g, patch, { updated_at: now() })
      const today = ymd(new Date())
      const term = g.terms.find((t) => t.from <= today && today <= t.to)
      if (term) for (const [oid, rate] of Object.entries(term.payouts)) {
        const o = db.offers.find((x) => x.id === Number(oid))
        if (o) o.payout_value = rate
      }
      return wait(g)
    },
    remove: (id: ID) => {
      const g = db.offerGroups.find((x) => x.id === id)
      if (g) g.state = "deleted"
      return wait({ ok: true })
    },
  },

  offerSwap: {
    // Every stream of the campaigns the user may change that holds the offer, with the result of the replacement.
    preview: (q: OfferSwapRequest) => wait(swapRows(q)),
    // where the offer stands now: streams and campaigns the user may change
    usage: (offerId: ID) => {
      const rows = swapRows({ from_offer_id: offerId, to_offer_id: null, drop_geo_filters: false })
      return wait({ streams: rows.length, campaigns: new Set(rows.map((r) => r.campaign_id)).size })
    },
    apply: (q: OfferSwapRequest) => {
      if (q.to_offer_id === q.from_offer_id) return Promise.reject(new Error("Оффер нельзя заменить им же"))
      const rows = swapRows(q)
      const rec: SwapRecord = {
        id: nextId(swaps), datetime: now(), user_id: db.CURRENT_USER_ID, from_offer_id: q.from_offer_id, to_offer_id: q.to_offer_id,
        streams: rows.length, campaigns: new Set(rows.map((r) => r.campaign_id)).size, undone: false,
        snapshot: rows.map((r) => ({ stream_id: r.stream_id, offers: structuredClone(r.before), filters: structuredClone(r.filters_before) })),
      }
      for (const r of rows) {
        const s = db.streams.find((x) => x.id === r.stream_id)
        if (s) Object.assign(s, { offers: r.after, filters: r.filters_after, updated_at: now() })
      }
      swaps.unshift(rec)
      const name = (id: ID | null) => (id == null ? "—" : db.offers.find((o) => o.id === id)?.name ?? `#${id}`)
      log(`Замена оффера «${name(q.from_offer_id)}» → ${q.to_offer_id ? `«${name(q.to_offer_id)}»` : "убран"}: потоков ${rec.streams}, кампаний ${rec.campaigns}`, "offers", q.from_offer_id)
      return wait({ id: rec.id, streams: rec.streams, campaigns: rec.campaigns })
    },
    undo: (id: ID) => {
      const rec = swaps.find((x) => x.id === id)
      if (!rec || rec.undone || !rec.snapshot.length) return Promise.reject(new Error("Эту замену уже нельзя отменить"))
      for (const snap of rec.snapshot) {
        const s = db.streams.find((x) => x.id === snap.stream_id)
        if (s) Object.assign(s, { offers: snap.offers, filters: snap.filters, updated_at: now() })
      }
      rec.undone = true
      log(`Отменена замена оффера #${rec.from_offer_id}: потоков ${rec.streams}`, "offers", rec.from_offer_id)
      return wait({ ok: true })
    },
    history: () => wait(swaps.map(({ snapshot, ...r }) => ({ ...r, can_undo: !r.undone && snapshot.length > 0 }))),
  },

  templates: {
    // What «Применить к кампаниям» would change in every linked campaign (streams matched by name, weights ignored).
    diff: (templateId: ID): Promise<TemplateDiff[]> => {
      const tpl = liveStreams(templateId)
      const linked = db.campaigns.filter((c) => c.template_id === templateId && c.state !== "deleted" && canSeeCampaign(c.id))
      return wait(linked.map((c) => {
        const own = liveStreams(c.id)
        const byName = new Map(own.map((s) => [s.name, s]))
        const tplNames = new Set(tpl.map((s) => s.name))
        return {
          campaign_id: c.id,
          added: tpl.filter((s) => !byName.has(s.name)).map((s) => s.name),
          removed: own.filter((s) => !tplNames.has(s.name)).map((s) => s.name),
          changed: tpl.filter((s) => byName.has(s.name) && signature(byName.get(s.name)!) !== signature(s)).map((s) => s.name),
        }
      }))
    },
    // Streams of the campaigns become copies of the reference; keepWeights keeps each campaign's own weight of a same-name stream.
    apply: (templateId: ID, campaignIds: ID[], keepWeights: boolean) => {
      const tpl = liveStreams(templateId)
      const tplName = db.campaigns.find((c) => c.id === templateId)?.name ?? `#${templateId}`
      for (const cid of campaignIds) {
        const own = liveStreams(cid)
        const weight = new Map(own.map((s) => [s.name, s.weight]))
        for (const s of own) s.state = "deleted"
        for (const s of tpl) {
          db.streams.push({
            ...structuredClone(s), id: nextId(db.streams), campaign_id: cid, updated_at: now(),
            weight: keepWeights && weight.has(s.name) ? weight.get(s.name)! : s.weight,
          })
        }
        const c = db.campaigns.find((x) => x.id === cid)
        if (c) c.updated_at = now()
      }
      log(`Эталон «${tplName}» применён к кампаниям: ${campaignIds.length}`, "campaigns", templateId)
      return wait({ campaigns: campaignIds.length })
    },
  },
}
