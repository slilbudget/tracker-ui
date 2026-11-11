// Cap and offer-restriction display shared by offer groups, offers, streams and the replacement page.
import type { CapMetric, CapProgress, CapWindow, Offer, OfferGroupCap } from "@/api/types"
import { COUNTRIES } from "@/api/meta"
import { cn } from "@/lib/utils"
import { fmtInt } from "@/lib/format"

export const CAP_METRICS: { value: CapMetric; label: string; short: string }[] = [
  { value: "ftd", label: "Депы (FTD)", short: "FTD" },
  { value: "install", label: "Инсталлы (уник. клики)", short: "инст." },
]
export const CAP_WINDOWS: { value: CapWindow; label: string }[] = [
  { value: "term", label: "За период" },
  { value: "day", label: "В день" },
]
const short = (m: CapMetric) => CAP_METRICS.find((x) => x.value === m)?.short ?? m

// 2026-11-01 → 01.11 (01.11.2026 when the year differs from now)
export function fmtDay(d: string, withYear = false) {
  const [y, m, day] = d.split("-")
  return withYear || Number(y) !== new Date().getFullYear() ? `${day}.${m}.${y}` : `${day}.${m}`
}
export const fmtTerm = (t: { from: string; to: string }) => `${fmtDay(t.from)}–${fmtDay(t.to)}`

export const capText = (c: CapProgress) => `${fmtInt(c.done)} / ${fmtInt(c.value)} ${short(c.metric)}${c.window === "day" ? " в день" : ""}`

const CAP_CLASS: Record<OfferGroupCap["status"], string> = {
  none: "text-muted-foreground", ok: "", warn: "text-warning", full: "text-destructive", no_term: "text-warning",
}
export const capClass = (s: OfferGroupCap["status"]) => CAP_CLASS[s]

// Table cell: the fullest cap of the term in force, all caps in the tooltip.
export function CapCell({ cap }: { cap?: OfferGroupCap }) {
  if (!cap) return <span className="text-muted-foreground">—</span>
  if (cap.status === "no_term") return <span className="text-warning" title="Нет условий на сегодня: продлите период в группе">Нет условий</span>
  if (cap.status === "none") return <span className="text-muted-foreground">{cap.term ? "Без капы" : "—"}</span>
  const top = [...cap.caps].sort((a, b) => b.done / b.value - a.done / a.value)[0]
  const title = cap.caps.map((c) => `${capText(c)} (${Math.floor((c.done / c.value) * 100)}%)`).join("\n")
  return (
    <span className={cn("num whitespace-nowrap", capClass(cap.status))} title={title}>
      {capText(top)}
      {cap.caps.length > 1 && <span className="text-muted-foreground"> +{cap.caps.length - 1}</span>}
    </span>
  )
}

// One cap with a flat bar (no animation): label, numbers, percent.
export function CapBar({ cap, status }: { cap: CapProgress; status: OfferGroupCap["status"] }) {
  const pct = cap.value ? (cap.done / cap.value) * 100 : 0
  const tone = pct >= 100 ? "bg-destructive" : status === "warn" && pct >= 80 ? "bg-warning" : "bg-primary"
  return (
    <div className="flex flex-col gap-1 py-1.5">
      <div className="flex items-baseline gap-2 text-sm">
        <span>{CAP_METRICS.find((m) => m.value === cap.metric)?.label} {cap.window === "day" ? "в день" : "за период"}</span>
        <span className={cn("num ml-auto", pct >= 100 ? "text-destructive" : pct >= 80 ? "text-warning" : "")}>
          {fmtInt(cap.done)} из {fmtInt(cap.value)} · {Math.floor(pct)}%
        </span>
      </div>
      <div className="h-1.5 rounded-sm bg-muted">
        <div className={cn("h-full rounded-sm", tone)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  )
}

const countryName = (c: string) => COUNTRIES.find((x) => x.value === c)?.label ?? c

// «Только New York, New Jersey, Ohio» / «США» / «Без ограничений»
export function geoText(o: Pick<Offer, "country" | "regions">) {
  if (o.regions.length) return `Только ${o.regions.join(", ")}`
  if (o.country.length) return o.country.map(countryName).join(", ")
  return "Без ограничений"
}
export const isRestricted = (o?: Pick<Offer, "regions">) => !!o?.regions.length
