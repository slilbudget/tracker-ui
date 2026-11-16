// Clicks log: server-like pagination (api.clicks.log limit/offset), filters, search, column settings (all fields, order), CSV export, row → side sheet.
import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { DownloadIcon } from "lucide-react"
import type { Click, ReportFilter } from "@/api/types"
import { api } from "@/api/client"
import { useApp, useHiddenMetrics, usePeriod, useUrlParam } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { PeriodSelect } from "@/components/period-select"
import { SearchInput, downloadCsv } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { ColumnsButton, useColumnChoice, type ColumnChoice } from "@/components/columns-dialog"
import { formatDateTime } from "@/lib/dates"
import { fmtMoney } from "@/lib/format"
import { ClickSheet, DEVICE, FIELD_LABELS, fieldText } from "./ClickSheet"
import { FilterBuilder, RELAX_HINT, hasExactFilter } from "./FilterBuilder"
import { CampaignSelect, Clip, EntityName, decodeFilters, encodeFilters, reportLink, SUBS, SUB_ALIASES, useColumnPrefixes, usePage, useNames } from "./shared"

const DEFAULT_COLS = ["campaign", "stream", "landing", "offer", "country", "is_bot", "is_unique", "cost"]

const FIXED = ["datetime", "sub_id"]

export default function ClicksLogPage() {
  const { timezone } = useApp()
  const [range, setRange] = usePeriod()
  const [campaign, setCampaign] = useUrlParam("c")
  const [q, setQ] = useUrlParam("q")
  const [fRaw, setFRaw] = useUrlParam("f")
  const [open, setOpen] = useUrlParam("click")
  const userFilters = useMemo(() => decodeFilters(fRaw), [fRaw])
  const filters = useMemo<ReportFilter[]>(
    () => [...(campaign ? [{ name: "campaign_id", operator: "EQUALS" as const, expression: campaign }] : []), ...userFilters],
    [campaign, userFilters],
  )
  const names = useNames()
  const hiddenMetrics = useHiddenMetrics()
  const showCost = !hiddenMetrics.includes("cost")
  const [exporting, setExporting] = useState(false)
  const resetKey = JSON.stringify([range, filters, q])
  const pg = usePage(resetKey)

  const log = useQuery({
    queryKey: ["clicks", "log", range, filters, q, pg.page, pg.size],
    queryFn: () => api.clicks.log({ range, filters, search: q || undefined, limit: pg.size, offset: pg.page * pg.size }),
    placeholderData: keepPreviousData,
  })

  const pre = useColumnPrefixes(log.data?.rows, names.data)
  const filtered = !!(campaign || q || userFilters.length)
  const [, setParams] = useSearchParams()
  // one update for all keys (several useUrlParam setters in a row overwrite each other)
  const resetFilters = () => setParams((p) => { const n = new URLSearchParams(p); ["c", "q", "f"].forEach((k) => n.delete(k)); return n }, { replace: true })

  // every field of the log (Keitaro-like column settings); time and subid are always shown
  const catalog = useMemo(() => {
    const nm = names.data
    const yes = (v: boolean) => (v ? "Да" : <span className="text-muted-foreground">—</span>)
    const defs: (ColumnChoice & { col: ColumnDef<Click, unknown> })[] = []
    const add = (group: string, id: string, label: string, accessorFn: (c: Click) => string | number | null | undefined, extra: Partial<ColumnDef<Click, unknown>> = {}, header = label) =>
      defs.push({ id, label, group, col: { id, header, accessorFn, enableSorting: false, enableHiding: false, ...extra } as ColumnDef<Click, unknown> })
    const entity = (id: number | null, name: string | undefined, prefix: string) => <Clip><EntityName id={id} name={name} prefix={prefix} /></Clip>
    add("Основные", "datetime", "Время клика", (c) => formatDateTime(c.datetime, timezone))
    add("Основные", "sub_id", "Subid", (c) => c.sub_id, { cell: ({ row }) => <span className="font-mono">{row.original.sub_id}</span> })
    add("Основные", "campaign", "Кампания", (c) => nm?.campaigns[c.campaign_id] ?? c.campaign_id, {
      meta: { grow: true }, cell: ({ row }) => entity(row.original.campaign_id, nm?.campaigns[row.original.campaign_id], pre.campaign),
    })
    add("Основные", "buyer", "Байер", (c) => nm?.buyers[c.buyer_id] ?? "—")
    add("Основные", "stream", "Поток", (c) => nm?.streams[c.stream_id] ?? c.stream_id, { cell: ({ row }) => entity(row.original.stream_id, nm?.streams[row.original.stream_id], pre.stream) })
    add("Основные", "landing", "Лендинг", (c) => (c.landing_id ? nm?.landings[c.landing_id] ?? c.landing_id : "—"), {
      cell: ({ row }) => entity(row.original.landing_id, row.original.landing_id ? nm?.landings[row.original.landing_id] : undefined, pre.landing),
    })
    add("Основные", "offer", "Оффер", (c) => (c.offer_id ? nm?.offers[c.offer_id] ?? c.offer_id : "—"), {
      cell: ({ row }) => entity(row.original.offer_id, row.original.offer_id ? nm?.offers[row.original.offer_id] : undefined, pre.offer),
    })
    add("Основные", "network", "Партнёрка", (c) => { const n = c.offer_id ? nm?.offerNetwork[c.offer_id] : undefined; return n ? nm?.networks[n] ?? n : "—" })
    add("Основные", "ts", "Источник", (c) => (c.ts_id ? nm?.sources[c.ts_id] ?? c.ts_id : "—"))
    add("ID", "campaign_id", "ID кампании", (c) => c.campaign_id, { meta: { align: "right" } })
    add("ID", "stream_id", "ID потока", (c) => c.stream_id, { meta: { align: "right" } })
    add("ID", "landing_id", "ID лендинга", (c) => c.landing_id ?? "—", { meta: { align: "right" } })
    add("ID", "offer_id", "ID оффера", (c) => c.offer_id ?? "—", { meta: { align: "right" } })
    add("ID", "external_id", "External ID", (c) => c.external_id, { cell: ({ row }) => <span className="font-mono">{row.original.external_id}</span> })
    for (const k of SUBS) add("Параметры", k, `${k} · ${SUB_ALIASES[k]}`, (c) => c[k], {}, SUB_ALIASES[k])
    add("Гео", "country", "Страна", (c) => c.country)
    add("Гео", "region", "Регион", (c) => c.region)
    add("Гео", "city", "Город", (c) => c.city)
    add("Устройство", "device", "Устройство", (c) => DEVICE[c.device_type] ?? c.device_type)
    add("Устройство", "device_model", "Модель устройства", (c) => c.device_model)
    add("Устройство", "os", "ОС", (c) => c.os)
    add("Устройство", "browser", "Браузер", (c) => c.browser)
    add("Соединение", "ip", "IP", (c) => c.ip, { cell: ({ row }) => <span className="font-mono">{row.original.ip}</span> })
    add("Соединение", "connection_type", "Подключение", (c) => c.connection_type || "—")
    add("Признаки", "is_bot", "Бот", (c) => (c.is_bot ? "Да" : "—"), { cell: ({ row }) => yes(row.original.is_bot) })
    add("Признаки", "is_unique", "Уникальный (кампания)", (c) => (c.is_unique_campaign ? "Да" : "—"), { cell: ({ row }) => yes(row.original.is_unique_campaign) }, "Уник.")
    add("Признаки", "is_unique_stream", "Уникальный (поток)", (c) => (c.is_unique_stream ? "Да" : "—"), { cell: ({ row }) => yes(row.original.is_unique_stream) }, "Уник. поток")
    add("Признаки", "lp_clicked", "Клик по лендингу", (c) => (c.lp_clicked ? "Да" : "—"), { cell: ({ row }) => yes(row.original.lp_clicked) }, "Клик LP")
    if (showCost) add("Деньги", "cost", "Расход", (c) => c.cost, { meta: { align: "right" }, cell: ({ row }) => fmtMoney(row.original.cost) })
    return defs
  }, [names.data, timezone, showCost, pre])
  const choice = useColumnChoice("clicks", catalog, DEFAULT_COLS, FIXED)
  const columns = useMemo(
    () => [...FIXED, ...choice.visible].map((id) => catalog.find((d) => d.id === id)?.col).filter((c): c is ColumnDef<Click, unknown> => !!c),
    [catalog, choice.visible],
  )

  const exportCsv = async () => {
    setExporting(true)
    try {
      const res = await api.clicks.log({ range, filters, search: q || undefined, limit: 100000, offset: 0 })
      const fields = FIELD_LABELS.filter(([k]) => showCost || k !== "cost")
      downloadCsv(
        "clicks.csv",
        fields.map(([, label]) => label),
        res.rows.map((c) => fields.map(([k]) => fieldText(k, c, names.data, timezone))),
      )
      toast.success(`Выгружено строк: ${res.rows.length}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Page>
      <PageHeader
        title="Лог кликов"
        actions={
          <>
            <Button variant="outline" asChild><Link to={reportLink({ g: ["campaign"], filters: userFilters, range })}>Открыть как отчёт</Link></Button>
            <Button variant="outline" onClick={exportCsv} disabled={exporting}>
              <Icon icon={DownloadIcon} size={14} /> Выгрузить CSV
            </Button>
          </>
        }
      />
      <Toolbar
        left={
          <>
            <CampaignSelect value={campaign} onChange={setCampaign} />
            <SearchInput value={q} onChange={setQ} placeholder="Subid, IP или external id" className="sm:w-60" />
            <FilterBuilder value={userFilters} onChange={(f) => setFRaw(encodeFilters(f))} />
          </>
        }
        right={
          <>
            <ColumnsButton all={catalog} value={choice.visible} defaults={DEFAULT_COLS} fixed={FIXED} onChange={choice.setVisible} />
            <PeriodSelect value={range} onChange={setRange} />
          </>
        }
      />
      <DataTable
        data={log.data?.rows}
        loading={log.isLoading}
        columns={columns}
        getRowId={(c) => c.sub_id}
        onRowClick={(c) => setOpen(c.sub_id)}
        storageKey="clicks-log.v3"
        serverPaging={{ total: log.data?.total ?? 0, pageIndex: pg.page, pageSize: pg.size, onPageChange: pg.setPage, onPageSizeChange: pg.setSize }}
        empty="Кликов нет за выбранный период"
        onResetFilters={filtered ? resetFilters : undefined}
        emptyHint={hasExactFilter(userFilters) ? RELAX_HINT : undefined}
      />
      <ClickSheet subId={open} onClose={() => setOpen("")} />
    </Page>
  )
}
