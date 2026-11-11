// Conversions log: period, status, campaign, partner network, buyer, search by subid / tid; server-like pagination (api.conversions.log).
// Row → side sheet (full data, status / payout change with a reason); bulk «Подтвердить» / «Отклонить»;
// «Загрузить конверсии» (CSV text) and «Выгрузить CSV». Money columns are hidden for roles without money access.
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { CheckIcon, DownloadIcon, UploadIcon, XIcon } from "lucide-react"
import type { Conversion, ConversionStatus } from "@/api/types"
import { api } from "@/api/client"
import { CONVERSION_STATUSES, rejectReasonLabel } from "@/api/meta"
import { useAccess, useApp, useCanSeeMoney, usePeriod, useUrlParam } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { PeriodSelect } from "@/components/period-select"
import { SearchInput, downloadCsv } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDateTime } from "@/lib/dates"
import { fmtMoney } from "@/lib/format"
import { BulkStatusDialog, ConversionSheet, duration } from "./ConversionSheet"
import { ImportSheet } from "./ImportSheet"
import { CampaignSelect, Clip, ConversionStatusCell, EntityName, STATUS_SHORT, useColumnPrefixes, usePage, useNames } from "./shared"

export default function ConversionsLogPage() {
  const { timezone } = useApp()
  const [range, setRange] = usePeriod()
  const [status, setStatus] = useUrlParam("status")
  const [campaign, setCampaign] = useUrlParam("c")
  const [network, setNetwork] = useUrlParam("net")
  const [buyer, setBuyer] = useUrlParam("buyer")
  const [q, setQ] = useUrlParam("q")
  const [open, setOpen] = useUrlParam("conv")
  const [importing, setImporting] = useState(false)
  const [bulk, setBulk] = useState<{ status: ConversionStatus; ids: string[]; clear: () => void } | null>(null)
  const money = useCanSeeMoney()
  const { canEdit } = useAccess("conversions")
  const seeNetworks = useAccess("affiliate_networks").canView
  const names = useNames()
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })
  const networks = useQuery({ queryKey: ["affiliateNetworks"], queryFn: api.affiliateNetworks.list, enabled: seeNetworks })
  // buyers of the campaigns this viewer sees: the filter is useful only when there is more than one
  const buyerIds = [...new Set((campaigns.data ?? []).map((c) => c.owner_id))]
  const pg = usePage(JSON.stringify([range, status, campaign, network, buyer, q]))
  const query = {
    range, status: status || undefined, campaign_id: campaign ? Number(campaign) : undefined,
    network_id: network && seeNetworks ? Number(network) : undefined, buyer_id: buyer ? Number(buyer) : undefined, search: q || undefined,
  }

  const log = useQuery({
    queryKey: ["conversions", "log", range, status, campaign, network, buyer, q, pg.page, pg.size, seeNetworks],
    queryFn: () =>
      api.conversions.log({ ...query, limit: pg.size, offset: pg.page * pg.size }),
    placeholderData: keepPreviousData,
  })

  const pre = useColumnPrefixes(log.data?.rows, names.data)
  const filtered = !!(status || campaign || network || buyer || q)
  const [, setParams] = useSearchParams()
  // one update for all keys (several useUrlParam setters in a row overwrite each other)
  const resetFilters = () => setParams((p) => { const n = new URLSearchParams(p); ["status", "c", "net", "buyer", "q"].forEach((k) => n.delete(k)); return n }, { replace: true })

  const columns = useMemo<ColumnDef<Conversion, unknown>[]>(() => {
    const nm = names.data
    const col = (id: string, header: string, accessorFn: (c: Conversion) => string | number | null | undefined, extra: Partial<ColumnDef<Conversion, unknown>> = {}) =>
      ({ id, header, accessorFn, enableSorting: false, ...extra }) as ColumnDef<Conversion, unknown>
    return [
      col("postback", "Время постбека", (c) => formatDateTime(c.postback_datetime, timezone), { enableHiding: false }),
      col("sub_id", "Subid", (c) => c.sub_id, {
        cell: ({ row }) => <span className="font-mono">{row.original.sub_id}</span>,
      }),
      col("click_time", "Время клика", (c) => formatDateTime(c.click_datetime, timezone)),
      col("ttc", "До конверсии", (c) => duration(Date.parse(c.postback_datetime) - Date.parse(c.click_datetime)), { meta: { align: "right" } }),
      col("campaign", "Кампания", (c) => nm?.campaigns[c.campaign_id] ?? c.campaign_id, {
        cell: ({ row }) => <Clip><EntityName id={row.original.campaign_id} name={nm?.campaigns[row.original.campaign_id]} prefix={pre.campaign} /></Clip>,
      }),
      col("buyer", "Байер", (c) => nm?.buyers[nm.campaignOwner[c.campaign_id]] ?? "—"),
      col("stream", "Поток", (c) => nm?.streams[c.stream_id] ?? c.stream_id, {
        cell: ({ row }) => <Clip><EntityName id={row.original.stream_id} name={nm?.streams[row.original.stream_id]} prefix={pre.stream} /></Clip>,
      }),
      col("landing", "Лендинг", (c) => (c.landing_id ? nm?.landings[c.landing_id] ?? c.landing_id : "—"), {
        cell: ({ row }) => <Clip><EntityName id={row.original.landing_id} name={row.original.landing_id ? nm?.landings[row.original.landing_id] : undefined} prefix={pre.landing} /></Clip>,
      }),
      col("offer", "Оффер", (c) => (c.offer_id ? nm?.offers[c.offer_id] ?? c.offer_id : "—"), {
        meta: { grow: true },
        cell: ({ row }) => <Clip><EntityName id={row.original.offer_id} name={row.original.offer_id ? nm?.offers[row.original.offer_id] : undefined} prefix={pre.offer} /></Clip>,
      }),
      ...(seeNetworks
        ? [col("network", "Партнёрка", (c) => (c.offer_id ? nm?.networks[nm.offerNetwork[c.offer_id]] ?? "—" : "—"))]
        : []),
      col("status", "Статус", (c) => c.status, {
        cell: ({ row }) => <ConversionStatusCell status={row.original.status} />,
      }),
      col("original_status", "Исходный статус", (c) => c.original_status, { cell: ({ row }) => <span className="text-muted-foreground">{row.original.original_status}</span> }),
      col("previous_status", "Предыдущий", (c) => (c.previous_status ? STATUS_SHORT[c.previous_status] : "—")),
      col("reject_reason", "Причина отклонения", (c) => c.reject_reason || "—", {
        cell: ({ row }) => row.original.reject_reason
          ? <span title={rejectReasonLabel(row.original.reject_reason)}>{row.original.reject_reason}</span>
          : <span className="text-muted-foreground">—</span>,
      }),
      ...(money
        ? [col("revenue", "Выплата", (c) => c.revenue, {
            meta: { align: "right" },
            cell: ({ row }) => {
              const c = row.original
              return c.status === "sale" && c.revenue === 0
                ? <span className="font-medium text-destructive" title="Продажа без выплаты: проверьте оффер и постбек">0 $</span>
                : fmtMoney(c.revenue)
            },
          })]
        : []),
      col("tid", "TID", (c) => c.tid, { cell: ({ row }) => <span className="font-mono">{row.original.tid}</span> }),
    ]
  }, [names.data, timezone, money, pre, seeNetworks])

  const [exporting, setExporting] = useState(false)
  const exportCsv = async () => {
    setExporting(true)
    try {
      const nm = names.data
      const res = await api.conversions.log({ ...query, limit: 100000, offset: 0 })
      downloadCsv(
        "conversions.csv",
        ["Время постбека", "Subid", "Время клика", "Кампания", "Байер", "Поток", "Лендинг", "Оффер", ...(seeNetworks ? ["Партнёрка"] : []), "Статус", "Исходный статус", "Предыдущий статус", ...(money ? ["Выплата"] : []), "TID"],
        res.rows.map((c) => [
          formatDateTime(c.postback_datetime, timezone), c.sub_id, formatDateTime(c.click_datetime, timezone),
          nm?.campaigns[c.campaign_id] ?? c.campaign_id, nm?.buyers[nm.campaignOwner[c.campaign_id]] ?? "", nm?.streams[c.stream_id] ?? c.stream_id,
          c.landing_id ? nm?.landings[c.landing_id] ?? c.landing_id : "", c.offer_id ? nm?.offers[c.offer_id] ?? c.offer_id : "",
          ...(seeNetworks ? [c.offer_id ? nm?.networks[nm.offerNetwork[c.offer_id]] ?? "" : ""] : []),
          STATUS_SHORT[c.status], c.original_status, c.previous_status ? STATUS_SHORT[c.previous_status] : "",
          ...(money ? [c.revenue] : []), c.tid,
        ]),
      )
      toast.success(`Выгружено строк: ${res.rows.length}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Page>
      <PageHeader
        title="Лог конверсий"
        actions={
          <>
            {canEdit && (
              <Button variant="outline" onClick={() => setImporting(true)}>
                <Icon icon={UploadIcon} size={14} /> Загрузить конверсии
              </Button>
            )}
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
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {CONVERSION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {seeNetworks && (
              <Select value={network || "all"} onValueChange={(v) => setNetwork(v === "all" ? "" : v)}>
                <SelectTrigger className="w-44" aria-label="Партнёрка"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все партнёрки</SelectItem>
                  {(networks.data ?? []).map((n) => <SelectItem key={n.id} value={String(n.id)}>{n.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {buyerIds.length > 1 && (
              <Select value={buyer || "all"} onValueChange={(v) => setBuyer(v === "all" ? "" : v)}>
                <SelectTrigger className="w-40" aria-label="Байер"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все байеры</SelectItem>
                  {buyerIds.map((id) => <SelectItem key={id} value={String(id)}>{names.data?.buyers[id] ?? `#${id}`}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <SearchInput value={q} onChange={setQ} placeholder="Subid или TID" />
          </>
        }
        right={<PeriodSelect value={range} onChange={setRange} />}
      />
      <DataTable
        data={log.data?.rows}
        loading={log.isLoading}
        columns={columns}
        getRowId={(c) => c.conversion_id}
        onRowClick={(c) => setOpen(c.conversion_id)}
        bulkActions={
          canEdit
            ? (sel, clear) => (
                <>
                  <Button variant="ghost" onClick={() => setBulk({ status: "sale", ids: sel.map((c) => c.conversion_id), clear })}>
                    <Icon icon={CheckIcon} size={14} /> Подтвердить
                  </Button>
                  <Button variant="ghost" onClick={() => setBulk({ status: "rejected", ids: sel.map((c) => c.conversion_id), clear })}>
                    <Icon icon={XIcon} size={14} /> Отклонить
                  </Button>
                </>
              )
            : undefined
        }
        storageKey="conversions-log.v3"
        initialHidden={["click_time", "ttc", "stream", "original_status", "previous_status", "tid"]}
        serverPaging={{ total: log.data?.total ?? 0, pageIndex: pg.page, pageSize: pg.size, onPageChange: pg.setPage, onPageSizeChange: pg.setSize }}
        empty="Конверсий нет за выбранный период"
        onResetFilters={filtered ? resetFilters : undefined}
      />
      <ConversionSheet id={open} onClose={() => setOpen("")} />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
      <BulkStatusDialog status={bulk?.status ?? null} ids={bulk?.ids ?? []} onClose={() => setBulk(null)} onDone={() => bulk?.clear()} />
    </Page>
  )
}
