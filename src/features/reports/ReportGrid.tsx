// Report table on AG Grid (Community, MIT): drill-down by the grouping levels, server sort, totals row, period comparison.
// Only the report uses AG Grid (owner 15/11); the other sections keep DataTable.
// Grouping rows are not AG Grid's row grouping (that one is Enterprise): every level is its own request to the API
// (ratios like CR / ROI are computed by the server per group), and the rows are flattened into one list here.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { Link, useNavigate } from "react-router"
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query"
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react"
import {
  CellStyleModule, ClientSideRowModelModule, ColumnApiModule, ModuleRegistry, PinnedRowModule, RowStyleModule, TooltipModule,
  ValidationModule, themeQuartz, type ColDef, type ColumnState, type GridApi, type RowClassParams, type SortChangedEvent,
} from "ag-grid-community"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import type { DateRange, ReportFilter, ReportResponse, ReportRow } from "@/api/types"
import { api } from "@/api/client"
import { dimensionDef, metricDef } from "@/api/meta"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { previousRange } from "@/lib/dates"
import { fmtMetric, signClass } from "@/lib/format"
import { RELAX_HINT, hasExactFilter } from "./FilterBuilder"
import { fmtDayKey, reportLink } from "./shared"

ModuleRegistry.registerModules([
  ClientSideRowModelModule, ColumnApiModule, PinnedRowModule, CellStyleModule, RowStyleModule, TooltipModule,
  ...(import.meta.env.DEV ? [ValidationModule] : []),
])

const CHILD_LIMIT = 50
const SEP = "\u0001"
const ROW_H = 32
// For these a decrease is good news.
const LOWER_BETTER = new Set(["cost", "cost_fee", "cpc", "cpa", "cps", "cpm", "install_cost", "i2d", "rejected", "rejected_revenue", "bots"])

// colours, font and borders come from the app tokens, so the grid looks like the rest of the tables
const theme = themeQuartz.withParams({
  backgroundColor: "var(--background)",
  foregroundColor: "var(--foreground)",
  textColor: "var(--foreground)",
  headerBackgroundColor: "var(--background)",
  headerTextColor: "var(--muted-foreground)",
  headerFontWeight: 500,
  borderColor: "var(--border)",
  accentColor: "var(--ring)",
  browserColorScheme: "dark",
  fontFamily: "inherit",
  fontSize: 13,
  headerFontSize: 13,
  rowHeight: ROW_H,
  headerHeight: ROW_H + 2,
  cellHorizontalPadding: 10,
  wrapperBorderRadius: "var(--radius)",
  borderRadius: 2,
  oddRowBackgroundColor: "var(--background)",
  rowHoverColor: "transparent",
  pinnedRowBackgroundColor: "var(--muted)",
  pinnedRowFontWeight: 500,
  columnBorder: false,
  headerColumnBorder: false,
  headerColumnResizeHandleColor: "color-mix(in oklab, var(--muted-foreground) 30%, transparent)",
  headerColumnResizeHandleHeight: "40%",
  headerColumnResizeHandleWidth: 1,
  iconSize: 12,
})

// a constant: a new object on every render would make AG Grid rebuild the columns (and drop a resize)
const DEFAULT_COL: ColDef<GridRow> = { resizable: true, sortingOrder: ["desc", "asc", null] }

type Kind = "row" | "loading" | "empty" | "more"
interface GridRow {
  id: string
  kind: Kind
  level: number
  value: string
  canExpand?: boolean
  open?: boolean
  data?: ReportRow
  prev?: ReportRow
  shown?: number
  total?: number
  parent?: ReportFilter[]
}
type Sort = { key: string; desc: boolean } | null

// phones: no pinned column (it would take the whole screen)
const SM = "(min-width: 640px)"
function useSm() {
  return useSyncExternalStore(
    (cb) => { const m = matchMedia(SM); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb) },
    () => matchMedia(SM).matches,
  )
}

const stateKey = (dims: string[]) => `trk.report.grid.${dims.join(">")}`
function loadState(dims: string[]): ColumnState[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(stateKey(dims)) ?? "null")
    return Array.isArray(v) ? v : null
  } catch { return null }
}

export function ReportGrid({
  dims, measures, filters, range, compare, withExcluded, onRelax,
}: { dims: string[]; measures: string[]; filters: ReportFilter[]; range: DateRange; compare: boolean; withExcluded: boolean; onRelax: () => void }) {
  const [sort, setSort] = useState<Sort>(null)
  // path of an open row → filters that select its children
  const [expanded, setExpanded] = useState<Map<string, ReportFilter[]>>(new Map())
  const [custom, setCustom] = useState(() => loadState(dims) != null)
  const gridApi = useRef<GridApi<GridRow> | null>(null)
  const sm = useSm()
  const nav = useNavigate()
  const prevRange = useMemo(() => previousRange(range), [range])

  const sortReq = (dim: string) => sort && (sort.key === "_dim" || measures.includes(sort.key))
    ? [{ name: sort.key === "_dim" ? dim : sort.key, order: sort.desc ? ("DESC" as const) : ("ASC" as const) }]
    : []
  const curQuery = (parent: ReportFilter[]) => {
    const dim = dims[parent.length]
    const f = [...filters, ...parent]
    const s = sortReq(dim)
    const limit = parent.length ? CHILD_LIMIT : undefined
    return {
      queryKey: ["report", range, dim, measures, f, s, limit, withExcluded],
      queryFn: () => api.reports.build({ range, dimensions: [dim], measures, filters: f, sort: s, limit, include_excluded: withExcluded }),
    }
  }
  const prevQuery = (parent: ReportFilter[]) => {
    const dim = dims[parent.length]
    const f = [...filters, ...parent]
    return {
      queryKey: ["report", "prev", prevRange, dim, measures, f, withExcluded],
      queryFn: () => api.reports.build({ range: prevRange, dimensions: [dim], measures, filters: f, sort: [], include_excluded: withExcluded }),
      // a time level (or a row under a day / hour) has no «same row» in the previous period
      enabled: compare && dimensionDef(dim)?.group !== "time" && !parent.some((x) => dimensionDef(x.name)?.group === "time"),
    }
  }
  // the top level keeps its rows while a new sort / filter loads, so the grid is not rebuilt
  const top = useQuery({ ...curQuery([]), placeholderData: keepPreviousData })
  const topPrev = useQuery(prevQuery([]))
  // one request per open row (its children); `combine` keeps the same array while nothing changed
  const opened = useMemo(() => [...expanded], [expanded])
  const kids = useQueries({ queries: opened.map(([, parent]) => curQuery(parent)), combine: (rs) => rs.map((r) => r.data) })
  const kidsPrev = useQueries({ queries: opened.map(([, parent]) => prevQuery(parent)), combine: (rs) => rs.map((r) => r.data) })

  // flatten the open tree into grid rows
  const rows = useMemo(() => {
    const byPath = new Map<string, { cur?: ReportResponse; prev?: ReportResponse }>([["", { cur: top.data, prev: topPrev.data }]])
    opened.forEach(([path], i) => byPath.set(path, { cur: kids[i], prev: kidsPrev[i] }))
    const out: GridRow[] = []
    const walk = (path: string, parent: ReportFilter[]) => {
      const level = parent.length
      const dim = dims[level]
      const lv = byPath.get(path)
      if (!lv?.cur) {
        out.push({ id: `${path}${SEP}~loading`, kind: "loading", level, value: "Загрузка…" })
        return
      }
      const prevBy = compare && lv.prev ? new Map(lv.prev.rows.map((r) => [String(r[dim]), r])) : undefined
      if (!lv.cur.rows.length && level > 0) out.push({ id: `${path}${SEP}~empty`, kind: "empty", level, value: "Нет данных" })
      for (const r of lv.cur.rows) {
        const value = String(r[dim] ?? "—")
        const own = path ? `${path}${SEP}${value}` : value
        const canExpand = level < dims.length - 1
        const open = canExpand && expanded.has(own)
        out.push({ id: own, kind: "row", level, value, canExpand, open, data: r, prev: prevBy?.get(value), parent })
        if (open) walk(own, [...parent, { name: dim, operator: "EQUALS", expression: value }])
      }
      if (level > 0 && lv.cur.total > lv.cur.rows.length) {
        out.push({ id: `${path}${SEP}~more`, kind: "more", level, value: "", shown: lv.cur.rows.length, total: lv.cur.total, parent })
      }
    }
    if (top.data) walk("", [])
    return out
  }, [top.data, topPrev.data, opened, kids, kidsPrev, expanded, dims, compare])

  const toggle = useCallback((row: GridRow) => {
    if (row.kind !== "row" || !row.canExpand) return
    setExpanded((m) => {
      const n = new Map(m)
      if (n.has(row.id)) {
        // closing a row closes everything under it
        for (const k of [...n.keys()]) if (k === row.id || k.startsWith(row.id + SEP)) n.delete(k)
      } else {
        n.set(row.id, [...(row.parent ?? []), { name: dims[row.level], operator: "EQUALS", expression: row.value }])
      }
      return n
    })
  }, [dims])

  const dimLabel = dims.map((d) => dimensionDef(d)?.name ?? d).join(" › ")
  const columnDefs = useMemo<ColDef<GridRow>[]>(() => [
    {
      colId: "_dim",
      headerName: dimLabel,
      // initial*: a width / place the user set is not reset when the definitions change
      initialPinned: sm ? "left" : false,
      lockPinned: true,
      initialWidth: sm ? 300 : 180,
      minWidth: 160,
      sortable: true,
      comparator: () => 0, // rows come sorted by the server; the grid keeps their order
      // AG Grid redraws a cell only when its value changes: the value carries the open state too
      valueGetter: (p) => (p.data ? `${p.data.kind}|${p.data.value}|${p.data.open ? 1 : 0}` : null),
      cellRenderer: DimCell,
      cellRendererParams: { dims, filters, range, toggle },
    },
    ...measures.map<ColDef<GridRow>>((k) => ({
      colId: k,
      headerName: metricDef(k)?.short ?? metricDef(k)?.name ?? k,
      headerTooltip: metricDef(k)?.name,
      type: "rightAligned",
      // the metrics share the free width; with many of them the grid scrolls sideways
      initialFlex: 1,
      minWidth: 96,
      sortable: true,
      comparator: () => 0,
      // value + previous-period value: the delta appears when the comparison loads later
      valueGetter: (p) => (p.data ? `${p.data.data?.[k] ?? ""}|${p.data.prev?.[k] ?? ""}` : null),
      cellRenderer: MetricCell,
      cellRendererParams: { k, compare },
    })),
  ], [dimLabel, dims, filters, range, toggle, measures, compare, sm])

  // phones: no pinned column (it would take the whole screen)
  useEffect(() => { gridApi.current?.applyColumnState({ state: [{ colId: "_dim", pinned: sm ? "left" : null }] }) }, [sm])

  const summary = top.data?.summary
  const prevSummary = compare ? topPrev.data?.summary : undefined
  const pinnedBottom = useMemo<GridRow[]>(
    () => (summary && rows.length ? [{ id: "~total", kind: "row", level: 0, value: "Итого", data: summary, prev: prevSummary }] : []),
    [summary, prevSummary, rows.length],
  )

  const saveState = () => {
    const s = gridApi.current?.getColumnState()
    if (!s) return
    // a resized column keeps its width (flex off); the order is the array order
    try { localStorage.setItem(stateKey(dims), JSON.stringify(s.map(({ colId, width, flex }) => ({ colId, width, flex })))) } catch { /* private mode */ }
    setCustom(true)
  }
  const resetState = () => {
    try { localStorage.removeItem(stateKey(dims)) } catch { /* private mode */ }
    gridApi.current?.resetColumnState()
    setCustom(false)
  }

  const onSortChanged = (e: SortChangedEvent<GridRow>) => {
    const s = e.api.getColumnState().find((c) => c.sort)
    setSort(s ? { key: s.colId, desc: s.sort === "desc" } : null)
  }

  if (!top.data) {
    return (
      <div className="flex flex-col gap-1 rounded-md border p-2">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}
      </div>
    )
  }
  if (!top.data.rows.length) {
    return (
      <div className="rounded-md border px-3 py-8 text-center text-sm text-muted-foreground">
        Нет данных за период и по фильтрам.
        {hasExactFilter(filters) && (
          <div className="mt-1">
            {RELAX_HINT}{" "}
            <Button variant="outline" size="sm" onClick={onRelax}>Заменить «равно» на «содержит»</Button>
          </div>
        )}
      </div>
    )
  }

  const rowH = compare ? 44 : ROW_H
  // grows with the rows, then scrolls inside (header and totals stay in view)
  const height = `min(${rows.length * rowH + rowH + ROW_H + 6}px, max(320px, calc(100dvh - 15rem)))`

  return (
    <div className="flex flex-col gap-2">
      <div style={{ height }} className="report-grid">
        <AgGridReact<GridRow>
          theme={theme}
          rowData={rows}
          pinnedBottomRowData={pinnedBottom}
          columnDefs={columnDefs}
          defaultColDef={DEFAULT_COL}
          maintainColumnOrder
          getRowId={(p) => p.data.id}
          rowHeight={rowH}
          onGridReady={(e) => {
            gridApi.current = e.api
            const s = loadState(dims)
            if (s) e.api.applyColumnState({ state: s, applyOrder: true })
          }}
          onColumnResized={(e) => { if (e.finished && e.source === "uiColumnResized") saveState() }}
          onColumnMoved={(e) => { if (e.finished && e.source === "uiColumnMoved") saveState() }}
          onSortChanged={onSortChanged}
          onRowClicked={(e) => { if (e.data && !e.rowPinned) toggle(e.data) }}
          onCellKeyDown={(e) => {
            const k = (e.event as KeyboardEvent | null)?.key
            if (!e.data || (k !== "Enter" && k !== " ")) return
            // «Показано 50 из N»: Enter opens the full report of that level
            if (e.data.kind === "more") nav(reportLink({ g: dims.slice(e.data.level), filters: [...filters, ...(e.data.parent ?? [])], range }))
            else toggle(e.data)
          }}
          getRowClass={(p: RowClassParams<GridRow>) => (p.data?.canExpand ? "cursor-pointer" : undefined)}
          suppressCellFocus={false}
          suppressDragLeaveHidesColumns
          animateRows={false}
          enableCellTextSelection
          tooltipShowDelay={400}
        />
      </div>
      <div className="min-h-8 text-sm text-muted-foreground">
        Строк: {top.data.total}
        {custom && <> · <button type="button" className="text-link" onClick={resetState}>Сбросить ширину и порядок колонок</button></>}
        {compare && topPrev.data && <> · сравнение с {fmtDayKey(prevRange.from ?? "")} — {fmtDayKey(prevRange.to ?? "")}; п.п. — процентные пункты</>}
        {dims.length > 1 && <> · нажмите строку, чтобы раскрыть уровень «{dimensionDef(dims[1])?.name}»</>}
      </div>
    </div>
  )
}

// ---------- cells ----------

function DimCell(p: CustomCellRendererProps<GridRow> & { dims: string[]; filters: ReportFilter[]; range: DateRange; toggle: (r: GridRow) => void }) {
  const row = p.data
  // screen readers: an expandable row says whether it is open (AG Grid has no option for this outside row grouping)
  const rowEl = p.eGridCell?.closest("[role=row]")
  useEffect(() => {
    if (!rowEl) return
    if (row?.kind === "row" && row.canExpand) rowEl.setAttribute("aria-expanded", String(!!row.open))
    else rowEl.removeAttribute("aria-expanded")
  }, [rowEl, row])
  if (!row) return null
  if (p.node.rowPinned) return <span>Итого</span>
  const pad = { paddingLeft: row.level * 16 + (row.kind === "row" ? 0 : 16) }
  if (row.kind === "more") {
    return (
      <span className="text-muted-foreground" style={pad}>
        Показано {row.shown} из {row.total}.{" "}
        <Link className="text-link" to={reportLink({ g: p.dims.slice(row.level), filters: [...p.filters, ...(row.parent ?? [])], range: p.range })} onClick={(e) => e.stopPropagation()}>
          Полный отчёт
        </Link>
      </span>
    )
  }
  if (row.kind !== "row") return <span className="text-muted-foreground" style={pad}>{row.value}</span>
  const dim = p.dims[row.level]
  const text = dim === "day" ? fmtDayKey(row.value) : row.value
  return (
    <span className="flex h-full min-w-0 items-center gap-1" style={pad} title={text}>
      {row.canExpand
        ? <Icon icon={row.open ? ChevronDownIcon : ChevronRightIcon} size={12} className="shrink-0 text-muted-foreground" />
        : p.dims.length > 1 ? <span className="w-3 shrink-0" /> : null}
      <span className={cn("truncate", row.level === 0 && "font-medium")}>{text}</span>
    </span>
  )
}

function MetricCell(p: CustomCellRendererProps<GridRow> & { k: string; compare: boolean }) {
  const row = p.data
  if (!row || row.kind !== "row") return null
  const v = row.data?.[p.k]
  return (
    <div className="num flex h-full flex-col items-end justify-center leading-tight">
      <div className={signClass(p.k, v)}>{v == null ? "—" : fmtMetric(p.k, v)}</div>
      {p.compare && row.prev && <Delta k={p.k} cur={v} prev={row.prev[p.k]} />}
    </div>
  )
}

function Delta({ k, cur, prev }: { k: string; cur: string | number | null | undefined; prev: string | number | null | undefined }) {
  if (typeof cur !== "number" || typeof prev !== "number") return null
  let d: number
  let text: string
  const f = (n: number) => (Math.abs(n) < 10 ? n.toFixed(1) : String(Math.round(n))).replace(".", ",")
  const pp = metricDef(k)?.format === "percent"
  if (pp) {
    d = cur - prev
    text = `${d > 0 ? "+" : ""}${f(d)} п.п.`
  } else {
    if (prev === 0) return null
    d = ((cur - prev) / Math.abs(prev)) * 100
    text = `${d > 0 ? "+" : ""}${f(d)}%`
  }
  const tone = Math.abs(d) < 0.05 ? "text-muted-foreground" : (LOWER_BETTER.has(k) ? d < 0 : d > 0) ? "text-success" : "text-destructive"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("text-[11px] leading-3", tone)}>{text}</div>
      </TooltipTrigger>
      <TooltipContent>
        {pp ? <>п.п. — процентные пункты: разница между двумя процентами (8,0% → 9,5% = +1,5 п.п.).<br /></> : null}
        {LOWER_BETTER.has(k) && <>Для этой метрики снижение — хороший результат.<br /></>}
        Прошлый период: {fmtMetric(k, prev)}
      </TooltipContent>
    </Tooltip>
  )
}
