// «Постбеки»: health row for the last 24 h, log of incoming / outgoing / problem postbacks, partner connection guide.
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { ChevronDownIcon, ChevronRightIcon, RefreshCwIcon } from "lucide-react"
import type { PostbackLogEntry } from "@/api/types"
import { api } from "@/api/client"
import { systemApi, type RetryResult } from "@/api/client-system"
import { useAccess, useCanSeeMoney, useUrlParam } from "@/app/state"
import { Page, PageHeader, Section, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { CopyButton, EntitySheet, SearchInput, StateDot } from "@/components/common"
import { Clip, EntityLink, SubidLink } from "@/features/reports/shared"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatDateTime, timeAgo } from "@/lib/dates"
import { fmtMoney } from "@/lib/format"
import { cn } from "@/lib/utils"

type Result = PostbackLogEntry["result"]
const RESULTS: Record<Result, { label: string }> = {
  ok: { label: "Принят" },
  error: { label: "Ошибка" },
  ignored: { label: "Пропущен" },
  retrying: { label: "Повтор" },
}
const PROBLEM_RESULTS: Result[] = ["error", "ignored", "retrying"]
const STATUS_WORD: Record<string, string> = { reg: "лид", lead: "лид", registration: "лид", dep: "продажа", sale: "продажа", deposit: "продажа" }
const DAY = 24 * 3600_000

// Incoming postback with a status the tracker does not know (fraud, chargeback…) is skipped, whatever the log says.
const resultOf = (p: PostbackLogEntry): Result => (p.direction === "in" && p.result === "ok" && !STATUS_WORD[p.status] ? "ignored" : p.result)
const messageOf = (p: PostbackLogEntry) =>
  p.message || (resultOf(p) === "ignored" && p.result === "ok" ? `Неизвестный статус «${p.status}»: конверсия не создана` : "")
const isProblem = (p: PostbackLogEntry) => resultOf(p) !== "ok"
const isZeroDep = (p: PostbackLogEntry) => p.direction === "in" && STATUS_WORD[p.status] === "продажа" && !p.payout
const canRetryRow = (p: PostbackLogEntry) => p.direction === "out" && resultOf(p) !== "ok"
const isTokenIssue = (p: PostbackLogEntry) => /токен|token/i.test(p.message)
const nextAttemptMin = (p: PostbackLogEntry) => Math.min(60, 2 ** p.attempts)

// Result = state of processing: the same dot + text as every other status column.
function ResultCell({ result }: { result: Result }) {
  return (
    <span className="flex items-center gap-2">
      <StateDot state={result} />
      {RESULTS[result].label}
    </span>
  )
}

// capi://<pixel>/Purchase → «Facebook CAPI · Purchase», anything else → host of the webhook
function targetOf(p: PostbackLogEntry) {
  if (p.url.startsWith("capi://")) {
    const [pixel, event] = p.url.slice(7).split("/")
    return `Facebook CAPI · ${event ?? "Purchase"} · ${pixel.slice(0, 6)}…`
  }
  try { return new URL(p.url).host } catch { return p.url }
}

export default function PostbacksPage() {
  const qc = useQueryClient()
  const { canEdit } = useAccess("postbacks")
  const canSeeMoney = useCanSeeMoney()
  const [tab, setTab] = useUrlParam("tab", "in")
  const [result, setResult] = useUrlParam("result")
  const [since, setSince] = useUrlParam("since", "24h")
  const [dir, setDir] = useUrlParam("dir")
  const [q, setQ] = useUrlParam("q")
  const [zero, setZero] = useUrlParam("zero")
  const [rowId, setRowId] = useUrlParam("row")

  const [, setParams] = useSearchParams()
  // one update for all keys (several useUrlParam setters in a row overwrite each other)
  const resetFilters = () => setParams((p) => { const n = new URLSearchParams(p); ["q", "result", "zero", "dir"].forEach((k) => n.delete(k)); return n }, { replace: true })

  const log = useQuery({ queryKey: ["postbacks", "log"], queryFn: () => api.postbacks.log({ limit: 5000, offset: 0 }) })
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })
  const networks = useQuery({ queryKey: ["affiliateNetworks"], queryFn: api.affiliateNetworks.list })

  const retry = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map((id) => systemApi.postbacks.retry(id))),
    onSuccess: (res: RetryResult[]) => {
      qc.invalidateQueries({ queryKey: ["postbacks"] })
      const bad = res.filter((r) => !r.ok)
      if (res.length === 1) {
        if (bad.length) toast.error(`Снова ошибка ${bad[0].http_code}`)
        else toast.success("Принят")
      } else if (bad.length) {
        toast.error(`Принято: ${res.length - bad.length} из ${res.length}. Снова ошибка ${bad[0].http_code}: ${bad.length}`)
      } else {
        toast.success(`Принято: ${res.length} из ${res.length}`)
      }
    },
  })

  const campaignName = (id: number | null) => (id ? campaigns.data?.find((c) => c.id === id)?.name ?? `#${id}` : "—")
  const networkName = (id: number | null) => (id ? networks.data?.find((n) => n.id === id)?.name ?? `#${id}` : "—")

  const all = useMemo(() => log.data?.rows ?? [], [log.data])
  // 24 h strip and the «Проблемные» tab use the same definitions and the same window, so the numbers match.
  const last24 = useMemo(() => all.filter((p) => Date.now() - Date.parse(p.datetime) < DAY), [all])
  const problems = useMemo(
    () => (since === "all" ? all : last24).filter(isProblem),
    [all, last24, since],
  )
  const problemCounts = useMemo(
    () => Object.fromEntries(PROBLEM_RESULTS.map((r) => [r, problems.filter((p) => resultOf(p) === r).length])) as Record<Result, number>,
    [problems],
  )

  const rows = useMemo(() => {
    const base = tab === "in" ? all.filter((p) => p.direction === "in") : tab === "out" ? all.filter((p) => p.direction === "out") : problems
    return base.filter(
      (p) =>
        (!result || resultOf(p) === result) &&
        (tab !== "problems" || !dir || p.direction === dir) &&
        (!zero || isZeroDep(p)) &&
        (!q || p.sub_id.toLowerCase().includes(q.toLowerCase())),
    )
  }, [all, problems, tab, result, dir, zero, q])

  const columns = useMemo<ColumnDef<PostbackLogEntry, unknown>[]>(() => {
    const incoming = tab === "in"
    const cols: ColumnDef<PostbackLogEntry, unknown>[] = [
      // phones: Время, Subid, Результат come first
      { id: "datetime", header: "Время постбека", enableHiding: false, accessorFn: (p) => p.datetime, cell: ({ row }) => <span className="num">{formatDateTime(row.original.datetime)}</span> },
      { id: "sub_id", header: "Subid", accessorFn: (p) => p.sub_id, cell: ({ row }) => <SubidLink subId={row.original.sub_id} /> },
      { id: "result", header: "Результат", accessorFn: (p) => resultOf(p), cell: ({ row }) => <ResultCell result={resultOf(row.original)} /> },
      {
        id: "status",
        header: "Статус",
        accessorFn: (p) => p.status,
        cell: ({ row }) => {
          const w = STATUS_WORD[row.original.status]
          return <span>{row.original.status}{w && <span className="text-muted-foreground"> → {w}</span>}</span>
        },
      },
      { id: "direction", header: "Направление", accessorFn: (p) => p.direction, cell: ({ row }) => (row.original.direction === "in" ? "Входящий" : "Исходящий") },
      {
        id: "peer",
        header: tab === "out" ? "Получатель" : tab === "in" ? "Партнёрка" : "Партнёрка / получатель",
        accessorFn: (p) => (p.direction === "in" ? networkName(p.affiliate_network_id) : targetOf(p)),
      },
      {
        id: "campaign", header: "Кампания", accessorFn: (p) => campaignName(p.campaign_id),
        cell: ({ row }) => <Clip><EntityLink kind="campaign" id={row.original.campaign_id} name={campaignName(row.original.campaign_id)} /></Clip>,
      },
    ]
    if (canSeeMoney) {
      cols.push({
        id: "payout",
        header: "Выплата",
        accessorFn: (p) => p.payout ?? -1,
        meta: { align: "right" },
        cell: ({ row }) => {
          const p = row.original
          if (p.payout == null) return <span className="text-muted-foreground">—</span>
          return <span className={cn(isZeroDep(p) && "text-warning")}>{fmtMoney(p.payout)}</span>
        },
      })
    }
    if (!incoming) {
      // HTTP code and attempts only make sense for outgoing requests
      const out = (p: PostbackLogEntry) => p.direction === "out"
      cols.push(
        { id: "http", header: "HTTP", accessorFn: (p) => (out(p) ? p.http_code ?? 0 : -1), meta: { align: "right" }, cell: ({ row }) => (out(row.original) ? row.original.http_code ?? "—" : "—") },
        { id: "attempts", header: "Попытки", accessorFn: (p) => (out(p) ? p.attempts : 0), meta: { align: "right" }, cell: ({ row }) => (out(row.original) ? row.original.attempts : "—") },
      )
    }
    cols.push({
      id: "message",
      header: "Сообщение",
      meta: { grow: true },
      accessorFn: (p) => messageOf(p),
      cell: ({ row }) => {
        const m = messageOf(row.original)
        return <span className="block max-w-96 truncate text-muted-foreground" title={m}>{m || "—"}</span>
      },
    })
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, canSeeMoney, campaigns.data, networks.data])
  // table re-reads lookups: new rows array when they load
  const tableRows = useMemo(() => [...rows], [rows, campaigns.data, networks.data])

  const current = rowId ? all.find((p) => String(p.id) === rowId) : undefined
  const setTabReset = (t: string) => {
    setTab(t)
    if (result === "ok" || (t === "problems" && result && !PROBLEM_RESULTS.includes(result as Result))) setResult("")
    if (t !== "problems") { setDir(""); setSince("24h") }
  }
  const openProblems = (d: "in" | "out") => { setTab("problems"); setDir(d); setSince("24h"); setResult(""); setZero("") }

  const lastIn = all.find((p) => p.direction === "in")?.datetime ?? null
  const zero24 = last24.filter(isZeroDep).length

  return (
    <Page>
      <PageHeader title="Постбеки" />
      <HealthRow
        loading={log.isLoading}
        in_ok={last24.filter((p) => p.direction === "in" && !isProblem(p)).length}
        in_bad={last24.filter((p) => p.direction === "in" && isProblem(p)).length}
        out_ok={last24.filter((p) => p.direction === "out" && !isProblem(p)).length}
        out_bad={last24.filter((p) => p.direction === "out" && isProblem(p)).length}
        zero={canSeeMoney ? zero24 : null}
        lastIn={lastIn}
        onBad={openProblems}
        onZero={() => { setTab("in"); setZero(zero ? "" : "1") }}
        zeroActive={!!zero}
      />
      <Guide />
      <Tabs value={tab} onValueChange={setTabReset}>
        <TabsList variant="line">
          <TabsTrigger value="in">Входящие</TabsTrigger>
          <TabsTrigger value="out">Исходящие</TabsTrigger>
          <TabsTrigger value="problems">Проблемные{problems.length > 0 && <span className="text-muted-foreground">{problems.length}</span>}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Toolbar
        left={<SearchInput value={q} onChange={setQ} placeholder="Поиск по subid" />}
        right={
          <>
            {tab === "problems" && (
              <>
                {dir && (
                  <Button variant="secondary" onClick={() => setDir("")}>{dir === "in" ? "Только входящие" : "Только исходящие"} ✕</Button>
                )}
                <Select value={since} onValueChange={setSince}>
                  <SelectTrigger className="w-40" aria-label="Период"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">За 24 часа</SelectItem>
                    <SelectItem value="all">За всё время</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
            {tab === "in" && canSeeMoney && (
              <Button variant={zero ? "secondary" : "outline"} onClick={() => setZero(zero ? "" : "1")}>Продажи без выплаты</Button>
            )}
            {tab !== "problems" && (
              <Select value={result || "all"} onValueChange={(v) => setResult(v === "all" ? "" : v)}>
                <SelectTrigger className="w-44" aria-label="Результат"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Любой результат</SelectItem>
                  {(Object.keys(RESULTS) as Result[]).map((k) => <SelectItem key={k} value={k}>{RESULTS[k].label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </>
        }
      />
      {tab === "problems" && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={result || "all"}
          onValueChange={(v) => setResult(v === "all" ? "" : v)}
          className="flex-wrap"
          aria-label="Вид проблемы"
        >
          <ToggleGroupItem value="all">Все · {problems.length}</ToggleGroupItem>
          {PROBLEM_RESULTS.map((r) => (
            <ToggleGroupItem key={r} value={r}>{RESULTS[r].label} · {problemCounts[r]}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      <DataTable
        key={tab}
        data={tableRows}
        loading={log.isLoading}
        columns={columns}
        getRowId={(p) => String(p.id)}
        onRowClick={(p) => setRowId(String(p.id))}
        bulkActions={
          canEdit && tab !== "in"
            ? (selected, clear) => {
                const ids = selected.filter(canRetryRow).map((p) => p.id)
                return (
                  <Button
                    variant="ghost"
                    disabled={!ids.length || retry.isPending}
                    onClick={() => retry.mutate(ids, { onSuccess: clear })}
                    title={ids.length ? undefined : "Среди выбранных нет исходящих с ошибкой"}
                  >
                    <Icon icon={RefreshCwIcon} size={14} /> Повторить ({ids.length})
                  </Button>
                )
              }
            : undefined
        }
        storageKey={`postbacks-${tab}.v2`}
        initialHidden={tab === "in" ? ["direction"] : tab === "out" ? ["direction", "status"] : []}
        initialSort={[{ id: "datetime", desc: true }]}
        rowClassName={(p) => (canSeeMoney && isZeroDep(p) ? "bg-warning/5" : undefined)}
        empty={tab === "problems" ? "Проблем нет" : "Постбеков пока нет"}
        onResetFilters={q || result || zero || (tab === "problems" && dir) ? resetFilters : undefined}
      />

      <EntitySheet
        open={!!current}
        onOpenChange={(v) => !v && setRowId("")}
        title={current ? `Постбек #${current.id}` : "Постбек"}
        description={current ? `${current.direction === "in" ? "Входящий" : "Исходящий"} · ${formatDateTime(current.datetime)}` : undefined}
      >
        {current && (
          <PostbackDetails
            p={current}
            campaign={campaignName(current.campaign_id)}
            network={networkName(current.affiliate_network_id)}
            canRetry={canEdit}
            canSeeMoney={canSeeMoney}
            retrying={retry.isPending}
            onRetry={() => retry.mutate([current.id])}
          />
        )}
      </EntitySheet>
    </Page>
  )
}

// ---------- health row ----------

interface HealthProps {
  loading: boolean
  in_ok: number; in_bad: number; out_ok: number; out_bad: number
  zero: number | null // null = money hidden for this role
  lastIn: string | null
  onBad: (d: "in" | "out") => void
  onZero: () => void
  zeroActive: boolean
}

function HealthRow({ loading, in_ok, in_bad, out_ok, out_bad, zero, lastIn, onBad, onZero, zeroActive }: HealthProps) {
  const stale = !lastIn || Date.now() - Date.parse(lastIn) > 2 * 3600_000
  // Same tile as on the dashboard: label, value, sub-line; a problem is a warning dot before the sub-line.
  const cells: { label: string; n: string; sub: string; bad?: boolean; onClick?: () => void }[] = [
    { label: "Входящие, 24 ч", n: String(in_ok), sub: "принято" },
    { label: "Входящие, 24 ч", n: String(in_bad), sub: "с проблемой", bad: in_bad > 0, onClick: in_bad ? () => onBad("in") : undefined },
    { label: "Исходящие, 24 ч", n: String(out_ok), sub: "отправлено" },
    { label: "Исходящие, 24 ч", n: String(out_bad), sub: "с проблемой", bad: out_bad > 0, onClick: out_bad ? () => onBad("out") : undefined },
    ...(zero == null ? [] : [{ label: "Продажи, 24 ч", n: String(zero), sub: "без выплаты", bad: zero > 0, onClick: onZero }]),
    { label: "Последний входящий", n: timeAgo(lastIn), sub: lastIn ? formatDateTime(lastIn) : "нет", bad: stale },
  ]
  return (
    <div title="За последние 24 часа. Проблема = ошибка, пропущен или повтор.">
      <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border md:grid-cols-3", zero == null ? "xl:grid-cols-5" : "xl:grid-cols-6")}>
        {loading
          ? Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[4.25rem] bg-card" />)
          : cells.map((c) => {
              const inner = (
                <>
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                  <div className="num text-2xl leading-tight font-semibold max-sm:text-xl">{c.n}</div>
                  <div className="num flex items-center gap-1.5 text-xs text-muted-foreground">
                    {c.bad && <span aria-hidden className="inline-block size-2 shrink-0 rounded-full bg-warning" />}
                    {c.sub}
                  </div>
                </>
              )
              return c.onClick ? (
                <button
                  key={c.label + c.sub}
                  type="button"
                  onClick={c.onClick}
                  aria-pressed={c.label.startsWith("Продаж") ? zeroActive : undefined}
                  className={cn("bg-card px-3 py-2 text-left", c.label.startsWith("Продаж") && zeroActive && "bg-muted")}
                >
                  {inner}
                </button>
              ) : (
                <div key={c.label + c.sub} className="bg-card px-3 py-2">{inner}</div>
              )
            })}
      </div>
    </div>
  )
}

// ---------- row details ----------

// Mock request / response bodies shaped like what the tracker sends and receives.
function requestOf(p: PostbackLogEntry, fullUrl: string, money: boolean) {
  if (p.direction === "in") return `GET ${fullUrl}`
  const body = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.parse(p.datetime) / 1000),
      action_source: "website",
      user_data: { external_id: p.sub_id },
      custom_data: money ? { value: p.payout ?? 0, currency: "USD" } : { currency: "USD" },
    }],
  }
  return `POST ${fullUrl}\nContent-Type: application/json\n\n${JSON.stringify(body, null, 2)}`
}
function responseOf(p: PostbackLogEntry) {
  const res = resultOf(p)
  if (p.direction === "in") {
    const body = res === "ok" ? { status: "ok" } : { status: res === "ignored" ? "ignored" : "error", reason: messageOf(p) }
    return `HTTP ${p.http_code ?? 200}\n\n${JSON.stringify(body, null, 2)}`
  }
  if (res === "ok") return `HTTP ${p.http_code ?? 200}\n\n${JSON.stringify({ events_received: 1, fbtrace_id: `A${p.sub_id.slice(0, 10)}` }, null, 2)}`
  const body = { error: { message: p.message.split(" — ")[0] || "Request failed", type: isTokenIssue(p) ? "OAuthException" : "ApiException", code: isTokenIssue(p) ? 190 : p.http_code ?? 400 } }
  return `HTTP ${p.http_code ?? 400}\n\n${JSON.stringify(body, null, 2)}`
}

function CodeBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">{title} <CopyButton value={text} /></div>
      <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-all">{text}</pre>
    </div>
  )
}

function PostbackDetails({
  p, campaign, network, canRetry, canSeeMoney, retrying, onRetry,
}: { p: PostbackLogEntry; campaign: string; network: string; canRetry: boolean; canSeeMoney: boolean; retrying: boolean; onRetry: () => void }) {
  const { data: domains } = useQuery({ queryKey: ["domains"], queryFn: api.domains.list })
  const domain = domains?.find((d) => d.status === "ok")?.name ?? "tracker.example.com"
  const rawUrl = p.url.startsWith("/") ? `https://${domain}${p.url}` : p.url
  // payout is money: masked for roles that do not see it
  const fullUrl = canSeeMoney ? rawUrl : rawUrl.replace(/([?&]payout=)[^&]*/, "$1…")
  const w = STATUS_WORD[p.status]
  const res = resultOf(p)
  const msg = messageOf(p)
  const rowsInfo: [string, React.ReactNode][] = [
    [p.direction === "in" ? "Партнёрка" : "Получатель", p.direction === "in" ? network : targetOf(p)],
    ["Кампания", campaign],
    ["Статус", <span key="s">{p.status}{w && <span className="text-muted-foreground"> → {w}</span>}</span>],
    ...(canSeeMoney ? [["Выплата", p.payout == null ? "—" : <span key="pay" className={cn(isZeroDep(p) && "text-warning")}>{fmtMoney(p.payout)}</span>] as [string, React.ReactNode]] : []),
    ["HTTP-код", p.http_code ?? "—"],
    ["Результат", <ResultCell key="r" result={res} />],
    ...(p.direction === "out" ? [["Попытки", p.attempts] as [string, React.ReactNode]] : []),
    ...(p.direction === "out" && res === "retrying" ? [["Следующая попытка", `через ${nextAttemptMin(p)} мин`] as [string, React.ReactNode]] : []),
  ]
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          Полный URL <CopyButton value={fullUrl} />
        </div>
        <div className="rounded-md border bg-muted p-2 font-mono text-xs break-all">{fullUrl}</div>
      </div>
      <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-sm">
        {rowsInfo.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="num">{v}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">Subid</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{p.sub_id}</span>
          <a className="text-link" href={`#/clicks?q=${encodeURIComponent(p.sub_id)}`}>Клик в логе кликов</a>
        </dd>
      </dl>
      {msg && (
        <div className={cn("rounded-md border p-2 text-sm", res === "ok" ? "text-muted-foreground" : "border-warning/40 text-warning")}>
          <div>{msg}</div>
          {res !== "ok" && isTokenIssue(p) && (
            <a className="mt-1 inline-block text-link" href="#/integrations">Открыть интеграцию</a>
          )}
        </div>
      )}
      {canRetryRow(p) && canRetry && (
        <div>
          <Button onClick={onRetry} disabled={retrying}>
            <Icon icon={RefreshCwIcon} size={14} /> Повторить отправку
          </Button>
        </div>
      )}
      <CodeBlock title="Запрос" text={requestOf(p, fullUrl, canSeeMoney)} />
      <CodeBlock title="Ответ сервера" text={responseOf(p)} />
    </div>
  )
}

// ---------- how to connect a partner ----------

const PARAMS: { name: string; req: boolean; text: string }[] = [
  { name: "subid", req: true, text: "ID клика в трекере. Партнёрка возвращает то значение, которое получила в макросе оффера." },
  { name: "status", req: true, text: "Статус события. reg или lead — лид (регистрация), dep или sale — продажа (депозит)." },
  { name: "payout", req: false, text: "Выплата за событие, число с точкой. Без неё конверсия получит выплату 0, а продажа с нулевой выплатой подсвечивается в журнале." },
  { name: "tid", req: false, text: "ID транзакции у партнёрки. Другой tid при том же subid — отдельная конверсия, тот же tid — перезапись." },
  { name: "currency", req: false, text: "Валюта выплаты, например usd. Без неё считается валютой трекера." },
]

function Guide() {
  const [open, setOpen] = useState(false)
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings.get })
  const domains = useQuery({ queryKey: ["domains"], queryFn: api.domains.list })
  const [domainId, setDomainId] = useState("")
  const list = (domains.data ?? []).filter((d) => d.status === "ok")
  const domain = list.find((d) => String(d.id) === domainId)?.name ?? list[0]?.name ?? "tracker.example.com"
  const key = settings.data?.postback_key ?? "<postback_key>"
  const url = `https://${domain}/${key}/postback?subid={subid}&status={status}&payout={payout}&tid={txid}`
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="-ml-2">
          <Icon icon={open ? ChevronDownIcon : ChevronRightIcon} size={14} /> Как подключить партнёрку
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Section className="mt-1">
          <div className="flex flex-col gap-4 p-3">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                Шаблон ссылки для поля postback / S2S в кабинете партнёрки
                {list.length > 1 && (
                  <Select value={domainId || String(list[0].id)} onValueChange={setDomainId}>
                    <SelectTrigger size="sm" className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>{list.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 rounded-md border bg-muted p-2 font-mono text-xs break-all">{url}</div>
                <CopyButton value={url} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Макросы в фигурных скобках ({"{subid}"}, {"{txid}"}) заменяет партнёрка, названия макросов у каждой свои — сверьтесь с её документацией.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Готовая ссылка для каждой партнёрки — в карточке партнёрки:{" "}
                <a className="text-link" href="#/affiliate-networks">Партнёрки</a>.
              </p>
            </div>

            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="text-[13px] text-muted-foreground">
                  <tr className="border-b">
                    <th className="h-9 px-2 text-left font-medium">Параметр</th>
                    <th className="h-9 px-2 text-left font-medium">Обязателен</th>
                    <th className="h-9 px-2 text-left font-medium">Что передавать</th>
                  </tr>
                </thead>
                <tbody>
                  {PARAMS.map((p) => (
                    <tr key={p.name} className="border-b last:border-b-0 align-top">
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap">{p.name}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{p.req ? "да" : "нет"}</td>
                      <td className="min-w-72 px-2 py-1.5">{p.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-sm">
              <div className="mb-1 font-medium">Соответствие статусов</div>
              <ul className="flex flex-col gap-0.5 text-muted-foreground">
                <li><span className="font-mono text-foreground">reg</span>, <span className="font-mono text-foreground">lead</span> → лид (регистрация)</li>
                <li><span className="font-mono text-foreground">dep</span>, <span className="font-mono text-foreground">sale</span> → продажа (депозит)</li>
                <li>Любой другой статус пропускается и попадает в журнал с результатом «Пропущен». Если партнёрка шлёт свои названия, добавьте их в «Настройки → Постбеки → Алиасы параметров».</li>
              </ul>
            </div>
          </div>
        </Section>
      </CollapsibleContent>
    </Collapsible>
  )
}
