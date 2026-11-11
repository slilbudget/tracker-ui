// «Журнал действий»: who changed what and when. Read-only table with filters.
import { useMemo } from "react"
import { useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import type { AuditEntry } from "@/api/types"
import { RESOURCES } from "@/api/meta"
import { api } from "@/api/client"
import { useApp, usePeriod, useUrlParam } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { PeriodSelect } from "@/components/period-select"
import { SearchInput } from "@/components/common"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDateTime, inRange, resolveRange } from "@/lib/dates"
import { cn } from "@/lib/utils"

const ACTIONS: Record<AuditEntry["action"], { label: string; cls: string }> = {
  create: { label: "Создание", cls: "text-success" },
  update: { label: "Изменение", cls: "" },
  delete: { label: "Удаление", cls: "text-destructive" },
  restore: { label: "Восстановление", cls: "text-warning" },
  login: { label: "Вход", cls: "text-muted-foreground" },
}
const resourceName = (k: string) => RESOURCES.find((r) => r.key === k)?.name ?? k

export default function AuditPage() {
  const { timezone } = useApp()
  const [range, setRange] = usePeriod("1_month_ago", false)
  const [q, setQ] = useUrlParam("q")
  const [userF, setUserF] = useUrlParam("user")
  const [actionF, setActionF] = useUrlParam("action")
  const [resourceF, setResourceF] = useUrlParam("resource")

  const log = useQuery({ queryKey: ["audit"], queryFn: api.audit.list })
  const users = useQuery({ queryKey: ["users"], queryFn: api.users.list })
  const userName = (id: number) => users.data?.find((u) => u.id === id)?.login ?? `#${id}`

  const rows = useMemo(() => {
    const rr = resolveRange(range)
    const s = q.toLowerCase()
    return (log.data ?? []).filter(
      (e) =>
        inRange(e.datetime, rr, range.timezone) &&
        (!userF || String(e.user_id) === userF) &&
        (!actionF || e.action === actionF) &&
        (!resourceF || e.resource === resourceF) &&
        (!s || e.summary.toLowerCase().includes(s) || e.ip.includes(s)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.data, users.data, range.interval, range.from, range.to, range.timezone, q, userF, actionF, resourceF])

  const columns = useMemo<ColumnDef<AuditEntry, unknown>[]>(
    () => [
      { id: "datetime", header: "Время", accessorFn: (e) => e.datetime, cell: ({ row }) => <span className="num">{formatDateTime(row.original.datetime, timezone)}</span> },
      { id: "user", header: "Пользователь", accessorFn: (e) => userName(e.user_id) },
      {
        id: "action", header: "Действие", accessorFn: (e) => ACTIONS[e.action].label,
        cell: ({ row }) => <span className={cn(ACTIONS[row.original.action].cls)}>{ACTIONS[row.original.action].label}</span>,
      },
      { id: "resource", header: "Раздел", accessorFn: (e) => resourceName(e.resource) },
      { id: "summary", header: "Что изменено", meta: { grow: true }, accessorFn: (e) => e.summary, cell: ({ row }) => <span className="block max-w-[640px] truncate" title={row.original.summary}>{row.original.summary}</span> },
      { id: "ip", header: "IP", accessorFn: (e) => e.ip, cell: ({ row }) => <span className="font-mono text-muted-foreground">{row.original.ip}</span> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users.data, timezone],
  )
  const filtered = !!(q || userF || actionF || resourceF)
  const [, setParams] = useSearchParams()
  // one update for all keys (several useUrlParam setters in a row overwrite each other)
  const resetFilters = () => setParams((p) => { const n = new URLSearchParams(p); ["q", "user", "action", "resource"].forEach((k) => n.delete(k)); return n }, { replace: true })

  return (
    <Page>
      <PageHeader title="Журнал действий" />
      <Toolbar
        left={<SearchInput value={q} onChange={setQ} placeholder="Описание или IP" />}
        right={
          <>
            <Select value={userF || "all"} onValueChange={(v) => setUserF(v === "all" ? "" : v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все пользователи</SelectItem>
                {users.data?.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.login}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={actionF || "all"} onValueChange={(v) => setActionF(v === "all" ? "" : v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все действия</SelectItem>
                {(Object.keys(ACTIONS) as AuditEntry["action"][]).map((a) => <SelectItem key={a} value={a}>{ACTIONS[a].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={resourceF || "all"} onValueChange={(v) => setResourceF(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все разделы</SelectItem>
                {RESOURCES.map((r) => <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <PeriodSelect value={range} onChange={setRange} />
          </>
        }
      />
      <DataTable
        data={rows}
        loading={log.isLoading}
        columns={columns}
        getRowId={(e) => String(e.id)}
        storageKey="audit"
        initialSort={[{ id: "datetime", desc: true }]}
        empty="За выбранный период действий нет"
        onResetFilters={filtered ? resetFilters : undefined}
      />
    </Page>
  )
}
