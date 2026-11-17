// Report builder: grouping (up to 10 levels, as deep as the PBI matrices) → drill-down tree table on AG Grid (ReportGrid.tsx), filters, metrics, period comparison,
// saved presets. The whole state lives in the URL (g, m, f, cmp, period) so a link reproduces the report.
import { Fragment, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { ArrowLeftRightIcon, BookmarkIcon, BookmarkPlusIcon, ChevronDownIcon, ChevronUpIcon, DownloadIcon, EllipsisIcon, PlusIcon, SettingsIcon, XIcon } from "lucide-react"
import type { ReportFilter } from "@/api/types"
import { api } from "@/api/client"
import { DIMENSIONS, METRICS, METRIC_PRESETS, dimensionDef, metricDef } from "@/api/meta"
import { useHiddenMetrics, usePeriod } from "@/app/state"
import { PresetButtons } from "@/components/metric-presets"
import { Slicer } from "@/components/slicer"
import { Page, PageHeader, RefreshButton } from "@/components/page"
import { PeriodSelect } from "@/components/period-select"
import { downloadCsv } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { DimensionSelect, FilterBuilder, filterText } from "./FilterBuilder"
import { decodeFilters, encodeFilters, fmtDayKey, periodQuery, useDictionaries } from "./shared"
import { ReportGrid } from "./ReportGrid"

const DEFAULT_G = ["campaign"]
// Same set as the entity lists (confirmed money); «все» variants and EPC are one click away in the metrics picker.
const DEFAULT_M = METRIC_PRESETS[0].keys
const MAX_LEVELS = 10

// Ready groupings: a plain Select in the grouping row. The «PBI» ones repeat the pages of the FacebookNew board
// and also set its columns.
const FB_M = METRIC_PRESETS.find((p) => p.name === "Facebook")!.keys
const PRESETS: { key: string; label: string; g: string[]; m?: string[]; f?: ReportFilter[] }[] = [
  { key: "pbi_kop", label: "PBI: КОП", g: ["month", "day", "product", "offer", "team", "buyer", "fb_campaign", "fb_adset", "fb_ad"], m: FB_M },
  { key: "pbi_main", label: "PBI: Общий", g: ["month", "day", "offer", "team", "buyer"], m: ["cost_fee", "sales", "sale_revenue", "profit_fee", "roi_fee"] },
  { key: "pbi_creo", label: "PBI: Креосы", g: ["fb_ad", "offer", "day"], m: FB_M },
  { key: "pbi_accounts", label: "PBI: Кабы", g: ["fb_account", "month", "day", "offer", "team", "buyer", "fb_campaign", "fb_adset", "fb_ad"], m: FB_M },
  { key: "pbi_fb", label: "PBI: Кампании FB", g: ["month", "day", "buyer", "fb_campaign", "fb_adset", "fb_ad"], m: FB_M },
  { key: "pbi_rejects", label: "PBI: Срезы (отклонения)", g: ["reject_reason", "country"], m: ["rejected", "rejected_revenue"], f: [{ name: "reject_reason", operator: "NOT_EQUAL", expression: "—" }] },
  { key: "day", label: "По дням", g: ["day"] },
  { key: "campaign", label: "По кампаниям", g: ["campaign"] },
  { key: "stream", label: "По потокам", g: ["stream"] },
  { key: "offer_group", label: "По оффер-группам", g: ["offer_group"] },
  { key: "offer", label: "По офферам", g: ["offer"] },
  { key: "landing", label: "По лендингам", g: ["landing"] },
  { key: "affiliate_network", label: "По партнёркам", g: ["affiliate_network"] },
  { key: "buyer", label: "По байерам", g: ["buyer"] },
  { key: "ts", label: "По источникам", g: ["ts"] },
  { key: "region", label: "По штатам", g: ["region"] },
  { key: "team", label: "По командам", g: ["team"] },
  { key: "approach", label: "По подходам", g: ["approach"] },
  { key: "fb_account", label: "По кабинетам FB", g: ["fb_account"] },
  { key: "fb_ad", label: "По объявлениям FB", g: ["fb_ad"] },
]
const METRIC_GROUPS = { traffic: "Трафик", conversions: "Конверсии", money: "Деньги", rates: "Показатели" } as const
// PBI-like slicers above the table: each one is an «в списке» filter on its field.
const SLICERS = ["team", "buyer", "country", "approach", "campaign_tag", "offer_group", "affiliate_network", "agency"]

const csv = (s: string | null) => (s ? s.split(",").filter(Boolean) : [])

// ---------- saved reports (localStorage) ----------

interface Saved { id: string; name: string; qs: string }
const SAVED_KEY = "trk.reports.saved"
function loadSaved(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]")
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function storeSaved(xs: Saved[]) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(xs)) } catch { /* private mode */ }
}

// ---------- page ----------

export default function ReportPage() {
  const [params, setParams] = useSearchParams()
  const hidden = useHiddenMetrics()
  const [range, setRange] = usePeriod()
  const [saved, setSaved] = useState<Saved[]>(loadSaved)
  const [exporting, setExporting] = useState(false)

  const g = useMemo(() => {
    const x = csv(params.get("g")).filter((d) => dimensionDef(d)).slice(0, MAX_LEVELS)
    return x.length ? x : DEFAULT_G
  }, [params])
  const m = useMemo(() => {
    // columns always follow the METRICS order, like everywhere else in the app
    const picked = new Set(csv(params.get("m")))
    const x = METRICS.map((d) => d.key).filter((k) => picked.has(k) && !hidden.includes(k))
    return x.length ? x : DEFAULT_M.filter((k) => !hidden.includes(k))
  }, [params, hidden])
  // ?f_landing=<name> from other pages → EQUALS filters (merged here, then moved into ?f by the effect below)
  const incoming = useMemo(() => {
    const out: ReportFilter[] = []
    params.forEach((v, k) => {
      if (k.startsWith("f_") && dimensionDef(k.slice(2))) out.push({ name: k.slice(2), operator: "EQUALS", expression: v })
    })
    return out
  }, [params])
  const filters = useMemo(() => {
    const own = decodeFilters(params.get("f"))
    return [...own.filter((f) => !incoming.some((i) => i.name === f.name && f.operator === "EQUALS")), ...incoming]
  }, [params, incoming])
  const compare = params.get("cmp") === "1"
  const withExcluded = params.get("ex") === "1"

  useEffect(() => {
    if (!incoming.length) return
    setParams((p) => {
      const n = new URLSearchParams(p)
      for (const k of [...n.keys()]) if (k.startsWith("f_")) n.delete(k)
      n.set("f", encodeFilters(filters))
      return n
    }, { replace: true })
  }, [incoming, filters, setParams])

  const update = (patch: Record<string, string>) =>
    setParams((p) => {
      const n = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) {
        if (v) n.set(k, v)
        else n.delete(k)
      }
      return n
    }, { replace: true })
  const setG = (x: string[]) => update({ g: x.join(",") })
  const setM = (x: string[]) => update({ m: x.join(",") })
  const setF = (x: ReportFilter[]) => update({ f: encodeFilters(x) })

  const currentQs = () => {
    const p = periodQuery(range)
    p.set("g", g.join(","))
    p.set("m", m.join(","))
    if (filters.length) p.set("f", encodeFilters(filters))
    if (compare) p.set("cmp", "1")
    if (withExcluded) p.set("ex", "1")
    return p.toString()
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      const res = await api.reports.build({ range, dimensions: g, measures: m, filters, sort: [], include_excluded: withExcluded })
      downloadCsv(
        `report-${g.join("-")}.csv`,
        [...g.map((d) => dimensionDef(d)?.name ?? d), ...m.map((k) => metricDef(k)?.name ?? k)],
        res.rows.map((r) => [...g.map((d) => (d === "day" ? fmtDayKey(String(r[d])) : r[d])), ...m.map((k) => r[k])]),
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <Page>
      <PageHeader
        title="Отчёт"
        actions={
          <ReportActions
            saved={saved}
            exporting={exporting}
            onExport={exportCsv}
            onApply={(s) => setParams(new URLSearchParams(s.qs), { replace: true })}
            onRemove={(id) => { const n = saved.filter((s) => s.id !== id); setSaved(n); storeSaved(n) }}
            onSave={(name) => {
              const n = [...saved.filter((s) => s.name !== name), { id: String(Date.now()), name, qs: currentQs() }]
              setSaved(n)
              storeSaved(n)
              toast.success(`Отчёт «${name}» сохранён`)
            }}
          />
        }
      />

      <GroupingBar value={g} onChange={setG} onPreset={(p) => update({ g: p.g.join(","), ...(p.m ? { m: p.m.join(",") } : {}), f: encodeFilters(p.f ?? filters) })} trailing={<><PeriodSelect value={range} onChange={setRange} /><RefreshButton className="max-sm:hidden" /></>} />

      <div className="flex flex-wrap items-center gap-2">
        <FilterBuilder value={filters} onChange={setF} />
        <MetricsPicker value={m} hidden={hidden} onChange={setM} />
        <Label className="gap-2 text-sm font-normal">
          <Switch checked={compare} onCheckedChange={(v) => update({ cmp: v ? "1" : "" })} />
          <span className="sm:hidden">Сравнить</span><span className="max-sm:hidden">Сравнить с прошлым периодом</span>
        </Label>
        <Label className="gap-2 text-sm font-normal" title="Кампании с отметкой «Не учитывать в статистике» (тесты, служебные). По умолчанию их нет в отчёте">
          <Switch checked={withExcluded} onCheckedChange={(v) => update({ ex: v ? "1" : "" })} />
          Исключённые кампании
        </Label>
      </div>

      <Slicers filters={filters} onChange={setF} />

      {filters.some((f) => !isSlicer(f)) && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          {filters.map((f, i) => isSlicer(f) ? null : (
            <span key={i} className="inline-flex h-7 items-center gap-1 rounded-md border bg-muted pr-0.5 pl-2">
              {filterText(f)}
              <Button variant="ghost" size="icon-xs" aria-label="Убрать фильтр" onClick={() => setF(filters.filter((_, j) => j !== i))}>
                <Icon icon={XIcon} size={10} />
              </Button>
            </span>
          ))}
        </div>
      )}

      <ReportGrid key={g.join(",")} dims={g} measures={m} filters={filters} range={range} compare={compare} withExcluded={withExcluded} onRelax={() => setF(filters.map((f) => (f.operator === "EQUALS" ? { ...f, operator: "CONTAINS" as const } : f.operator === "NOT_EQUAL" ? { ...f, operator: "NOT_CONTAIN" as const } : f)))} />
    </Page>
  )
}

// ---------- toolbar parts ----------

const SLICER_LABEL: Record<string, string> = { affiliate_network: "Партнёрка", country: "Гео", campaign_tag: "Тег" }
const isSlicer = (f: ReportFilter) => f.operator === "IN_LIST" && SLICERS.includes(f.name)

function Slicers({ filters, onChange }: { filters: ReportFilter[]; onChange: (f: ReportFilter[]) => void }) {
  const dict = useDictionaries()
  const set = (name: string, values: string[]) => {
    const rest = filters.filter((f) => !(f.name === name && f.operator === "IN_LIST"))
    onChange(values.length ? [...rest, { name, operator: "IN_LIST", expression: values }] : rest)
  }
  const any = filters.some(isSlicer)
  const [open, setOpen] = useState(false)
  const n = filters.filter(isSlicer).length
  return (
    <>
    <Button variant="outline" className="self-start sm:hidden" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
      Быстрые фильтры{n ? ` (${n})` : ""} <Icon icon={open ? ChevronUpIcon : ChevronDownIcon} size={14} />
    </Button>
    <div className={cn("grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center", !open && "max-sm:hidden")}>
      {SLICERS.map((name) => {
        const f = filters.find((x) => x.name === name && x.operator === "IN_LIST")
        const value = f ? (Array.isArray(f.expression) ? f.expression.map(String) : [String(f.expression)]) : []
        return <Slicer key={name} label={SLICER_LABEL[name] ?? dimensionDef(name)?.name ?? name} options={dict[name] ?? []} value={value} onChange={(v) => set(name, v)} />
      })}
      {any && <Button variant="ghost" className="max-sm:col-span-2" onClick={() => onChange(filters.filter((f) => !isSlicer(f)))}>Сбросить</Button>}
    </div>
    </>
  )
}

function GroupingBar({ value, onChange, onPreset, trailing }: { value: string[]; onChange: (v: string[]) => void; onPreset: (p: (typeof PRESETS)[number]) => void; trailing?: React.ReactNode }) {
  const swap = (i: number) => {
    const n = [...value]
    ;[n[i], n[i + 1]] = [n[i + 1], n[i]]
    onChange(n)
  }
  const free = DIMENSIONS.find((d) => !value.includes(d.key))
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Группировка</span>
      {value.map((d, i) => (
        <Fragment key={i}>
          {i > 0 && value.length <= 3 && (
            <Button variant="ghost" size="icon" aria-label="Поменять уровни местами" title="Поменять местами" onClick={() => swap(i - 1)}>
              <Icon icon={ArrowLeftRightIcon} className="text-muted-foreground" />
            </Button>
          )}
          <span className="inline-flex items-center gap-1">
            <DimensionSelect
              value={d}
              onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))}
              disabledKeys={value.filter((_, j) => j !== i)}
              className={value.length > 4 ? "w-36" : "w-40"}
            />
            <Button variant="ghost" size="icon" aria-label="Убрать уровень" disabled={value.length === 1} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Icon icon={XIcon} />
            </Button>
          </span>
        </Fragment>
      ))}
      {value.length < MAX_LEVELS && free && (
        <Button variant="outline" onClick={() => onChange([...value, free.key])}>
          <Icon icon={PlusIcon} /> Уровень
        </Button>
      )}
      <Select
        value={PRESETS.find((p) => p.g.length === value.length && p.g.every((d, i) => d === value[i]))?.key ?? ""}
        onValueChange={(k) => onPreset(PRESETS.find((p) => p.key === k)!)}
      >
        <SelectTrigger className="w-44" aria-label="Готовые группировки"><SelectValue placeholder="Готовые группировки" /></SelectTrigger>
        <SelectContent>{PRESETS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
      </Select>
      {trailing && <div className="flex items-center gap-2 md:ml-auto">{trailing}</div>}
    </div>
  )
}

function MetricsPicker({ value, hidden, onChange }: { value: string[]; hidden: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("")
  const list = METRICS.filter((x) => !hidden.includes(x.key) && (x.name + x.key).toLowerCase().includes(q.toLowerCase()))
  const toggle = (k: string) => {
    if (value.includes(k)) { if (value.length > 1) onChange(value.filter((x) => x !== k)) }
    else onChange(METRICS.map((x) => x.key).filter((x) => x === k || value.includes(x)))
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline"><Icon icon={SettingsIcon} className="text-muted-foreground" /> Метрики ({value.length})</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-1.5rem))] gap-2 p-3">
        <PresetButtons small value={value} hidden={hidden} onPick={onChange} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск метрики" aria-label="Поиск метрики" />
        <div className="max-h-80 overflow-y-auto">
          {(Object.keys(METRIC_GROUPS) as (keyof typeof METRIC_GROUPS)[]).map((gr) => {
            const items = list.filter((x) => x.group === gr)
            if (!items.length) return null
            return (
              <div key={gr} className="pb-2">
                <div className="px-1 py-1 text-xs font-medium text-muted-foreground">{METRIC_GROUPS[gr]}</div>
                {items.map((x) => (
                  <Label key={x.key} className="h-8 gap-2 rounded-md px-1 text-sm font-normal">
                    <Checkbox checked={value.includes(x.key)} onCheckedChange={() => toggle(x.key)} />
                    {x.name}
                  </Label>
                ))}
              </div>
            )
          })}
          {list.length === 0 && <p className="p-2 text-xs text-muted-foreground">Ничего не найдено</p>}
        </div>
        {/* footer stays outside the scroll area */}
        <div className="flex items-center gap-2 border-t pt-2">
          <Button variant="ghost" onClick={() => onChange(DEFAULT_M.filter((k) => !hidden.includes(k)))}>По умолчанию</Button>
          <span className="ml-auto text-xs text-muted-foreground">Выбрано: {value.length}</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Desktop: «Мои отчёты», «Сохранить отчёт», «Выгрузить CSV». Phone (<sm): one «…» menu with the same three.
function ReportActions({
  saved, exporting, onExport, onApply, onRemove, onSave,
}: { saved: Saved[]; exporting: boolean; onExport: () => void; onApply: (s: Saved) => void; onRemove: (id: string) => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("")
  const [open, setOpen] = useState(false)
  const submit = () => {
    if (!name.trim()) return
    onSave(name.trim())
    setName("")
    setOpen(false)
  }
  const savedItems = (
    <>
      {saved.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">Пока нет. Настройте отчёт и нажмите «Сохранить отчёт».</p>}
      {saved.map((s) => (
        <DropdownMenuItem key={s.id} onSelect={() => onApply(s)} className="justify-between">
          <span className="truncate">{s.name}</span>
          <Button
            variant="ghost" size="icon-xs" aria-label={`Удалить отчёт ${s.name}`}
            onClick={(e) => { e.stopPropagation(); onRemove(s.id) }}
          >
            <Icon icon={XIcon} size={10} />
          </Button>
        </DropdownMenuItem>
      ))}
    </>
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 max-sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><Icon icon={BookmarkIcon} size={14} /> Мои отчёты{saved.length ? ` (${saved.length})` : ""}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Сохранённые отчёты</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {savedItems}
              </DropdownMenuContent>
            </DropdownMenu>
            <PopoverTrigger asChild>
              <Button variant="outline"><Icon icon={BookmarkPlusIcon} size={14} /> Сохранить отчёт</Button>
            </PopoverTrigger>
            <Button variant="outline" onClick={onExport} disabled={exporting}>
              <Icon icon={DownloadIcon} size={14} /> Выгрузить CSV
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="sm:hidden" aria-label="Действия с отчётом"><Icon icon={EllipsisIcon} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Мои отчёты</DropdownMenuLabel>
              {savedItems}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTimeout(() => setOpen(true), 50)}><Icon icon={BookmarkPlusIcon} size={14} /> Сохранить отчёт</DropdownMenuItem>
              <DropdownMenuItem disabled={exporting} onSelect={onExport}><Icon icon={DownloadIcon} size={14} /> Выгрузить CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-72 gap-2 p-3">
        <Label htmlFor="rep-name">Название отчёта</Label>
        <Input id="rep-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Лендинги по штатам" onKeyDown={(e) => e.key === "Enter" && submit()} />
        <Button disabled={!name.trim()} onClick={submit}>Сохранить</Button>
      </PopoverContent>
    </Popover>
  )
}
