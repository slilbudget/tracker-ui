import { metricDef } from "@/api/meta"

const int = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })
const dec = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtInt = (v: number | null | undefined) => (v == null ? "—" : int.format(v))
export const fmtMoney = (v: number | null | undefined, cur = "$") => (v == null ? "—" : `${dec.format(v)} ${cur}`)
export const fmtPercent = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : `${dec.format(v)}%`)
const fmtDecimal = (v: number | null | undefined) => (v == null ? "—" : dec.format(v))

export function fmtMetric(key: string, v: number | string | null | undefined): string {
  if (typeof v === "string") return v
  const def = metricDef(key)
  if (!def) return v == null ? "—" : String(v)
  switch (def.format) {
    case "int":
      return fmtInt(v)
    case "money":
      return fmtMoney(v)
    case "percent":
      return fmtPercent(v)
    default:
      return fmtDecimal(v)
  }
}

// Tailwind class for signed metrics (profit, ROI): green above zero, red below.
export function signClass(key: string, v: unknown) {
  if (!metricDef(key)?.signed || typeof v !== "number" || v === 0) return ""
  return v > 0 ? "text-success" : "text-destructive"
}
