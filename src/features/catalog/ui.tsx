// Small form / filter helpers shared by offers, affiliate networks, traffic sources and domains.
import type { ReactNode } from "react"
import { METRICS, METRIC_PRESETS } from "@/api/meta"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", BRL: "R$", RUB: "₽" }
export const curSymbol = (c: string) => SYMBOL[c] ?? c

// Small heading that splits a sheet form into sections (instead of tabs).
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col pt-3 first:pt-0">
      <h3 className="pb-1 text-sm font-semibold">{title}</h3>
      <div className="flex flex-col">{children}</div>
    </div>
  )
}

// Filter select with an «all» option, value lives in the URL as a string ("" = all).
export function FilterSelect({
  value, onChange, allLabel, options, className = "w-44",
}: { value: string; onChange: (v: string) => void; allLabel: string; options: { value: string; label: string }[]; className?: string }) {
  return (
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger className={className}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

// Select of an optional reference (group, network, campaign...) with a «none» option.
export function RefSelect({
  value, onChange, noneLabel, options,
}: { value: number | null | undefined; onChange: (v: number | null) => void; noneLabel: string; options: { id: number; name: string }[] }) {
  return (
    <Select value={value ? String(value) : "none"} onValueChange={(v) => onChange(v === "none" ? null : Number(v))}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{noneLabel}</SelectItem>
        {options.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

// Metric columns in one canonical order (the order of METRICS in meta.ts), so every table lists the same metrics the same way.
export const sortMetrics = (keys: string[]) => {
  const rank = (k: string) => { const i = METRICS.findIndex((m) => m.key === k); return i < 0 ? 999 : i }
  return [...keys].sort((a, b) => rank(a) - rank(b))
}

// One metric set for every entity list (campaigns, landings, offers, networks, sources). The first nine are visible by default
// (confirmed money), the rest live in the «Колонки» picker. Order comes from METRICS in meta.ts via sortMetrics.
export const LIST_METRICS = METRIC_PRESETS[0].keys
// Every other metric is available in «Колонки» (hidden by default).
export const LIST_METRICS_EXTRA = METRICS.map((m) => m.key).filter((k) => !LIST_METRICS.includes(k))

type UsageStream = { id: number; name: string; campaign_id: number }

// «Используется в потоках: N» + the first few streams as links to their campaigns.
export function UsedIn({
  streams, campaigns, label = "Используется в потоках", extra,
}: { streams: UsageStream[]; campaigns: { id: number; name: string }[]; label?: string; extra?: ReactNode }) {
  // only campaigns this viewer may see (a buyer sees his own)
  const own = new Set(campaigns.map((c) => c.id))
  streams = streams.filter((s) => own.has(s.campaign_id))
  const shown = streams.slice(0, 5)
  return (
    <div className="flex flex-col gap-1 py-2 text-sm">
      <p className="text-muted-foreground">
        {label}: <span className="num text-foreground">{streams.length}</span>{extra}
      </p>
      {shown.length > 0 && (
        <ul className="rounded-md border">
          {shown.map((s) => (
            <li key={s.id} className="border-b last:border-b-0">
              <a href={`#/campaigns/${s.campaign_id}`} className="flex items-center gap-2 px-2 py-1.5 text-link">
                <span className="min-w-0 flex-1 truncate">{campaigns.find((c) => c.id === s.campaign_id)?.name}</span>
                <span className="max-w-[50%] shrink-0 truncate text-muted-foreground">{s.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {streams.length > shown.length && <p className="text-muted-foreground">и ещё {streams.length - shown.length}</p>}
    </div>
  )
}

// «Используется в кампаниях: N · потоков в них: M» + first campaigns as links.
export function UsedInCampaigns({ campaigns, streamsCount }: { campaigns: { id: number; name: string }[]; streamsCount: number }) {
  const shown = campaigns.slice(0, 5)
  return (
    <div className="flex flex-col gap-1 py-2 text-sm">
      <p className="text-muted-foreground">
        Используется в кампаниях: <span className="num text-foreground">{campaigns.length}</span> · потоков в них: <span className="num text-foreground">{streamsCount}</span>
      </p>
      {shown.length > 0 && (
        <ul className="rounded-md border">
          {shown.map((c) => (
            <li key={c.id} className="border-b last:border-b-0">
              <a href={`#/campaigns/${c.id}`} className="block truncate px-2 py-1.5 text-link">{c.name}</a>
            </li>
          ))}
        </ul>
      )}
      {campaigns.length > shown.length && <p className="text-muted-foreground">и ещё {campaigns.length - shown.length}</p>}
    </div>
  )
}
