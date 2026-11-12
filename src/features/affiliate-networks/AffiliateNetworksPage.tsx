// Affiliate networks: list with stats, sheet with offer-URL params, postback for the partner's panel and the network's offers.
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { EllipsisIcon, PlusIcon } from "lucide-react"
import type { AffiliateNetwork } from "@/api/types"
import { api } from "@/api/client"
import { useAccess, useCanSeeMoney, useHiddenMetrics, usePeriod, useUrlParam, useMissingRecord } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { PeriodSelect } from "@/components/period-select"
import {
  ConfirmDialog, CopyButton, EntitySheet, FormRow, SearchInput, EntityName, StateFilter, metricColumns, metricSummary,
} from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FormSection, LIST_METRICS, LIST_METRICS_EXTRA, UsedIn, curSymbol, sortMetrics } from "@/features/catalog/ui"

const METRICS = sortMetrics([...LIST_METRICS, ...LIST_METRICS_EXTRA])

type Op = "enable" | "disable" | "delete"

export default function AffiliateNetworksPage() {
  const qc = useQueryClient()
  const { canEdit } = useAccess("affiliate_networks")
  const hidden = useHiddenMetrics()
  const money = useCanSeeMoney()
  const [range, setRange] = usePeriod()
  const [q, setQ] = useUrlParam("q")
  const [state, setState] = useUrlParam("state")
  const [editId, setEditId] = useUrlParam("edit")
  const [toDelete, setToDelete] = useState<AffiliateNetwork[] | null>(null)

  const list = useQuery({ queryKey: ["affiliateNetworks"], queryFn: api.affiliateNetworks.list })
  const stats = useQuery({ queryKey: ["stats", "affiliateNetworks", range], queryFn: () => api.affiliateNetworks.stats(range) })
  const offers = useQuery({ queryKey: ["offers"], queryFn: api.offers.list })
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings.get })
  const streams = useQuery({ queryKey: ["streams"], queryFn: api.streams.list })
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })
  // Streams that use at least one offer of the given networks.
  const usedBy = (networkIds: number[]) => {
    const offerIds = new Set((offers.data ?? []).filter((o) => o.affiliate_network_id && networkIds.includes(o.affiliate_network_id)).map((o) => o.id))
    return (streams.data ?? []).filter((s) => s.offers.some((x) => offerIds.has(x.offer_id)))
  }

  const offerCount = useMemo(() => {
    const m = new Map<number, number>()
    for (const o of offers.data ?? []) if (o.affiliate_network_id) m.set(o.affiliate_network_id, (m.get(o.affiliate_network_id) ?? 0) + 1)
    return m
  }, [offers.data])

  const rows = useMemo(
    () =>
      (list.data ?? []).filter(
        (n) => (!q || n.name.toLowerCase().includes(q.toLowerCase()) || String(n.id) === q) && (!state || n.state === state),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.data, q, state, stats.data, offerCount],
  )

  const save = useMutation({
    mutationFn: (v: Partial<AffiliateNetwork> & { id?: number }) =>
      v.id ? api.affiliateNetworks.update(v.id, v) : api.affiliateNetworks.create(v as Omit<AffiliateNetwork, "id">),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["affiliateNetworks"] })
      toast.success(v.id ? "Партнёрская сеть сохранена" : "Партнёрка создана")
      setEditId("")
    },
  })
  const bulk = useMutation({
    mutationFn: async ({ items, op }: { items: AffiliateNetwork[]; op: Op }) => {
      for (const n of items) {
        if (op === "delete") await api.affiliateNetworks.remove(n.id)
        else await api.affiliateNetworks.update(n.id, { state: op === "enable" ? "active" : "disabled" })
      }
    },
    onSuccess: (_, { op, items }) => {
      qc.invalidateQueries({ queryKey: ["affiliateNetworks"] })
      toast.success({ enable: "Включено", disable: "Выключено", delete: "Перемещено в архив" }[op] + `: ${items.length}`)
    },
  })

  const columns = useMemo<ColumnDef<AffiliateNetwork, unknown>[]>(
    () => [
      { accessorKey: "id", header: "ID", size: 60, meta: { align: "right" } },
      {
        accessorKey: "name",
        header: "Название",
        enableHiding: false,
        cell: ({ row }) => <EntityName state={row.original.state} name={row.original.name} />,
      },
      { id: "offers", header: "Офферов", meta: { align: "right" }, accessorFn: (n) => offerCount.get(n.id) ?? 0 },
      ...metricColumns<AffiliateNetwork>(METRICS, (n) => stats.data?.[n.id], hidden),
      {
        id: "_menu",
        enableHiding: false,
        enableSorting: false,
        size: 36,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon-sm" aria-label="Действия"><Icon icon={EllipsisIcon} size={14} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => setEditId(String(row.original.id))}>Изменить</DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.location.assign(`#/offers?network=${row.original.id}`)}>Офферы партнёрки</DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.location.assign(`#/reports?f_affiliate_network=${encodeURIComponent(row.original.name)}`)}>Отчёт по партнёрке</DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setToDelete([row.original])}>В архив</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [stats.data, offerCount, hidden, canEdit, setEditId],
  )

  const editing = editId && editId !== "new" ? list.data?.find((n) => String(n.id) === editId) : undefined
  useMissingRecord(editId, list.data, editing, setEditId)

  return (
    <Page>
      <PageHeader title="Партнёрские сети" />
      <Toolbar
        left={
          <>
            {canEdit && (
              <Button onClick={() => setEditId("new")}>
                <Icon icon={PlusIcon} size={14} /> Создать
              </Button>
            )}
            <SearchInput value={q} onChange={setQ} placeholder="Название или ID" />
          </>
        }
        right={
          <>
            <StateFilter value={state} onChange={setState} />
            <PeriodSelect value={range} onChange={setRange} />
          </>
        }
      />
      <DataTable
        data={rows}
        loading={list.isLoading}
        columns={columns}
        getRowId={(n) => String(n.id)}
        onRowClick={(n) => setEditId(String(n.id))}
        storageKey="affiliate-networks.v2"
        initialHidden={LIST_METRICS_EXTRA}
        initialSort={[{ id: "clicks", desc: true }]}
        summary={{ offers: rows.reduce((s, n) => s + (offerCount.get(n.id) ?? 0), 0), ...metricSummary(METRICS, rows.map((n) => stats.data?.[n.id] ?? {})) }}
        bulkActions={
          canEdit
            ? (sel, clear) => (
                <>
                  <Button variant="ghost" onClick={() => { bulk.mutate({ items: sel, op: "enable" }); clear() }}>Включить</Button>
                  <Button variant="ghost" onClick={() => { bulk.mutate({ items: sel, op: "disable" }); clear() }}>Выключить</Button>
                  <Button variant="destructive" onClick={() => setToDelete(sel)}>В архив</Button>
                </>
              )
            : undefined
        }
        empty={q || state ? "Ничего не найдено по фильтрам" : "Партнёрских сетей пока нет"}
      />

      <NetworkSheet
        open={!!editId}
        network={editing}
        readOnly={!canEdit}
        postbackKey={settings.data?.postback_key}
        money={money}
        streams={editing ? usedBy([editing.id]) : []}
        campaigns={campaigns.data ?? []}
        offers={(offers.data ?? []).filter((o) => editing && o.affiliate_network_id === editing.id)}
        onClose={() => setEditId("")}
        onSave={(v) => save.mutate(v)}
        saving={save.isPending}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Переместить в архив: ${toDelete?.length ?? 0}`}
        description={`Офферы этих партнёрок останутся, но потеряют параметры к URL. ${
          usedBy((toDelete ?? []).map((n) => n.id)).length
            ? `Офферы партнёрок используются в потоках: ${usedBy((toDelete ?? []).map((n) => n.id)).length}.`
            : "Ни в одном потоке офферы этих партнёрок не используются."
        } Восстановить можно в разделе «Архив» в течение 60 дней.`}
        confirmLabel="В архив"
        destructive
        onConfirm={() => {
          bulk.mutate({ items: toDelete!, op: "delete" })
          setToDelete(null)
        }}
      />
    </Page>
  )
}

function NetworkSheet({
  open, network, offers, postbackKey, readOnly, money, streams, campaigns, onClose, onSave, saving,
}: {
  open: boolean; network?: AffiliateNetwork; offers: { id: number; name: string; payout_value: number; payout_currency: string; payout_type: string }[]
  postbackKey?: string; readOnly: boolean; money: boolean
  streams: { id: number; name: string; campaign_id: number }[]; campaigns: { id: number; name: string }[]
  onClose: () => void; onSave: (v: Partial<AffiliateNetwork>) => void; saving: boolean
}) {
  const [form, setForm] = useState<Partial<AffiliateNetwork>>({})
  const [err, setErr] = useState<Record<string, string>>({})
  const key = network?.id ?? "new"
  const [loadedKey, setLoadedKey] = useState<string | number | null>(null)
  const defaultPostback = `https://trk.example.com/${postbackKey ?? "key"}/postback?subid={sub1}&status={status}&payout={payout}`
  // wait for the settings: the default postback carries the tracker's postback key
  if (open && loadedKey !== key && (network || postbackKey)) {
    setLoadedKey(key)
    setErr({})
    setForm(network ?? { name: "", state: "active", offer_param: "sub1={subid}", postback_url: defaultPostback, notes: "" })
  }
  if (!open && loadedKey !== null) setLoadedKey(null)
  const set = <K extends keyof AffiliateNetwork>(k: K, v: AffiliateNetwork[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    const e: Record<string, string> = {}
    if (!form.name?.trim()) e.name = "Введите название"
    setErr(e)
    if (Object.keys(e).length) return
    onSave({ ...form, id: network?.id })
  }

  return (
    <EntitySheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={network ? `Партнёрка #${network.id}` : "Новая партнёрка"}
      description={readOnly ? "Только просмотр: у вашей роли нет прав на изменение" : undefined}
      onSubmit={readOnly ? undefined : submit}
      submitLabel={network ? "Сохранить" : "Создать"}
      submitting={saving}
    >
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col">
        <FormSection title="Основное">
          <FormRow label="Название" error={err.name} htmlFor="n-name">
            <Input id="n-name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} aria-invalid={!!err.name} />
          </FormRow>
          <FormRow
            label="Параметры к URL оффера"
            hint="Добавляются к ссылке каждого оффера этой партнёрки. Макросы: {subid}, {external_id}, {sub_id_1}…{sub_id_30}, {ip}"
          >
            <Input className="font-mono" value={form.offer_param ?? ""} onChange={(e) => set("offer_param", e.target.value)} placeholder="sub1={subid}&sub2={sub_id_6}" />
          </FormRow>
        </FormSection>

        <FormSection title="Постбек">
          <FormRow
            label="Постбек для кабинета партнёрки"
            hint="Вставьте этот адрес в кабинет партнёрки. На работу трекера поле не влияет, его нельзя изменить."
          >
            <div className="flex gap-2">
              <Input readOnly className="font-mono" value={form.postback_url ?? ""} onFocus={(e) => e.currentTarget.select()} />
              <CopyButton value={form.postback_url ?? ""} />
            </div>
          </FormRow>
        </FormSection>

        <FormSection title="Заметки">
          <FormRow label="Заметки">
            <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </FormRow>
        </FormSection>

        {network && (
          <FormSection title="Использование">
            <UsedIn streams={streams} campaigns={campaigns} extra={<span> (через офферы партнёрки)</span>} />
          </FormSection>
        )}

        {network && (
          <FormSection title={`Офферы партнёрки: ${offers.length}`}>
            {offers.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Офферов нет. Выберите эту партнёрку в оффере.</p>
            ) : (
              <ul className="mt-1 rounded-md border">
                {offers.map((o) => (
                  <li key={o.id} className="border-b last:border-b-0">
                    <a
                      href={`#/offers?edit=${o.id}`}
                      className="flex items-center gap-2 px-2 py-1.5 text-sm"
                    >
                      <span className="num w-10 shrink-0 text-muted-foreground">#{o.id}</span>
                      <span className="min-w-0 flex-1 truncate">{o.name}</span>
                      {money && <span className="num shrink-0 text-muted-foreground">{o.payout_value} {curSymbol(o.payout_currency)} {o.payout_type}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </FormSection>
        )}
      </fieldset>
    </EntitySheet>
  )
}
