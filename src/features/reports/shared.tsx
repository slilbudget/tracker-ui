// Small pieces shared by reports, logs, trends and dashboard.
import { useMemo, useState } from "react"
import { Link } from "react-router"
import { useQueries, useQuery } from "@tanstack/react-query"
import type { ConversionStatus, DateRange, ReportFilter } from "@/api/types"
import { api } from "@/api/client"

import { COUNTRIES, REJECT_REASONS, STREAM_FILTERS } from "@/api/meta"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StateDot } from "@/components/common"

// Campaign select backed by api.campaigns.list. value = campaign id as string, "" = all.
export function CampaignSelect({ value, onChange, className = "w-52" }: { value: string; onChange: (v: string) => void; className?: string }) {
  const list = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })
  return (
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger className={className}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Все кампании</SelectItem>
        {list.data?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function useNames() {
  return useQuery({ queryKey: ["names"], queryFn: api.stats.names, staleTime: 60_000 })
}

// Page index that resets when `resetKey` changes (filters, search, period).
export function usePage(resetKey: string, initialSize = 50) {
  const [state, setState] = useState({ key: resetKey, page: 0, size: initialSize })
  const page = state.key === resetKey ? state.page : 0
  return {
    page,
    size: state.size,
    setPage: (p: number) => setState({ ...state, key: resetKey, page: p }),
    setSize: (s: number) => setState({ key: resetKey, page: 0, size: s }),
  }
}

// ---------- filters in the URL ----------

export function decodeFilters(raw: string | null | undefined): ReportFilter[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((f) => f && typeof f.name === "string" && typeof f.operator === "string") : []
  } catch {
    return []
  }
}
export const encodeFilters = (f: ReportFilter[]) => (f.length ? JSON.stringify(f) : "")

// Query string fragment with the period, to pass it to another page.
export function periodQuery(range: DateRange) {
  const p = new URLSearchParams({ period: range.interval })
  if (range.interval === "custom" && range.from && range.to) { p.set("from", range.from); p.set("to", range.to) }
  return p
}

export function reportLink(opts: { g: string[]; filters?: ReportFilter[]; range: DateRange }) {
  const p = periodQuery(opts.range)
  p.set("g", opts.g.join(","))
  if (opts.filters?.length) p.set("f", encodeFilters(opts.filters))
  return `/reports?${p.toString()}`
}

// ---------- dates ----------

// "2026-11-09" (a day key from a report) → "09.11.2026". Same format as formatDate / formatDateTime in lib/dates.
export const fmtDayKey = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(k) ? k.split("-").reverse().join(".") : k)

// ---------- conversion statuses ----------

// Status = dot + text, like every other status column (sale green, rejected red, lead neutral).
const STATUS_DOT: Record<ConversionStatus, string> = {
  sale: "active", deposit: "active", rebill: "active", lead: "", registration: "", rejected: "error",
}
export const STATUS_SHORT: Record<ConversionStatus, string> = {
  sale: "Продажа", lead: "Лид", rejected: "Отклонено", rebill: "Повторная", registration: "Регистрация", deposit: "Депозит",
}

export function ConversionStatusCell({ status }: { status: ConversionStatus }) {
  return (
    <span className="flex items-center gap-2">
      <StateDot state={STATUS_DOT[status]} />
      {STATUS_SHORT[status]}
    </span>
  )
}

// ---------- links to entities (names instead of raw ids) ----------

export type EntityKind = "campaign" | "stream" | "landing" | "offer" | "source" | "network" | "buyer"
const ENTITY_PATH: Record<EntityKind, (id: number, parent?: number) => string> = {
  campaign: (id) => `/campaigns/${id}`,
  stream: (id, parent) => (parent ? `/campaigns/${parent}?stream=${id}` : `/campaigns`),
  landing: (id) => `/landings?edit=${id}`,
  offer: (id) => `/offers?edit=${id}`,
  source: (id) => `/traffic-sources?edit=${id}`,
  network: (id) => `/affiliate-networks?edit=${id}`,
  buyer: (id) => `/users?edit=${id}`,
}

// Names in one column share a long prefix ("US | PWA/iOS | "): tables show the part that differs, the full name stays in the title.
export function commonPrefix(names: string[]) {
  if (names.length < 3) return ""
  const parts = names.map((n) => n.split(" | "))
  let i = 0
  while (i < parts[0].length - 1 && parts.every((p) => p.length > i + 1 && p[i] === parts[0][i])) i++
  return parts[0].slice(0, i).map((x) => x + " | ").join("")
}
// Common prefix per entity column of a log page (campaign / stream / landing / offer), from the rows on screen.
export function useColumnPrefixes<T extends { campaign_id: number; stream_id: number; landing_id: number | null; offer_id: number | null }>(
  rows: T[] | undefined, nm: ReturnType<typeof useNames>["data"],
) {
  return useMemo(() => {
    if (!rows || !nm) return { campaign: "", stream: "", landing: "", offer: "" }
    const of = (ids: (number | null)[], map: Record<number, string>) => commonPrefix(ids.map((id) => (id == null ? "" : map[id] ?? "")).filter(Boolean))
    return {
      campaign: of(rows.map((r) => r.campaign_id), nm.campaigns),
      stream: of(rows.map((r) => r.stream_id), nm.streams),
      landing: of(rows.map((r) => r.landing_id), nm.landings),
      offer: of(rows.map((r) => r.offer_id), nm.offers),
    }
  }, [rows, nm])
}
export const stripPrefix = (name: string, prefix?: string) => (prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name)

// Long names are cut in the middle, so the end that tells «150$» from «175$» stays visible: the head shrinks, the tail does not.
export function MidText({ text }: { text: string }) {
  const tail = 10
  if (text.length <= tail * 2) return <>{text}</>
  return (
    <>
      <span className="min-w-0 truncate whitespace-pre">{text.slice(0, -tail)}</span>
      <span className="shrink-0 whitespace-pre">{text.slice(-tail)}</span>
    </>
  )
}

// Name of an entity as a link to its page. Falls back to the id while names load.
export function EntityLink({ kind, id, name, parent, prefix }: { kind: EntityKind; id: number | null | undefined; name?: string; parent?: number; prefix?: string }) {
  if (id == null) return <span className="text-muted-foreground">—</span>
  return (
    <Link to={ENTITY_PATH[kind](id, parent)} onClick={(e) => e.stopPropagation()} title={name} className="inline-flex max-w-full text-link">
      <MidText text={name ? stripPrefix(name, prefix) : String(id)} />
    </Link>
  )
}

// Name of an entity as plain text (log rows: the whole row opens the sheet, links live inside it).
export function EntityName({ id, name, prefix }: { id: number | null | undefined; name?: string; prefix?: string }) {
  if (id == null) return <span className="text-muted-foreground">—</span>
  return <span title={name} className="inline-flex max-w-full"><MidText text={name ? stripPrefix(name, prefix) : String(id)} /></span>
}

// Cuts long names in table cells (full text goes to the title inside) so default columns fit 1280px.
export function Clip({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return <span data-cap className={cn("block truncate", compact ? "max-w-28 min-[1400px]:max-w-48" : "max-w-40 min-[1400px]:max-w-64")}>{children}</span>
}

// Subid as a link to its click. Used in every table except the click log itself (there the row is the click).
export function SubidLink({ subId }: { subId: string }) {
  return (
    <Link to={`/clicks?click=${subId}&period=all_time`} onClick={(e) => e.stopPropagation()} className="font-mono text-link">
      {subId}
    </Link>
  )
}

// ---------- value dictionaries for filters ----------

export interface Option { value: string; label: string }

const STATIC_OPTIONS: Record<string, Option[]> = {
  country: COUNTRIES.map((c) => ({ value: c.value, label: `${c.value} — ${c.label}` })),
  ...Object.fromEntries(
    ["region", "device_type", "os", "browser", "connection_type"].map((k) => [k, STREAM_FILTERS.find((f) => f.key === k)?.options ?? []]),
  ),
}

// Dimension key → allowed values, from the entity lists (campaign, stream, landing, offer, affiliate_network, ts, buyer)
// and static dictionaries (country, region, device, os, browser). Dimensions not in the map take free text.
// Report values are names (logins for buyer, ISO codes for country), so options carry the same strings.
export function useDictionaries(): Record<string, Option[]> {
  const res = useQueries({
    queries: [
      { queryKey: ["campaigns"], queryFn: api.campaigns.list },
      { queryKey: ["streams"], queryFn: api.streams.list },
      { queryKey: ["landings"], queryFn: api.landings.list },
      { queryKey: ["offers"], queryFn: api.offers.list },
      { queryKey: ["affiliateNetworks"], queryFn: api.affiliateNetworks.list },
      { queryKey: ["trafficSources"], queryFn: api.trafficSources.list },
      { queryKey: ["users"], queryFn: api.users.list },
      { queryKey: ["offerGroups"], queryFn: api.offerGroups.list },
      { queryKey: ["fbAccounts"], queryFn: api.fb.accounts },
      { queryKey: ["approaches"], queryFn: api.approaches.list },
    ],
  })
  const [cq, sq, lq, oq, nq, tq, uq, gq, aq, pq] = res
  const [campaigns, streams, landings, offers, networks, sources, users, offerGroups, accounts, approaches] = [cq.data, sq.data, lq.data, oq.data, nq.data, tq.data, uq.data, gq.data, aq.data, pq.data]
  return useMemo(() => {
    const plain = (xs: string[]): Option[] => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")).map((n) => ({ value: n, label: n }))
    const byName = (xs?: { name: string }[]): Option[] => plain((xs ?? []).map((x) => x.name))
    return {
      campaign: byName(campaigns), stream: byName(streams), landing: byName(landings), offer: byName(offers), offer_group: byName(offerGroups),
      affiliate_network: byName(networks), ts: byName(sources),
      buyer: (users ?? []).filter((u) => u.role_id === 3 || u.role_id === 5).map((u) => ({ value: u.login, label: u.login === u.name ? u.login : `${u.login} — ${u.name}` })),
      team: plain((users ?? []).map((u) => u.team).filter((t) => t !== "—")),
      approach: plain((approaches ?? []).map((a) => a.name)),
      product: plain((offerGroups ?? []).map((g) => g.product)),
      agency: plain((accounts ?? []).map((a) => a.agency)),
      fb_account: (accounts ?? []).map((a) => ({ value: `${a.name} · ${a.id}`, label: `${a.name} · ${a.id}` })),
      reject_reason: REJECT_REASONS.map((r) => ({ value: r.value, label: `${r.value} — ${r.label}` })),
      ...STATIC_OPTIONS,
    }
  }, [campaigns, streams, landings, offers, networks, sources, users, offerGroups, accounts, approaches])
}
