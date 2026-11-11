// Offer groups: one advertiser product with a shared cap, dated terms (rate per offer + caps) and a fallback offer.
import { Fragment, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { ArrowUpIcon, PlusIcon, XIcon } from "lucide-react"
import type { CapMetric, CapWindow, Offer, OfferCap, OfferGroup, OfferGroupCap, OfferTerm } from "@/api/types"
import { api } from "@/api/client"
import { TIMEZONES } from "@/api/meta"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FilterSelect, FormSection, LIST_METRICS, LIST_METRICS_EXTRA, RefSelect, sortMetrics } from "@/features/catalog/ui"
import { CAP_METRICS, CAP_WINDOWS, CapBar, CapCell, fmtDay, fmtTerm, geoText } from "./caps"
import { DevNote } from "@/features/devnotes/notes"

const METRICS = sortMetrics([...LIST_METRICS, ...LIST_METRICS_EXTRA])
const CAP_FILTER = [
  { value: "warn", label: "Почти заполнена" },
  { value: "full", label: "Отлита" },
  { value: "no_term", label: "Нет условий" },
]
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const today = () => ymd(new Date())
const daysLeft = (to: string) => Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86400000)

export default function OfferGroupsPage() {
  const qc = useQueryClient()
  const { canEdit } = useAccess("offers")
  const hidden = useHiddenMetrics()
  const money = useCanSeeMoney()
  const [range, setRange] = usePeriod()
  const [q, setQ] = useUrlParam("q")
  const [state, setState] = useUrlParam("state")
  const [network, setNetwork] = useUrlParam("network")
  const [capFilter, setCapFilter] = useUrlParam("cap")
  const [editId, setEditId] = useUrlParam("edit")
  const [toDelete, setToDelete] = useState<OfferGroup[] | null>(null)

  const list = useQuery({ queryKey: ["offerGroups"], queryFn: api.offerGroups.list })
  const caps = useQuery({ queryKey: ["offerGroups", "caps"], queryFn: api.offerGroups.caps })
  const stats = useQuery({ queryKey: ["stats", "offerGroups", range], queryFn: () => api.offerGroups.stats(range) })
  const offers = useQuery({ queryKey: ["offers"], queryFn: api.offers.list })
  const networks = useQuery({ queryKey: ["affiliateNetworks"], queryFn: api.affiliateNetworks.list })

  const offersOf = (gid: number) => (offers.data ?? []).filter((o) => o.group_id === gid)
  const rows = useMemo(
    () =>
      (list.data ?? []).filter(
        (g) =>
          (!q || g.name.toLowerCase().includes(q.toLowerCase()) || String(g.id) === q || g.product.toLowerCase().includes(q.toLowerCase())) &&
          (!state || g.state === state) &&
          (!money || !network || String(g.affiliate_network_id) === network) &&
          (!capFilter || caps.data?.[g.id]?.status === capFilter),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.data, q, state, network, capFilter, money, caps.data, stats.data, offers.data, networks.data],
  )

  const save = useMutation({
    mutationFn: (v: Partial<OfferGroup> & { id?: number }) =>
      v.id ? api.offerGroups.update(v.id, v) : api.offerGroups.create(v as Omit<OfferGroup, "id">),
    onSuccess: (g, v) => {
      qc.invalidateQueries({ queryKey: ["offerGroups"] })
      qc.invalidateQueries({ queryKey: ["offers"] })
      toast.success(v.id ? "Оффер-группа сохранена" : "Оффер-группа создана: добавьте в неё офферы")
      setEditId(v.id ? "" : String(g.id))
    },
  })
  const bulk = useMutation({
    mutationFn: async ({ items, op }: { items: OfferGroup[]; op: "enable" | "disable" | "delete" }) => {
      for (const g of items) {
        if (op === "delete") await api.offerGroups.remove(g.id)
        else await api.offerGroups.update(g.id, { state: op === "enable" ? "active" : "disabled" })
      }
    },
    onSuccess: (_, { op, items }) => {
      qc.invalidateQueries({ queryKey: ["offerGroups"] })
      toast.success({ enable: "Включено", disable: "Выключено", delete: "Перемещено в архив" }[op] + `: ${items.length}`)
    },
  })

  const columns = useMemo<ColumnDef<OfferGroup, unknown>[]>(
    () => [
      { accessorKey: "id", header: "ID", size: 60, meta: { align: "right" } },
      {
        accessorKey: "name",
        header: "Название",
        enableHiding: false,
        cell: ({ row }) => <EntityName state={row.original.state} name={row.original.name} />,
      },
      ...(money
        ? ([{ id: "network", header: "Партнёрка", accessorFn: (g) => networks.data?.find((n) => n.id === g.affiliate_network_id)?.name ?? "—" }] as ColumnDef<OfferGroup, unknown>[])
        : []),
      { id: "offers", header: "Офферы", meta: { align: "right" }, accessorFn: (g) => offersOf(g.id).length },
      { id: "geo", header: "Гео", accessorFn: (g) => [...new Set(offersOf(g.id).flatMap((o) => o.country))].join(", ") || "—" },
      ...(money
        ? ([{
            id: "rate",
            header: "Ставка",
            meta: { align: "right", label: "Ставка сейчас" },
            accessorFn: (g) => {
              const xs = Object.values(caps.data?.[g.id]?.term?.payouts ?? {})
              return xs.length ? Math.max(...xs) : 0
            },
            cell: ({ row }) => {
              const xs = Object.values(caps.data?.[row.original.id]?.term?.payouts ?? {})
              if (!xs.length) return <span className="text-muted-foreground">—</span>
              const lo = Math.min(...xs), hi = Math.max(...xs)
              return <span className="num">{lo === hi ? `${lo} $` : `${lo}–${hi} $`}</span>
            },
          }] as ColumnDef<OfferGroup, unknown>[])
        : []),
      {
        id: "cap",
        header: "Капа",
        meta: { label: "Капа сейчас" },
        accessorFn: (g) => caps.data?.[g.id]?.pct ?? -1,
        cell: ({ row }) => <CapCell cap={caps.data?.[row.original.id]} />,
      },
      {
        id: "term_to",
        header: "Условия до",
        accessorFn: (g) => caps.data?.[g.id]?.term?.to ?? "",
        cell: ({ row }) => {
          const t = caps.data?.[row.original.id]?.term
          if (!t) return <span className="text-muted-foreground">—</span>
          const left = daysLeft(t.to)
          const next = row.original.terms.some((x) => x.from > t.to)
          return <span className={left <= 3 && !next ? "text-warning" : ""} title={left <= 3 && !next ? "Период заканчивается, следующий не задан" : undefined}>{fmtDay(t.to)}</span>
        },
      },
      {
        id: "fallback",
        header: "Запасной оффер",
        accessorFn: (g) => g.fallback_offer_ids.map((id) => offers.data?.find((o) => o.id === id)?.name ?? `#${id}`).join(" → ") || "—",
        cell: ({ getValue }) => <span className="block max-w-56 truncate">{getValue() as string}</span>,
      },
      ...metricColumns<OfferGroup>(METRICS, (g) => stats.data?.[g.id], hidden),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [networks.data, offers.data, caps.data, stats.data, hidden, money],
  )

  const editing = editId && editId !== "new" ? list.data?.find((g) => String(g.id) === editId) : undefined
  useMissingRecord(editId, list.data, editing, setEditId)
  const filtered = !!(q || state || capFilter || (money && network))

  return (
    <Page>
      <PageHeader title="Оффер-группы" />
      <Toolbar
        left={
          <>
            {canEdit && <Button onClick={() => setEditId("new")}><Icon icon={PlusIcon} size={14} /> Создать</Button>}
            <SearchInput value={q} onChange={setQ} placeholder="Название, продукт или ID" />
          </>
        }
        right={
          <>
            {money && <FilterSelect value={network} onChange={setNetwork} allLabel="Все партнёрки" options={(networks.data ?? []).map((n) => ({ value: String(n.id), label: n.name }))} />}
            <FilterSelect value={capFilter} onChange={setCapFilter} allLabel="Все капы" options={CAP_FILTER} />
            <StateFilter value={state} onChange={setState} />
            <PeriodSelect value={range} onChange={setRange} />
          </>
        }
      />
      <DataTable
        data={rows}
        loading={list.isLoading}
        columns={columns}
        getRowId={(g) => String(g.id)}
        onRowClick={(g) => setEditId(String(g.id))}
        storageKey="offer-groups.v1"
        initialSort={[{ id: "cap", desc: true }]}
        initialHidden={["geo", "fallback", ...LIST_METRICS_EXTRA]}
        summary={metricSummary(METRICS, rows.map((g) => stats.data?.[g.id] ?? {}))}
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
        empty={filtered ? "Ничего не найдено по фильтрам" : "Оффер-групп пока нет"}
      />

      <OfferGroupSheet
        open={!!editId}
        group={editing}
        cap={editing ? caps.data?.[editing.id] : undefined}
        offers={offers.data ?? []}
        networks={networks.data ?? []}
        readOnly={!canEdit}
        money={money}
        onClose={() => setEditId("")}
        onSave={(v) => save.mutate(v)}
        saving={save.isPending}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Переместить в архив: ${toDelete?.length ?? 0}`}
        description="Капа и условия группы перестанут считаться. Офферы останутся в потоках."
        confirmLabel="В архив"
        destructive
        onConfirm={() => { bulk.mutate({ items: toDelete!, op: "delete" }); setToDelete(null) }}
      />
    </Page>
  )
}

// ---------- side sheet ----------

const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)
const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return d }

function emptyGroup(): Partial<OfferGroup> {
  const now = new Date()
  return {
    name: "", state: "active", affiliate_network_id: null, product: "", fallback_offer_ids: [], cap_timezone: "UTC",
    alert_at: [80, 100], alert_chat: "Капы | алерты", notes: "",
    terms: [{ id: 1, from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(monthEnd(now)), caps: [{ metric: "ftd", window: "term", value: 100 }], payouts: {} }],
  }
}

function OfferGroupSheet({
  open, group, cap, offers, networks, readOnly, money, onClose, onSave, saving,
}: {
  open: boolean; group?: OfferGroup; cap?: OfferGroupCap; offers: Offer[]; networks: { id: number; name: string }[]
  readOnly: boolean; money: boolean; onClose: () => void; onSave: (v: Partial<OfferGroup>) => void; saving: boolean
}) {
  const [form, setForm] = useState<Partial<OfferGroup>>({})
  const [err, setErr] = useState<Record<string, string>>({})
  const key = group?.id ?? "new"
  const [loadedKey, setLoadedKey] = useState<string | number | null>(null)
  if (open && loadedKey !== key) {
    setLoadedKey(key)
    setErr({})
    setForm(group ? structuredClone(group) : emptyGroup())
  }
  if (!open && loadedKey !== null) setLoadedKey(null)
  const set = <K extends keyof OfferGroup>(k: K, v: OfferGroup[K]) => setForm((f) => ({ ...f, [k]: v }))
  const own = group ? offers.filter((o) => o.group_id === group.id) : []
  const terms = form.terms ?? []
  const setTerm = (id: number, patch: Partial<OfferTerm>) => set("terms", terms.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const nextTermId = () => Math.max(0, ...terms.map((t) => t.id)) + 1
  const sorted = [...terms].sort((a, b) => (a.from < b.from ? 1 : -1))
  const t0 = today()

  // «Продлить»: the next period starts the day after the latest one ends, runs to the end of that month,
  // keeps the caps and rates (change what the advertiser changed).
  const extend = () => {
    const last = sorted[0]
    const from = last ? addDays(last.to, 1) : new Date()
    set("terms", [...terms, {
      id: nextTermId(), from: ymd(from), to: ymd(monthEnd(from)),
      caps: structuredClone(last?.caps ?? []), payouts: structuredClone(last?.payouts ?? {}),
    }])
  }

  const submit = () => {
    const e: Record<string, string> = {}
    if (!form.name?.trim()) e.name = "Введите название"
    const ts = [...terms].sort((a, b) => (a.from < b.from ? -1 : 1))
    ts.forEach((t, i) => {
      if (!t.from || !t.to || t.to < t.from) e[`term${t.id}`] = "Конец периода раньше начала"
      else if (i > 0 && t.from <= ts[i - 1].to) e[`term${t.id}`] = `Пересекается с периодом ${fmtTerm(ts[i - 1])}`
      if (t.caps.some((c) => !(c.value > 0))) e[`term${t.id}`] = "Капа должна быть больше нуля"
    })
    setErr(e)
    if (Object.keys(e).length) return
    onSave({ ...form, id: group?.id })
  }

  const chain = form.fallback_offer_ids ?? []
  const fallback = offers.find((o) => o.id === chain[0])
  return (
    <EntitySheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      wide
      title={group ? `Оффер-группа #${group.id}` : "Новая оффер-группа"}
      description={readOnly ? "Только просмотр: у вашей роли нет прав на изменение" : group ? undefined : "Рекламодатель, продукт и общая капа. Офферы добавляются после сохранения"}
      onSubmit={readOnly ? undefined : submit}
      submitLabel={group ? "Сохранить" : "Создать"}
      submitting={saving}
    >
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col">
        <FormSection title="Основное">
          <FormRow label="Название" error={err.name} htmlFor="g-name">
            <Input id="g-name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="GoldPeak · Bluewave" aria-invalid={!!err.name} />
          </FormRow>
          {money && (
            <FormRow label="Партнёрка">
              <RefSelect value={form.affiliate_network_id} onChange={(v) => set("affiliate_network_id", v)} noneLabel="Не выбрана" options={networks} />
            </FormRow>
          )}
          <FormRow label="Продукт" hint="Бренд казино">
            <Input value={form.product ?? ""} onChange={(e) => set("product", e.target.value)} />
          </FormRow>
          <FormRow label="Включена">
            <Switch checked={form.state === "active"} onCheckedChange={(v) => set("state", v ? "active" : "disabled")} />
          </FormRow>
        </FormSection>

        {group && cap && (
          <FormSection title="Капа сейчас">
            {cap.term ? (
              <>
                <p className="pb-1 text-xs text-muted-foreground">Период {fmtTerm(cap.term)} · считается по всем кампаниям</p>
                {cap.caps.length ? cap.caps.map((c, i) => <CapBar key={i} cap={c} status={cap.status} />) : <p className="py-1.5 text-sm text-muted-foreground">Без капы</p>}
                {cap.status === "full" && (
                  <p className="py-1.5 text-sm text-destructive">
                    Капа отлита. {fallback ? <>Трафик группы идёт на запасной оффер «{fallback.name}»{chain.length > 1 ? `, дальше по цепочке (${chain.length})` : ""}.</> : "Запасной оффер не задан: клики идут на другие офферы потоков."}
                  </p>
                )}
              </>
            ) : (
              <p className="py-1.5 text-sm text-warning">На сегодня нет условий: добавьте или продлите период ниже</p>
            )}
          </FormSection>
        )}

        {group && (
          <FormSection title={`Офферы · ${own.length}`}>
            {own.length ? (
              <ul className="rounded-md border">
                {own.map((o) => (
                  <li key={o.id} className="flex min-w-0 items-center gap-3 border-b px-3 py-1.5 text-sm last:border-b-0">
                    <a href={`#/offers?edit=${o.id}`} className="min-w-0 flex-1 truncate text-link">{o.name}</a>
                    <span className="shrink-0 text-muted-foreground">{geoText(o)}</span>
                    {money && cap?.term?.payouts[String(o.id)] != null && <span className="num shrink-0">{cap.term.payouts[String(o.id)]} $</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-1.5 text-sm text-muted-foreground">В группе пока нет офферов</p>
            )}
            {!readOnly && (
              <div className="pt-2">
                <Button type="button" variant="outline" asChild><a href={`#/offers?edit=new&og=${group.id}`}><Icon icon={PlusIcon} size={14} /> Добавить оффер</a></Button>
              </div>
            )}
          </FormSection>
        )}

        <FormSection title="Условия по периодам">
          <p className="pb-2 text-xs text-muted-foreground">
            Ставка фиксированная и действует в своём периоде. Новый месяц — «Продлить»: копируются капы и ставки, меняете то, что изменил рекл.
          </p>
          <div className="flex flex-col gap-3">
            {sorted.map((t) => {
              const current = t.from <= t0 && t0 <= t.to
              const past = t.to < t0
              return (
                <div key={t.id} className="min-w-0 rounded-md border">
                  <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                    <Input type="date" className="w-40" value={t.from} onChange={(e) => setTerm(t.id, { from: e.target.value })} aria-label="Начало периода" />
                    <span className="text-muted-foreground">—</span>
                    <Input type="date" className="w-40" value={t.to} onChange={(e) => setTerm(t.id, { to: e.target.value })} aria-label="Конец периода" />
                    <span className={current ? "text-xs text-success" : "text-xs text-muted-foreground"}>{current ? "действует сейчас" : past ? "прошёл" : "будущий"}</span>
                    <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" aria-label="Удалить период" onClick={() => set("terms", terms.filter((x) => x.id !== t.id))}>
                      <Icon icon={XIcon} size={14} />
                    </Button>
                  </div>
                  {err[`term${t.id}`] && <p className="px-3 pt-2 text-xs text-destructive">{err[`term${t.id}`]}</p>}
                  <div className="flex flex-col gap-1 px-3 py-2">
                    <span className="text-xs text-muted-foreground">Капы · пусто = без капы{t.caps.length === 0 && " (сейчас анкап)"}</span>
                    <CapGrid caps={t.caps} onChange={(caps) => setTerm(t.id, { caps })} />
                  </div>
                  {money && (
                    <div className="flex flex-col gap-1 border-t px-3 py-2">
                      <span className="text-xs text-muted-foreground">Ставка за деп</span>
                      {own.length === 0 && <span className="text-sm text-muted-foreground">Ставки задаются после добавления офферов</span>}
                      {own.map((o) => (
                        <div key={o.id} className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm">{o.name}</span>
                          <Input
                            type="number" min={0} inputMode="decimal" className="num w-24 text-right" aria-label={`Ставка: ${o.name}`}
                            value={t.payouts[String(o.id)] ?? ""}
                            onChange={(e) => setTerm(t.id, { payouts: { ...t.payouts, [String(o.id)]: Number(e.target.value) } })}
                          />
                          <span className="text-xs text-muted-foreground">$</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {!readOnly && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" variant="outline" onClick={extend}>{sorted.length ? "Продлить на следующий месяц" : "Добавить период"}</Button>
            </div>
          )}
          <DevNote id="caps" className="mt-3" />
        </FormSection>

        <FormSection title="Когда капа отлита">
          <FormRow label="Запасные офферы" hint="Капа отлита → трафик потоков с офферами группы сам уходит на первый оффер цепочки, у которого ещё есть капа, без замены руками">
            <div className="flex min-w-0 flex-col gap-2">
              {chain.map((id, i) => (
                <div key={i} className="flex min-w-0 items-center gap-2">
                  <span className="num w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <RefSelect
                      value={id}
                      onChange={(v) => set("fallback_offer_ids", v ? chain.map((x, j) => (j === i ? v : x)) : chain.filter((_, j) => j !== i))}
                      noneLabel="Убрать из цепочки"
                      options={fallbackOptions(offers, group?.id, chain, id)}
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Выше" disabled={i === 0}
                    onClick={() => set("fallback_offer_ids", move(chain, i, -1))}><Icon icon={ArrowUpIcon} size={14} /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Убрать" onClick={() => set("fallback_offer_ids", chain.filter((_, j) => j !== i))}>
                    <Icon icon={XIcon} size={14} />
                  </Button>
                </div>
              ))}
              {!readOnly && fallbackOptions(offers, group?.id, chain).length > 0 && (
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={() => set("fallback_offer_ids", [...chain, fallbackOptions(offers, group?.id, chain)[0].id])}>
                    <Icon icon={PlusIcon} size={14} /> {chain.length ? "Ещё запасной" : "Добавить запасной оффер"}
                  </Button>
                </div>
              )}
              {chain.length === 0 && <span className="text-sm text-muted-foreground">Не задан: при отливе клики идут на другие офферы потоков</span>}
            </div>
          </FormRow>
          <FormRow label="Алерты в Telegram" hint="Сколько процентов капы — сообщение в чат">
            <div className="flex flex-wrap gap-4">
              {[50, 80, 90, 100].map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={(form.alert_at ?? []).includes(p)}
                    onCheckedChange={(v) => set("alert_at", v ? [...(form.alert_at ?? []), p].sort((a, b) => a - b) : (form.alert_at ?? []).filter((x) => x !== p))}
                  />
                  {p}%
                </label>
              ))}
            </div>
          </FormRow>
          <FormRow label="Чат для алертов">
            <Input value={form.alert_chat ?? ""} onChange={(e) => set("alert_chat", e.target.value)} placeholder="Название чата или @username" />
          </FormRow>
          <FormRow label="Часовой пояс" hint="Дневная капа начинается заново в 00:00 по этому времени. По умолчанию UTC, у некоторых офферов свой">
            <Select value={form.cap_timezone} onValueChange={(v) => set("cap_timezone", v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{[...new Set([...TIMEZONES, form.cap_timezone ?? "UTC"])].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </FormRow>
        </FormSection>

        <FormSection title="Заметки">
          <FormRow label="Заметки">
            <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Контакт рекла, условия выплат, что делать при отливе" />
          </FormRow>
        </FormSection>
      </fieldset>
    </EntitySheet>
  )
}

// offers outside the group that are not in the chain yet (plus the one already in this slot)
const fallbackOptions = (offers: Offer[], groupId: number | undefined, chain: number[], keep?: number) =>
  offers.filter((o) => o.group_id !== groupId && o.state === "active" && (o.id === keep || !chain.includes(o.id))).map((o) => ({ id: o.id, name: o.name }))
const move = (xs: number[], i: number, d: number) => { const n = [...xs]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n }

// Caps as a table: FTD / installs × for the period / per day. An empty cell = no such cap.
function CapGrid({ caps, onChange }: { caps: OfferCap[]; onChange: (c: OfferCap[]) => void }) {
  const get = (m: CapMetric, w: CapWindow) => caps.find((c) => c.metric === m && c.window === w)?.value
  const put = (m: CapMetric, w: CapWindow, raw: string) => {
    const rest = caps.filter((c) => !(c.metric === m && c.window === w))
    const v = Math.floor(Number(raw))
    onChange(raw.trim() === "" || !(v > 0) ? rest : [...rest, { metric: m, window: w, value: v }])
  }
  return (
    <div className="grid max-w-md grid-cols-[1fr_6rem_6rem] items-center gap-x-2 gap-y-1.5 text-sm">
      <span />
      {CAP_WINDOWS.map((w) => <span key={w.value} className="text-right text-xs text-muted-foreground">{w.label}</span>)}
      {CAP_METRICS.map((m) => (
        <Fragment key={m.value}>
          <span className="truncate">{m.label}</span>
          {CAP_WINDOWS.map((w) => (
            <Input
              key={w.value} type="number" min={1} inputMode="numeric" className="num text-right" placeholder="—"
              aria-label={`${m.label} ${w.label.toLowerCase()}`}
              value={get(m.value, w.value) ?? ""}
              onChange={(e) => put(m.value, w.value, e.target.value)}
            />
          ))}
        </Fragment>
      ))}
    </div>
  )
}
