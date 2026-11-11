// Offers: list with stats, filters, bulk actions and a sectioned side sheet.
// An offer is one link inside an offer group; the rate and the cap live in the group, the geo restriction here.
import { Fragment, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { ChevronDownIcon, EllipsisIcon, PlusIcon } from "lucide-react"
import type { Offer, OfferGroupCap } from "@/api/types"
import { api } from "@/api/client"
import { COUNTRIES, REGIONS, STREAM_ACTIONS, regionCountry } from "@/api/meta"
import { DevNote } from "@/features/devnotes/notes"
import { useAccess, useCanSeeMoney, useHiddenMetrics, usePeriod, useUrlParam, useMissingRecord } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { PeriodSelect } from "@/components/period-select"
import { ConfirmDialog, EntitySheet, FormRow, SearchInput, EntityName, StateFilter, metricColumns, metricSummary } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { fmtInt, fmtMetric } from "@/lib/format"
import { FileDrop } from "@/features/catalog/FileDrop"
import { FilterSelect, FormSection, LIST_METRICS, LIST_METRICS_EXTRA, RefSelect, sortMetrics } from "@/features/catalog/ui"
import { CapCell, fmtTerm, geoText } from "./caps"

const METRICS = sortMetrics([...LIST_METRICS, ...LIST_METRICS_EXTRA])
const REDIRECTS = STREAM_ACTIONS.filter((a) => a.kind === "redirect")

// the rate in force today comes from the group's terms; payout_value is the backend's copy of it
const rateOf = (o: Offer, caps?: Record<string, OfferGroupCap>) => caps?.[o.group_id ?? 0]?.term?.payouts[String(o.id)] ?? o.payout_value

type Op = "enable" | "disable" | "clone" | "delete"

export default function OffersPage() {
  const qc = useQueryClient()
  const { canEdit } = useAccess("offers")
  const swap = useAccess("offer_swap")
  const hidden = useHiddenMetrics()
  const money = useCanSeeMoney()
  const [range, setRange] = usePeriod()
  const [q, setQ] = useUrlParam("q")
  const [state, setState] = useUrlParam("state")
  const [group, setGroup] = useUrlParam("group")
  const [network, setNetwork] = useUrlParam("network")
  const [editId, setEditId] = useUrlParam("edit")
  const [presetGroup, setPresetGroup] = useUrlParam("og")
  const [toDelete, setToDelete] = useState<Offer[] | null>(null)

  const list = useQuery({ queryKey: ["offers"], queryFn: api.offers.list })
  const stats = useQuery({ queryKey: ["stats", "offers", range], queryFn: () => api.offers.stats(range) })
  const groups = useQuery({ queryKey: ["offerGroups"], queryFn: api.offerGroups.list })
  const caps = useQuery({ queryKey: ["offerGroups", "caps"], queryFn: api.offerGroups.caps })
  const networks = useQuery({ queryKey: ["affiliateNetworks"], queryFn: api.affiliateNetworks.list })
  const streams = useQuery({ queryKey: ["streams"], queryFn: api.streams.list })

  const rows = useMemo(
    () =>
      (list.data ?? []).filter(
        (o) =>
          (!q || o.name.toLowerCase().includes(q.toLowerCase()) || String(o.id) === q) &&
          (!state || o.state === state) &&
          (!group || String(o.group_id) === group) &&
          (!money || !network || String(o.affiliate_network_id) === network),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.data, q, state, group, network, money, stats.data, caps.data, groups.data, networks.data],
  )

  const save = useMutation({
    mutationFn: (v: Partial<Offer> & { id?: number }) =>
      v.id ? api.offers.update(v.id, v) : api.offers.create(v as Omit<Offer, "id">),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["offers"] })
      qc.invalidateQueries({ queryKey: ["offerGroups"] })
      toast.success(v.id ? "Оффер сохранён" : "Оффер создан. Ставку задайте в условиях оффер-группы")
      setEditId("")
      setPresetGroup("")
    },
  })
  const bulk = useMutation({
    mutationFn: async ({ items, op }: { items: Offer[]; op: Op }) => {
      for (const o of items) {
        if (op === "delete") await api.offers.remove(o.id)
        else if (op === "clone") {
          const { id: _id, ...rest } = o
          void _id
          await api.offers.create({ ...rest, name: `${o.name} (копия)` })
        } else await api.offers.update(o.id, { state: op === "enable" ? "active" : "disabled" })
      }
    },
    onSuccess: (_, { op, items }) => {
      qc.invalidateQueries({ queryKey: ["offers"] })
      toast.success(
        { enable: "Включено", disable: "Выключено", clone: "Клонировано", delete: "Перемещено в архив" }[op] + `: ${items.length}`,
      )
    },
  })

  const columns = useMemo<ColumnDef<Offer, unknown>[]>(
    () => [
      { accessorKey: "id", header: "ID", size: 60, meta: { align: "right" } },
      {
        accessorKey: "name",
        header: "Название",
        enableHiding: false,
        cell: ({ row }) => <EntityName state={row.original.state} name={row.original.name} />,
      },
      { id: "group", header: "Оффер-группа", accessorFn: (o) => groups.data?.find((g) => g.id === o.group_id)?.name ?? "—" },
      ...(money
        ? ([
            { id: "network", header: "Партнёрка", accessorFn: (o) => networks.data?.find((n) => n.id === o.affiliate_network_id)?.name ?? "—" },
          ] as ColumnDef<Offer, unknown>[])
        : []),
      { id: "country", header: "Гео", meta: { label: "Гео (куда отправляет поток)" }, accessorFn: (o) => geoText(o) },
      ...(money
        ? ([
            {
              id: "payout",
              header: "Ставка",
              meta: { align: "right", label: "Ставка сейчас" },
              accessorFn: (o) => rateOf(o, caps.data),
              cell: ({ row }) => <span className="num">{rateOf(row.original, caps.data)} $</span>,
            },
          ] as ColumnDef<Offer, unknown>[])
        : []),
      {
        id: "cap",
        header: "Капа группы",
        accessorFn: (o) => caps.data?.[o.group_id ?? 0]?.pct ?? -1,
        cell: ({ row }) => <CapCell cap={caps.data?.[row.original.group_id ?? 0]} />,
      },
      ...metricColumns<Offer>(METRICS, (o) => stats.data?.[o.id], hidden),
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
              <DropdownMenuItem onClick={() => window.location.assign(`#/reports?f_offer=${encodeURIComponent(row.original.name)}`)}>Отчёт по офферу</DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuItem onClick={() => bulk.mutate({ items: [row.original], op: "clone" })}>Клонировать</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setToDelete([row.original])}>В архив</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups.data, networks.data, stats.data, caps.data, hidden, money, canEdit, setEditId],
  )

  const editing = editId && editId !== "new" ? list.data?.find((o) => String(o.id) === editId) : undefined
  useMissingRecord(editId, list.data, editing, setEditId)
  const usedIn = editing
    ? (streams.data ?? []).filter((s) => s.offers.some((x) => x.offer_id === editing.id)).length
    : 0
  const filtered = !!(q || state || group || (money && network))

  return (
    <Page>
      <PageHeader title="Офферы" />
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
            <FilterSelect value={group} onChange={setGroup} allLabel="Все оффер-группы" className="w-48" options={(groups.data ?? []).map((g) => ({ value: String(g.id), label: g.name }))} />
            {money && (
              <FilterSelect value={network} onChange={setNetwork} allLabel="Все партнёрки" options={(networks.data ?? []).map((n) => ({ value: String(n.id), label: n.name }))} />
            )}
            <StateFilter value={state} onChange={setState} />
            <PeriodSelect value={range} onChange={setRange} />
          </>
        }
      />
      <DataTable
        data={rows}
        loading={list.isLoading}
        columns={columns}
        getRowId={(o) => String(o.id)}
        onRowClick={(o) => setEditId(String(o.id))}
        storageKey="offers.v4"
        initialSort={[{ id: "clicks", desc: true }]}
        initialHidden={["network", "payout", ...LIST_METRICS_EXTRA]}
        summary={metricSummary(METRICS, rows.map((o) => stats.data?.[o.id] ?? {}))}
        bulkActions={
          canEdit
            ? (sel, clear) => (
                <>
                  <Button variant="ghost" onClick={() => { bulk.mutate({ items: sel, op: "enable" }); clear() }}>Включить</Button>
                  <Button variant="ghost" onClick={() => { bulk.mutate({ items: sel, op: "disable" }); clear() }}>Выключить</Button>
                  <Button variant="ghost" onClick={() => { bulk.mutate({ items: sel, op: "clone" }); clear() }}>Клонировать</Button>
                  <Button variant="destructive" onClick={() => setToDelete(sel)}>В архив</Button>
                </>
              )
            : undefined
        }
        empty={filtered ? "Ничего не найдено по фильтрам" : "Офферов пока нет"}
      />

      <OfferSheet
        open={!!editId}
        offer={editing}
        readOnly={!canEdit}
        money={money}
        groups={groups.data ?? []}
        presetGroup={presetGroup ? Number(presetGroup) : null}
        cap={editing ? caps.data?.[editing.group_id ?? 0] : undefined}
        canSwap={swap.canView}
        networks={networks.data ?? []}
        stat={editing ? stats.data?.[editing.id] : undefined}
        usedIn={usedIn}
        onClose={() => { setEditId(""); setPresetGroup("") }}
        onSave={(v) => save.mutate(v)}
        saving={save.isPending}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Переместить в архив: ${toDelete?.length ?? 0}`}
        description="Офферы пропадут из потоков. Восстановить можно в разделе «Архив» в течение 60 дней."
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

const EMPTY: Partial<Offer> = {
  name: "", state: "active", group_id: null, affiliate_network_id: null, offer_type: "external", action_type: "http", url: "",
  payout_type: "CPA", payout_value: 0, payout_currency: "USD", payout_auto: false, payout_upsell: false, country: [],
  regions: [], conversion_cap_enabled: false, daily_cap: 0, conversion_timezone: "Europe/London", alternative_offer_id: null, notes: "",
}

function OfferSheet({
  open, offer, groups, presetGroup, cap, canSwap, networks, stat, usedIn, readOnly, money, onClose, onSave, saving,
}: {
  open: boolean; offer?: Offer; groups: { id: number; name: string; affiliate_network_id: number | null }[]; presetGroup: number | null
  cap?: OfferGroupCap; canSwap: boolean; networks: { id: number; name: string; offer_param: string }[]
  stat?: Record<string, number>; usedIn: number; readOnly: boolean; money: boolean
  onClose: () => void; onSave: (v: Partial<Offer>) => void; saving: boolean
}) {
  const [form, setForm] = useState<Partial<Offer>>({})
  const [err, setErr] = useState<Record<string, string>>({})
  const [zip, setZip] = useState<File | null>(null)
  const key = offer?.id ?? "new"
  const [loadedKey, setLoadedKey] = useState<string | number | null>(null)
  if (open && loadedKey !== key) {
    setLoadedKey(key)
    setErr({})
    setZip(null)
    const g = groups.find((x) => x.id === presetGroup)
    setForm(offer ?? { ...EMPTY, group_id: g?.id ?? null, affiliate_network_id: g?.affiliate_network_id ?? null })
  }
  if (!open && loadedKey !== null) setLoadedKey(null)
  const set = <K extends keyof Offer>(k: K, v: Offer[K]) => setForm((f) => ({ ...f, [k]: v }))
  const hidden = useHiddenMetrics()
  const network = networks.find((n) => n.id === form.affiliate_network_id)
  const countries = form.country ?? []
  const regions = form.regions ?? []

  const submit = () => {
    const e: Record<string, string> = {}
    if (!form.name?.trim()) e.name = "Введите название"
    if (!form.group_id) e.group = "Выберите оффер-группу: в ней капа и ставка"
    if (form.offer_type !== "local" && !form.url?.trim()) e.url = "Укажите адрес оффера"
    setErr(e)
    if (Object.keys(e).length) return
    // a region only makes sense inside a chosen country
    onSave({ ...form, regions: regions.filter((r) => countries.includes(regionCountry(r) ?? "")), id: offer?.id })
  }

  const clicks = stat?.clicks ?? 0
  const strip: [string, string, string][] = [
    ["clicks", "Клики", fmtInt(clicks)],
    ["sales", "Продажи", fmtInt(stat?.sales ?? 0)],
    ["cr", "CR", fmtMetric("cr", stat?.cr ?? 0)],
    ["sale_revenue", "Доход подтв.", fmtMetric("sale_revenue", stat?.sale_revenue ?? 0)],
  ]

  return (
    <EntitySheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={offer ? `Оффер #${offer.id}` : "Новый оффер"}
      description={
        readOnly || offer ? (
          <span className="flex flex-col gap-0.5">
            {readOnly && <span>Только просмотр: у вашей роли нет прав на изменение</span>}
            {offer && (
              <>
                <span className="num flex flex-wrap gap-x-3">
                  <span>За период:</span>
                  {strip.filter(([k]) => !hidden.includes(k)).map(([, label, v]) => (
                    <span key={label} className="whitespace-nowrap">{label} <span className="text-foreground">{v}</span></span>
                  ))}
                </span>
                <span>Используется в потоках: <span className="num text-foreground">{usedIn}</span></span>
              </>
            )}
          </span>
        ) : undefined
      }
      onSubmit={readOnly ? undefined : submit}
      submitLabel={offer ? "Сохранить" : "Создать"}
      submitting={saving}
      footerExtra={offer && canSwap && usedIn > 0 ? (
        <Button type="button" variant="outline" asChild><a href={`#/offers/replace?from=${offer.id}`}>Заменить в кампаниях</a></Button>
      ) : undefined}
    >
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col">
        <FormSection title="Основное">
          <FormRow label="Название" error={err.name} htmlFor="o-name">
            <Input id="o-name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} aria-invalid={!!err.name} />
          </FormRow>
          <FormRow label="Оффер-группа" error={err.group} hint={!err.group ? "Рекл и продукт с общей капой. Ставка по периодам — в группе" : undefined}>
            <RefSelect value={form.group_id} onChange={(v) => {
              set("group_id", v)
              const g = groups.find((x) => x.id === v)
              if (g && !form.affiliate_network_id) set("affiliate_network_id", g.affiliate_network_id)
            }} noneLabel="Не выбрана" options={groups} />
          </FormRow>
          {money && (
            <FormRow
              label="Партнёрка"
              hint={network?.offer_param ? <>К ссылке добавятся параметры партнёрки: <span className="font-mono">{network.offer_param}</span></> : undefined}
            >
              <RefSelect value={form.affiliate_network_id} onChange={(v) => set("affiliate_network_id", v)} noneLabel="Без партнёрки" options={networks} />
            </FormRow>
          )}
          <FormRow label="Тип" hint={form.offer_type === "local" ? "Страница-оффер на трекере, ZIP с index.html" : "Посетитель уходит на внешний адрес"}>
            <Select value={form.offer_type === "local" ? "local" : "external"} onValueChange={(v) => set("offer_type", v as Offer["offer_type"])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="external">Редирект</SelectItem>
                <SelectItem value="local">Локальный</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>
          {form.offer_type === "local" ? (
            <FormRow label="Архив" hint="ZIP с index.html в корне">
              <FileDrop value={zip} onChange={setZip} />
            </FormRow>
          ) : (
            <>
              <FormRow label="Тип редиректа" hint={REDIRECTS.find((a) => a.key === form.action_type)?.description}>
                <Select value={form.action_type} onValueChange={(v) => set("action_type", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{REDIRECTS.map((a) => <SelectItem key={a.key} value={a.key}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </FormRow>
              <FormRow label="URL" error={err.url} hint="Макросы: {subid}, {external_id}, {sub_id_1}…{sub_id_30}, {campaign_id}">
                <Input value={form.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://" aria-invalid={!!err.url} />
              </FormRow>
            </>
          )}
          <FormRow label="Включён">
            <Switch checked={form.state === "active"} onCheckedChange={(v) => set("state", v ? "active" : "disabled")} />
          </FormRow>
        </FormSection>

        {money && (
          <FormSection title="Ставка">
            <FormRow label="Ставка сейчас" hint="Фиксированная за деп. Меняется в условиях оффер-группы по периодам">
              {offer && cap?.term && cap.term.payouts[String(offer.id)] != null ? (
                <span className="text-sm">
                  <span className="num">{cap.term.payouts[String(offer.id)]} $</span>
                  <span className="text-muted-foreground"> · период {fmtTerm(cap.term)} · </span>
                  <a href={`#/offer-groups?edit=${offer.group_id}`} className="text-link">открыть группу</a>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">{offer ? "Не задана в условиях группы на сегодня" : "Задаётся в группе после создания оффера"}</span>
              )}
            </FormRow>
          </FormSection>
        )}

        <FormSection title="Гео">
          <FormRow label="Страны" hint="Поток отправляет на этот оффер только клики из этих стран. Пусто — без ограничений">
            <MultiPick
              label="Страны оффера" empty="Без ограничений" selected={countries}
              options={COUNTRIES.map((c) => ({ value: c.value, label: c.label, hint: c.value }))}
              onChange={(xs) => set("country", xs)}
            />
          </FormRow>
          <FormRow
            label="Регионы"
            hint={countries.some((c) => REGIONS[c])
              ? "Штаты, земли, провинции выбранных стран. Клики из других регионов поток отправит на другие офферы. Пусто — вся страна"
              : "Сначала выберите страну: регионы есть у " + Object.keys(REGIONS).join(", ")}
          >
            <MultiPick
              label="Регионы оффера" empty={countries.some((c) => REGIONS[c]) ? "Вся страна" : "—"} selected={regions.filter((r) => countries.includes(regionCountry(r) ?? ""))}
              options={countries.filter((c) => REGIONS[c]).flatMap((c) => REGIONS[c].map((r) => ({ value: r, label: r, group: COUNTRIES.find((x) => x.value === c)?.label ?? c })))}
              onChange={(xs) => set("regions", xs)}
            />
          </FormRow>
          <DevNote id="offer_geo" className="mt-1" />
        </FormSection>

        <FormSection title="Заметки">
          <FormRow label="Заметки">
            <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </FormRow>
        </FormSection>
      </fieldset>
    </EntitySheet>
  )
}

function MultiPick({ label, empty, selected, options, onChange }: {
  label: string; empty: string; selected: string[]; options: { value: string; label: string; hint?: string; group?: string }[]; onChange: (xs: string[]) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal">
          <span className="truncate">{selected.length ? options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(", ") : empty}</span>
          <Icon icon={ChevronDownIcon} size={14} className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">Нет вариантов</p>}
        {options.map((o, i) => (
          <Fragment key={o.value}>
          {o.group && o.group !== options[i - 1]?.group && <DropdownMenuLabel className="text-xs text-muted-foreground">{o.group}</DropdownMenuLabel>}
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(v) => onChange(v ? [...selected, o.value] : selected.filter((x) => x !== o.value))}
          >
            {o.label} {o.hint && <span className="text-muted-foreground">{o.hint}</span>}
          </DropdownMenuCheckboxItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
