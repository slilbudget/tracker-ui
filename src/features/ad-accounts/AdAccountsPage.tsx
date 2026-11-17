// «Кабинеты»: ad accounts (FB API access, money, status), their assignment to buyers by period,
// the providers (agencies / our farm) and the provider fee by period. Token and proxy: admins only.
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { EyeIcon, FileJsonIcon, PlusIcon, XIcon } from "lucide-react"
import type { AccountImportResult, AccountImportRow, AdAccountAssignment, AdFeePeriod, AdProvider, FbAdAccount, FbCampaign } from "@/api/types"
import { api } from "@/api/client"
import { useAccess, useApp, useUrlParam } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { EntitySheet, FormRow, SearchInput } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CopyButton } from "@/components/common"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FilterSelect, FormSection, RefSelect } from "@/features/catalog/ui"
import { DevNote } from "@/features/devnotes/notes"
import { formatDate, formatDateTime } from "@/lib/dates"
import { fmtMoney } from "@/lib/format"
import { cn } from "@/lib/utils"

const STATUS = [
  { value: "active", label: "Работают" },
  { value: "free", label: "Свободные (без байера)" },
  { value: "error", label: "С ошибкой API" },
  { value: "diff", label: "Нераспределённый расход" },
  { value: "off", label: "Выключены" },
]
const diffOf = (a: FbAdAccount) => a.spend_diff + a.spend_offset
const ago = (iso: string | null) => {
  if (!iso) return "—"
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 60 ? `${m} мин назад` : m < 48 * 60 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн. назад`
}
const pct = (v: number) => `${String(v).replace(".", ",")}%`
const today = () => new Date().toISOString().slice(0, 10)
const dmy = (d: string) => d.split("-").reverse().join(".")

export default function AdAccountsPage() {
  const [tab, setTab] = useUrlParam("tab", "accounts")
  const { isFull } = useAccess("ad_accounts")
  return (
    <Page>
      <PageHeader title="Рекламные кабинеты" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="accounts">Кабинеты</TabsTrigger>
          <TabsTrigger value="providers">Провайдеры</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "providers" ? <ProvidersTab canEdit={isFull} /> : <AccountsTab />}
      <DevNote id="ad_accounts" />
    </Page>
  )
}

// ---------- accounts ----------

function AccountsTab() {
  const { timezone } = useApp()
  const { canEdit, isFull } = useAccess("ad_accounts")
  const [q, setQ] = useUrlParam("q")
  const [buyer, setBuyer] = useUrlParam("buyer")
  const [provider, setProvider] = useUrlParam("provider")
  const [status, setStatus] = useUrlParam("status")
  const [editId, setEditId] = useUrlParam("edit")
  const list = useQuery({ queryKey: ["adAccounts"], queryFn: api.adAccounts.list })
  const users = useQuery({ queryKey: ["users"], queryFn: api.users.list })
  const providers = useQuery({ queryKey: ["adProviders"], queryFn: api.adAccounts.providers.list })
  const login = (id: number | null) => (id == null ? null : users.data?.find((u) => u.id === id)?.login ?? `#${id}`)

  const rows = useMemo(() => (list.data ?? []).filter((a) => {
    const s = q.toLowerCase()
    return (!s || a.id.includes(s) || a.name.toLowerCase().includes(s)) &&
      (!buyer || String(a.buyer_id) === buyer) &&
      (!provider || a.agency === provider) &&
      (!status || (status === "active" ? a.active && !a.last_error : status === "free" ? a.buyer_id == null && a.active
        : status === "error" ? !!a.last_error : status === "diff" ? diffOf(a) > a.alert_on_spend_diff : !a.active))
  }), [list.data, q, buyer, provider, status])

  const columns = useMemo<ColumnDef<FbAdAccount, unknown>[]>(() => [
    { id: "id", header: "ID кабинета", accessorFn: (a) => a.id, cell: ({ row }) => <span className="font-mono">{row.original.id}</span> },
    { id: "name", header: "Название", enableHiding: false, meta: { grow: true }, accessorFn: (a) => a.name },
    { id: "buyer", header: "Байер", accessorFn: (a) => login(a.buyer_id) ?? "", cell: ({ row }) => login(row.original.buyer_id) ?? <span className="text-muted-foreground">свободен</span> },
    { id: "provider", header: "Провайдер", accessorFn: (a) => a.agency },
    { id: "fee", header: "Комиссия", meta: { align: "right" }, accessorFn: (a) => a.agency_fee, cell: ({ row }) => <span className="num">{pct(row.original.agency_fee)}</span> },
    {
      id: "state", header: "Статус", accessorFn: (a) => (!a.active ? 2 : a.last_error ? 1 : 0),
      cell: ({ row }) => {
        const a = row.original
        return !a.active ? <span className="text-muted-foreground">Выключен</span>
          : a.last_error ? <span className="text-destructive" title={a.last_error}>Ошибка API</span>
          : <span className="text-success">Работает</span>
      },
    },
    { id: "balance", header: "Баланс FB", meta: { align: "right" }, accessorFn: (a) => a.fb_balance, cell: ({ row }) => <span className="num">{fmtMoney(row.original.fb_balance)}</span> },
    { id: "spend", header: "Расход всего", meta: { align: "right" }, accessorFn: (a) => a.total_spend, cell: ({ row }) => <span className="num">{fmtMoney(row.original.total_spend)}</span> },
    {
      id: "diff", header: "Не распределено", meta: { align: "right", label: "Нераспределённый расход" }, accessorFn: diffOf,
      cell: ({ row }) => {
        const a = row.original
        const d = diffOf(a)
        return <span className={cn("num", d > a.alert_on_spend_diff ? "text-destructive" : d > 0 ? "" : "text-muted-foreground")} title={a.spend_diff_comment || `Порог алерта ${a.alert_on_spend_diff} $`}>{fmtMoney(d)}</span>
      },
    },
    { id: "checked", header: "Проверен", accessorFn: (a) => a.balance_checked_at ?? "", cell: ({ row }) => <span className={cn(row.original.last_error && "text-warning")}>{ago(row.original.balance_checked_at)}</span> },
    { id: "currency", header: "Валюта", accessorFn: (a) => a.currency },
    { id: "tz", header: "Часовой пояс", accessorFn: (a) => a.timezone },
    { id: "handed", header: "Передан нам", accessorFn: (a) => a.handed_at, cell: ({ row }) => formatDate(row.original.handed_at, timezone) },
    { id: "created", header: "Создан в FB", accessorFn: (a) => a.created_at, cell: ({ row }) => formatDate(row.original.created_at, timezone) },
    { id: "multi_geo", header: "Мульти-гео", accessorFn: (a) => (a.multi_geo ? "да" : "нет") },
    { id: "token", header: "Токен API", accessorFn: (a) => a.api_token, cell: ({ row }) => <span className="font-mono text-muted-foreground">{row.original.api_token || "—"}</span> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [users.data, timezone])

  const buyers = (users.data ?? []).filter((u) => u.role_id === 3 || u.role_id === 5)
  const [, setParams] = useSearchParams()
  const filtered = !!(q || buyer || provider || status)
  const reset = () => setParams((p) => { const n = new URLSearchParams(p); ["q", "buyer", "provider", "status"].forEach((k) => n.delete(k)); return n }, { replace: true })
  const totals = { balance: rows.reduce((s, a) => s + a.fb_balance, 0), spend: rows.reduce((s, a) => s + a.total_spend, 0), diff: rows.reduce((s, a) => s + diffOf(a), 0) }

  return (
    <>
      <Toolbar
        left={
          <>
            {isFull && <Button onClick={() => setEditId("new")}><Icon icon={PlusIcon} size={14} /> Добавить</Button>}
            {isFull && <ImportAccountsButton />}
            <SearchInput value={q} onChange={setQ} placeholder="ID или название" className="sm:w-56" />
          </>
        }
        right={
          <>
            <FilterSelect value={buyer} onChange={setBuyer} allLabel="Все байеры" options={buyers.map((u) => ({ value: String(u.id), label: u.login }))} />
            <FilterSelect value={provider} onChange={setProvider} allLabel="Все провайдеры" options={(providers.data ?? []).map((p) => ({ value: p.name, label: p.name }))} />
            <FilterSelect value={status} onChange={setStatus} allLabel="Все статусы" options={STATUS} className="w-52" />
          </>
        }
      />
      <DataTable
        data={rows}
        loading={list.isLoading}
        columns={columns}
        getRowId={(a) => a.id}
        onRowClick={(a) => setEditId(a.id)}
        storageKey="ad-accounts.v1"
        initialSort={[{ id: "diff", desc: true }]}
        initialHidden={["currency", "tz", "created", "multi_geo", "token"]}
        summary={{ balance: <span className="num">{fmtMoney(totals.balance)}</span>, spend: <span className="num">{fmtMoney(totals.spend)}</span>, diff: <span className="num">{fmtMoney(totals.diff)}</span> }}
        empty={filtered ? "Ничего не найдено по фильтрам" : "Кабинетов пока нет"}
        onResetFilters={filtered ? reset : undefined}
      />
      <AccountSheet id={editId} onClose={() => setEditId("")} canEdit={canEdit} isFull={isFull} providers={providers.data ?? []} buyers={buyers} />
    </>
  )
}

type AccountForm = Omit<FbAdAccount, "buyer_id" | "agency" | "agency_fee" | "total_spend" | "spend_diff" | "fb_balance" | "balance_checked_at" | "last_error" | "disabled_at">
const emptyAccount = (): AccountForm => ({
  id: "", name: "", provider_id: null, api_token: "", proxy: "", active: true, currency: "USD", timezone: "America/Los_Angeles",
  created_at: new Date().toISOString(), handed_at: new Date().toISOString(), spend_offset: 0, spend_diff_comment: "", alert_on_spend_diff: 50,
  multi_geo: false,
})

function AccountSheet({ id, onClose, canEdit, isFull, providers, buyers }: {
  id: string; onClose: () => void; canEdit: boolean; isFull: boolean; providers: AdProvider[]; buyers: { id: number; login: string; team: string }[]
}) {
  const isNew = id === "new"
  const data = useQuery({ queryKey: ["adAccounts", id, isFull], queryFn: () => api.adAccounts.get(id), enabled: !!id && !isNew })
  const open = !!id
  const loaded = isNew ? { account: null, assignments: [], fees: [], unattributed: [], transfer: { can: false, release: false, team: null } } : data.data
  return (
    <EntitySheet open={open} onOpenChange={(v) => !v && onClose()} wide title={isNew ? "Новый кабинет" : loaded?.account ? `Кабинет ${loaded.account.name}` : "Кабинет"}
      description={isNew ? "Кабинет появится свободным; закрепите за байером после сохранения" : loaded?.account?.id}>
      {open && loaded && (isNew || loaded.account)
        ? <AccountForm key={id} account={loaded.account} assignments={loaded.assignments} fees={loaded.fees} unattributed={loaded.unattributed} transfer={loaded.transfer} canEdit={canEdit} isFull={isFull} providers={providers} buyers={buyers} onDone={onClose} />
        : <p className="text-sm text-muted-foreground">{data.isLoading ? "Загрузка…" : "Кабинет не найден"}</p>}
    </EntitySheet>
  )
}

function AccountForm({ account, assignments, fees, unattributed, transfer, canEdit, isFull, providers, buyers, onDone }: {
  account: FbAdAccount | null; assignments: AdAccountAssignment[]; fees: AdFeePeriod[]; unattributed: { fb_campaign: FbCampaign; spend: number }[]
  transfer: { can: boolean; release: boolean; team: string | null }
  canEdit: boolean; isFull: boolean; providers: AdProvider[]; buyers: { id: number; login: string; team: string }[]; onDone: () => void
}) {
  const qc = useQueryClient()
  const { timezone } = useApp()
  const [f, setF] = useState<AccountForm>(account ?? emptyAccount())
  const [showToken, setShowToken] = useState(false)
  const [err, setErr] = useState<Record<string, string>>({})
  const set = <K extends keyof AccountForm>(k: K, v: AccountForm[K]) => setF((x) => ({ ...x, [k]: v }))
  const ro = !canEdit
  const refresh = () => { qc.invalidateQueries({ queryKey: ["adAccounts"] }); qc.invalidateQueries({ queryKey: ["problems"] }); qc.invalidateQueries({ queryKey: ["report"] }) }
  const save = useMutation({
    mutationFn: () => {
      // buyers may change only the comment and the alert threshold; token / proxy only admins
      const patch: Partial<FbAdAccount> = isFull ? f : { spend_diff_comment: f.spend_diff_comment, alert_on_spend_diff: f.alert_on_spend_diff }
      // currency / timezone / FB creation date are read from FB by the server
      const { currency: _c, timezone: _t, created_at: _d, ...fields } = f
      return account ? api.adAccounts.update(account.id, patch) : api.adAccounts.create(fields)
    },
    onSuccess: () => { refresh(); toast.success(account ? "Кабинет сохранён" : "Кабинет добавлен"); onDone() },
    onError: (e: Error) => toast.error(e.message),
  })
  const submit = () => {
    const e: Record<string, string> = {}
    if (!account && !/^act_\d+$/.test(f.id.trim())) e.id = "ID в формате act_1234567890"
    if (!f.name.trim()) e.name = "Введите название"
    setErr(e)
    if (!Object.keys(e).length) save.mutate()
  }
  const login = (bid: number) => buyers.find((b) => b.id === bid)?.login ?? `#${bid}`

  return (
    <div className="flex flex-col gap-1">
      <fieldset disabled={ro} className="min-w-0">
        <FormSection title="Основное">
          <FormRow label="ID кабинета" htmlFor="acc-id" error={err.id}>
            <Input id="acc-id" className="font-mono" value={f.id} disabled={!!account} onChange={(e) => set("id", e.target.value.trim())} placeholder="act_1234567890" />
          </FormRow>
          <FormRow label="Название" htmlFor="acc-name" error={err.name}>
            <Input id="acc-name" value={f.name} disabled={!isFull} onChange={(e) => set("name", e.target.value)} />
          </FormRow>
          <FormRow label="Провайдер" hint={account?.provider_id != null ? "Задаётся один раз, когда кабинет пришёл. Комиссия — во вкладке «Провайдеры» по периодам" : "Кто дал кабинет. Задаётся один раз"}>
            <fieldset disabled={!isFull} className="contents">
              <RefSelect value={f.provider_id} onChange={(v) => set("provider_id", v)} noneLabel="Не указан" options={providers.map((p) => ({ id: p.id, name: `${p.name} · ${pct(p.fee)}${p.self_made ? " · наш фарм" : ""}` }))} />
            </fieldset>
          </FormRow>
          <FormRow label="Валюта и пояс" hint="Берутся из Facebook по токену, вручную не задаются">
            <span className="text-sm">{account ? `${account.currency} · ${account.timezone}` : <span className="text-muted-foreground">подтянутся из Facebook после сохранения</span>}</span>
          </FormRow>
          <FormRow label="Передан нам" htmlFor="acc-handed">
            <Input id="acc-handed" type="date" className="w-44" disabled={!isFull} value={f.handed_at.slice(0, 10)} onChange={(e) => set("handed_at", new Date(`${e.target.value}T00:00:00Z`).toISOString())} />
          </FormRow>
          <FormRow label="Работает" hint={f.active ? "Парсим метрики, расход и баланс, шлём алерты" : `Выключен${account?.disabled_at ? ` ${formatDateTime(account.disabled_at, timezone)}` : ""}: не парсим, алертов нет`}>
            <Switch checked={f.active} disabled={!isFull} onCheckedChange={(v) => set("active", v)} />
          </FormRow>
          <FormRow label="Мульти-гео" hint="Кабинет льёт на несколько гео"><Switch checked={f.multi_geo} disabled={!isFull} onCheckedChange={(v) => set("multi_geo", v)} /></FormRow>
        </FormSection>

        {isFull && (
          <FormSection title="Доступ к FB API">
            <FormRow label="Токен API" htmlFor="acc-token" hint="Видят только админы">
              <div className="flex gap-2">
                <Input id="acc-token" className="font-mono" type={showToken ? "text" : "password"} value={f.api_token} onChange={(e) => set("api_token", e.target.value.trim())} placeholder="EAA…" />
                <Button type="button" variant="outline" size="icon" aria-label="Показать токен" onClick={() => setShowToken((v) => !v)}><Icon icon={EyeIcon} /></Button>
              </div>
            </FormRow>
            <FormRow label="Прокси" htmlFor="acc-proxy" hint="login:password@host:port — запросы к FB по этому кабинету идут только через него">
              <Input id="acc-proxy" className="font-mono" value={f.proxy} onChange={(e) => set("proxy", e.target.value.trim())} />
            </FormRow>
            {account && (
              <FormRow label="Последний запрос">
                <span className={cn("text-sm", account.last_error && "text-destructive")}>
                  {ago(account.balance_checked_at)}{account.last_error ? ` · ${account.last_error}` : " · без ошибок"}
                </span>
              </FormRow>
            )}
          </FormSection>
        )}

        {account && (
          <FormSection title="Деньги">
            <div className="grid grid-cols-3 gap-2 py-2 text-sm">
              <Stat label="Баланс FB" value={fmtMoney(account.fb_balance, account.currency === "USD" ? "$" : account.currency)} />
              <Stat label="Расход всего" value={fmtMoney(account.total_spend)} />
              <Stat label="Не распределено" value={fmtMoney(account.spend_diff + f.spend_offset)} tone={account.spend_diff + f.spend_offset > f.alert_on_spend_diff ? "text-destructive" : ""} />
            </div>
            <Unattributed list={unattributed} total={account.spend_diff} />
            <FormRow label="Поправка, $" htmlFor="acc-offset" hint="Ручная поправка к нераспределённому расходу (например, списанный долг)">
              <Input id="acc-offset" type="number" className="num w-32 text-right" disabled={!isFull} value={f.spend_offset} onChange={(e) => set("spend_offset", Number(e.target.value))} />
            </FormRow>
            <FormRow label="Алерт от, $" htmlFor="acc-alert" hint="Нераспределённый расход больше этой суммы → «Проблемы» и Telegram">
              <Input id="acc-alert" type="number" min={0} className="num w-32 text-right" value={f.alert_on_spend_diff} onChange={(e) => set("alert_on_spend_diff", Number(e.target.value))} />
            </FormRow>
            <FormRow label="Комментарий" htmlFor="acc-comment" hint="Почему расход не распределён, если это нормально">
              <Textarea id="acc-comment" rows={2} value={f.spend_diff_comment} onChange={(e) => set("spend_diff_comment", e.target.value)} />
            </FormRow>
          </FormSection>
        )}
      </fieldset>

      {account && <FeesBlock account={account} fees={fees} isFull={isFull} onDone={refresh} />}

      {account && (
        <FormSection title="Закрепление за байерами">
          {transfer.can && <AssignRow account={account} buyers={transfer.team ? buyers.filter((b) => b.team === transfer.team) : buyers} canRelease={transfer.release} onDone={refresh} />}
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="text-[13px] text-muted-foreground">
                <tr className="border-b">
                  <th className="h-9 px-2 text-left font-medium">Байер</th>
                  <th className="h-9 px-2 text-left font-medium">Период</th>
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 && <tr><td colSpan={2} className="h-9 px-2 text-muted-foreground">Кабинет свободен, ни за кем не закреплялся</td></tr>}
                {assignments.map((x) => (
                  <tr key={x.id} className={cn("border-b last:border-b-0", x.date_to && "text-muted-foreground")}>
                    <td className="h-9 px-2">{login(x.buyer_id)}</td>
                    <td className="h-9 px-2 whitespace-nowrap">{dmy(x.date_from)} — {x.date_to ? dmy(x.date_to) : "сейчас"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Расход дня относится к байеру, за которым кабинет был в этот день.{" "}
            {transfer.can ? (transfer.team ? `Вы можете передавать кабинеты между байерами команды ${transfer.team}.` : "") : "Передавать кабинеты может админ; тимлид — между байерами своей команды, если у него есть право «Передача кабинетов»."}
          </p>
        </FormSection>
      )}

      {canEdit && (
        <div className="flex justify-end gap-2 pt-3">
          <Button type="button" variant="outline" onClick={onDone}>Отмена</Button>
          <Button type="button" disabled={save.isPending} onClick={submit}>{account ? "Сохранить" : "Добавить"}</Button>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border px-2 py-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("num", tone)}>{value}</div>
    </div>
  )
}

// «Передать байеру»: a new period from a date; the current one closes the day before.
function AssignRow({ account, buyers, canRelease, onDone }: { account: FbAdAccount; buyers: { id: number; login: string; team: string }[]; canRelease: boolean; onDone: () => void }) {
  const [buyer, setBuyer] = useState<number | null>(null)
  const [from, setFrom] = useState(today())
  const assign = useMutation({
    mutationFn: () => api.adAccounts.assign({ account_id: account.id, buyer_id: buyer!, date_from: from }),
    onSuccess: () => { onDone(); toast.success("Кабинет закреплён") },
    onError: (e: Error) => toast.error(e.message),
  })
  const release = useMutation({
    mutationFn: () => api.adAccounts.release(account.id),
    onSuccess: () => { onDone(); toast.success("Кабинет свободен с сегодняшнего дня") },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <div className="mb-2 flex flex-col gap-2 rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{account.buyer_id == null ? "Закрепить за байером" : "Передать другому байеру"}</div>
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <RefSelect value={buyer} onChange={setBuyer} noneLabel="Байер" options={buyers.filter((b) => b.id !== account.buyer_id).map((b) => ({ id: b.id, name: b.login }))} />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="С даты" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!buyer || !from || assign.isPending} onClick={() => assign.mutate()}>Закрепить с {dmy(from)}</Button>
        {canRelease && account.buyer_id != null && <Button type="button" variant="ghost" onClick={() => release.mutate()}>Освободить кабинет</Button>}
      </div>
    </div>
  )
}

// Spend no tracker campaign took: FB campaigns without a valid tracker id in the name.
function Unattributed({ list, total }: { list: { fb_campaign: FbCampaign; spend: number }[]; total: number }) {
  if (total <= 0) return null
  const named = list.reduce((s, x) => s + x.spend, 0)
  return (
    <div className="mb-2 rounded-md border p-2 text-sm">
      <div className="mb-1 text-xs text-muted-foreground">Откуда нераспределённый расход</div>
      <ul className="flex flex-col gap-1">
        {list.map((x) => (
          <li key={x.fb_campaign.id} className="flex gap-2">
            <span className="min-w-0 flex-1 break-all">{x.fb_campaign.name}<span className="text-muted-foreground"> — нет ID кампании трекера в начале названия</span></span>
            <span className="num shrink-0">{fmtMoney(x.spend)}</span>
          </li>
        ))}
        {total - named > 0.005 && (
          <li className="flex gap-2"><span className="min-w-0 flex-1 text-muted-foreground">Расход вне кампаний, которые видит сборщик (например, запуск без ссылки трекера)</span><span className="num shrink-0">{fmtMoney(total - named)}</span></li>
        )}
      </ul>
    </div>
  )
}

// Fee of this account by period: the provider's rows and the account's own; admins add «своя комиссия с даты».
function FeesBlock({ account, fees, isFull, onDone }: { account: FbAdAccount; fees: AdFeePeriod[]; isFull: boolean; onDone: () => void }) {
  const [fee, setFee] = useState("")
  const [from, setFrom] = useState(today())
  const add = useMutation({
    mutationFn: () => api.adAccounts.fees.create({ provider_id: account.provider_id!, account_id: account.id, fee: Number(fee), date_from: from, comment: "Своя комиссия кабинета" }),
    onSuccess: () => { onDone(); setFee(""); toast.success("Комиссия кабинета сохранена") },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <FormSection title={`Комиссия · сейчас ${pct(account.agency_fee)}`}>
      {account.provider_id == null
        ? <p className="text-sm text-muted-foreground">Провайдер не указан — комиссия 0%.</p>
        : <FeeTable rows={fees} showAccount={false} />}
      {isFull && account.provider_id != null && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Своя комиссия этого кабинета</span>
          <Input type="number" min={0} step={0.5} className="num w-24 text-right" placeholder="%" value={fee} onChange={(e) => setFee(e.target.value)} aria-label="Комиссия кабинета, %" />
          <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="С даты" />
          <Button type="button" variant="outline" disabled={fee === "" || Number(fee) < 0 || Number(fee) > 100 || add.isPending} onClick={() => add.mutate()}>Добавить</Button>
        </div>
      )}
      <p className="pt-1 text-xs text-muted-foreground">Расход дня считается с комиссией, действовавшей в этот день. Новая комиссия не меняет прошлый расход.</p>
    </FormSection>
  )
}

function FeeTable({ rows, showAccount, providers, onRemove }: { rows: AdFeePeriod[]; showAccount: boolean; providers?: AdProvider[]; onRemove?: (id: number) => void }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="text-[13px] text-muted-foreground">
          <tr className="border-b">
            {showAccount && <th className="h-9 px-2 text-left font-medium">Провайдер</th>}
            <th className="h-9 px-2 text-left font-medium">Кабинеты</th>
            <th className="h-9 px-2 text-right font-medium">Комиссия</th>
            <th className="h-9 px-2 text-left font-medium">С даты</th>
            <th className="h-9 px-2 text-left font-medium">Комментарий</th>
            {onRemove && <th className="h-9 w-10" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id} className="border-b last:border-b-0">
              {showAccount && <td className="h-9 px-2">{providers?.find((p) => p.id === x.provider_id)?.name ?? "—"}</td>}
              <td className="h-9 px-2">{x.account_id ? <span className="font-mono">{x.account_id}</span> : "все кабинеты провайдера"}</td>
              <td className="num h-9 px-2 text-right">{pct(x.fee)}</td>
              <td className="h-9 px-2 whitespace-nowrap">{x.date_from ? dmy(x.date_from) : "с начала"}</td>
              <td className="h-9 px-2 text-muted-foreground">{x.comment || "—"}</td>
              {onRemove && (
                <td className="h-9 px-2 text-right">
                  {(x.date_from != null || x.account_id != null) && <Button type="button" variant="ghost" size="icon-sm" aria-label="Удалить строку комиссии" onClick={() => onRemove(x.id)}><Icon icon={XIcon} size={14} /></Button>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- providers ----------

function ProvidersTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ["adProviders"], queryFn: api.adAccounts.providers.list })
  const fees = useQuery({ queryKey: ["adFees"], queryFn: api.adAccounts.fees.list })
  const accounts = useQuery({ queryKey: ["adAccounts"], queryFn: api.adAccounts.list })
  const refresh = () => { ["adProviders", "adFees", "adAccounts", "report"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })) }
  const add = useMutation({
    mutationFn: () => api.adAccounts.providers.create({ name: "Новый провайдер", fee: 0, self_made: false, group_name: "" }),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: (id: number) => api.adAccounts.fees.remove(id), onSuccess: () => { refresh(); toast.success("Строка удалена") }, onError: (e: Error) => toast.error(e.message) })
  return (
    <div className="flex flex-col gap-2">
      {canEdit && <Button className="self-start" onClick={() => add.mutate()}><Icon icon={PlusIcon} size={14} /> Добавить провайдера</Button>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="text-[13px] text-muted-foreground">
            <tr className="border-b">
              <th className="h-9 px-3 text-left font-medium">Название</th>
              <th className="h-9 px-3 text-left font-medium">Группа</th>
              <th className="h-9 px-3 text-right font-medium">Комиссия сейчас</th>
              <th className="h-9 px-3 text-left font-medium">Наш фарм</th>
              <th className="h-9 px-3 text-right font-medium">Кабинетов</th>
              <th className="h-9 w-24" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((p) => (
              <ProviderRow key={`${p.id}|${JSON.stringify(p)}`} p={p} canEdit={canEdit} count={(accounts.data ?? []).filter((a) => a.provider_id === p.id).length} onDone={refresh} />
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-4 text-base font-medium">Комиссия по периодам</h2>
      {canEdit && <FeeAdd providers={list.data ?? []} accounts={accounts.data ?? []} onDone={refresh} />}
      <FeeTable rows={fees.data ?? []} showAccount providers={list.data} onRemove={canEdit ? (id) => remove.mutate(id) : undefined} />
      <p className="text-xs text-muted-foreground">Комиссия дня = последняя строка с датой не позже этого дня; если у кабинета есть своя комиссия, берётся она, а не комиссия провайдера. Поднятие комиссии с даты не меняет прошлый расход.</p>
    </div>
  )
}

function FeeAdd({ providers, accounts, onDone }: { providers: AdProvider[]; accounts: FbAdAccount[]; onDone: () => void }) {
  const [provider, setProvider] = useState<number | null>(null)
  const [account, setAccount] = useState("all")
  const [fee, setFee] = useState("")
  const [from, setFrom] = useState(today())
  const [comment, setComment] = useState("")
  const add = useMutation({
    mutationFn: () => api.adAccounts.fees.create({ provider_id: provider!, account_id: account === "all" ? null : account, fee: Number(fee), date_from: from, comment: comment.trim() }),
    onSuccess: () => { onDone(); setFee(""); setComment(""); toast.success("Комиссия добавлена") },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <div className="text-xs text-muted-foreground">Новая комиссия с даты</div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_10rem]">
        <RefSelect value={provider} onChange={(v) => { setProvider(v); setAccount("all") }} noneLabel="Провайдер" options={providers.map((p) => ({ id: p.id, name: `${p.name} · сейчас ${pct(p.fee)}` }))} />
        <Select value={account} onValueChange={setAccount} disabled={provider == null}>
          <SelectTrigger className="w-full" aria-label="Кабинеты"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все кабинеты провайдера</SelectItem>
            {accounts.filter((a) => a.provider_id === provider).map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {a.id}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="number" min={0} step={0.5} className="num text-right" placeholder="%" value={fee} onChange={(e) => setFee(e.target.value)} aria-label="Комиссия, %" />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="С даты" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-0 flex-1" placeholder="Комментарий (необязательно)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Комментарий" />
        <Button type="button" variant="outline" disabled={provider == null || fee === "" || Number(fee) < 0 || Number(fee) > 100 || !from || add.isPending} onClick={() => add.mutate()}>Добавить с {dmy(from)}</Button>
      </div>
    </div>
  )
}

function ProviderRow({ p, canEdit, count, onDone }: { p: AdProvider; canEdit: boolean; count: number; onDone: () => void }) {
  const [v, setV] = useState({ name: p.name, group_name: p.group_name, self_made: p.self_made })
  const dirty = v.name !== p.name || v.group_name !== p.group_name || v.self_made !== p.self_made
  const save = useMutation({
    mutationFn: () => api.adAccounts.providers.update(p.id, v),
    onSuccess: () => { onDone(); toast.success("Провайдер сохранён") },
  })
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-3 py-1.5"><Input disabled={!canEdit} className="min-w-36" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-label="Название провайдера" /></td>
      <td className="px-3 py-1.5"><Input disabled={!canEdit} className="min-w-32" value={v.group_name} onChange={(e) => setV({ ...v, group_name: e.target.value })} aria-label="Группа" /></td>
      <td className="num px-3 py-1.5 text-right">{pct(p.fee)}</td>
      <td className="px-3 py-1.5"><Switch disabled={!canEdit} checked={v.self_made} onCheckedChange={(x) => setV({ ...v, self_made: x })} aria-label="Наш фарм" /></td>
      <td className="num px-3 py-1.5 text-right">{count}</td>
      <td className="px-3 py-1.5 text-right">{dirty && <Button size="sm" disabled={!v.name.trim() || save.isPending} onClick={() => save.mutate()}>Сохранить</Button>}</td>
    </tr>
  )
}

// ---------- bulk add from JSON ----------

const IMPORT_EXAMPLE = `[
  {
    "id": "act_1234567890123",
    "api_token": "EAAG…",
    "proxy": "login:password@1.2.3.4:8000",
    "buyer": "a_volkov",
    "provider": "Agent Nova",
    "fee": 7
  }
]`

function ImportAccountsButton() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [parseError, setParseError] = useState("")
  const [checked, setChecked] = useState<AccountImportResult[] | null>(null)
  const parse = (): AccountImportRow[] | null => {
    try {
      const v = JSON.parse(text)
      const rows = Array.isArray(v) ? v : [v]
      if (!rows.every((r) => r && typeof r === "object")) throw new Error("каждый кабинет — объект в фигурных скобках")
      setParseError("")
      return rows
    } catch (e) {
      setParseError(`Не JSON: ${(e as Error).message}. Сверьте с примером`)
      return null
    }
  }
  const check = useMutation({
    mutationFn: (rows: AccountImportRow[]) => api.adAccounts.importJson(rows, false),
    onSuccess: (r) => setChecked(r.results),
    onError: (e: Error) => toast.error(e.message),
  })
  const apply = useMutation({
    mutationFn: (rows: AccountImportRow[]) => api.adAccounts.importJson(rows, true),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["adAccounts"] })
      qc.invalidateQueries({ queryKey: ["fbAccounts"] })
      toast.success(`Добавлено кабинетов: ${r.created}`)
      setOpen(false); setText(""); setChecked(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const ok = checked?.filter((r) => !r.error).length ?? 0
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Icon icon={FileJsonIcon} size={14} /> Импорт JSON</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Добавить кабинеты списком</DialogTitle>
            <DialogDescription>
              Вставьте JSON — массив кабинетов. Обязательны <code>id</code> и <code>api_token</code>. Валюту, часовой пояс и дату создания трекер
              возьмёт из Facebook сам. <code>buyer</code> — логин байера (кабинет закрепится за ним с сегодня), <code>provider</code> — имя провайдера,
              <code> fee</code> — комиссия этого кабинета в % с сегодня. Необязательно: <code>name</code>, <code>handed_at</code> (ГГГГ-ММ-ДД), <code>multi_geo</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">Пример <CopyButton value={IMPORT_EXAMPLE} label="Копировать пример" /></div>
            <Textarea
              rows={10}
              value={text}
              onChange={(e) => { setText(e.target.value); setChecked(null) }}
              placeholder={IMPORT_EXAMPLE}
              className="font-mono text-xs"
              aria-label="JSON с кабинетами"
              aria-invalid={!!parseError}
            />
            {parseError && <p className="text-sm text-destructive">{parseError}</p>}
            {checked && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="text-left text-[13px] text-muted-foreground">
                    <tr className="border-b"><th className="px-2 py-1.5 font-medium">#</th><th className="px-2 py-1.5 font-medium">ID</th><th className="px-2 py-1.5 font-medium">Проверка</th></tr>
                  </thead>
                  <tbody>
                    {checked.map((r) => (
                      <tr key={r.index} className="border-b last:border-0">
                        <td className="num px-2 py-1.5 text-muted-foreground">{r.index + 1}</td>
                        <td className="px-2 py-1.5 font-mono">{r.id || "—"}</td>
                        <td className={cn("px-2 py-1.5", r.error ? "text-destructive" : r.warning ? "text-warning" : "text-success")}>{r.error || r.warning || "Готов к добавлению"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            {checked && ok > 0
              ? <Button disabled={apply.isPending} onClick={() => { const rows = parse(); if (rows) apply.mutate(rows) }}>Добавить {ok} {ok === checked.length ? "" : `из ${checked.length}`}</Button>
              : <Button disabled={!text.trim() || check.isPending} onClick={() => { const rows = parse(); if (rows) check.mutate(rows) }}>Проверить</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
