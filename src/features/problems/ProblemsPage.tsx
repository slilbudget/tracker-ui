// «Проблемы»: what is broken right now across the tracker (observability). Each row = one open problem with
// the numbers behind it and links to where it is fixed. The backend runs the checks every few minutes and sends
// a Telegram alert when a problem opens; here it can be muted for a while or marked as solved.
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { SettingsIcon } from "lucide-react"
import type { Problem, ProblemCheck, ProblemKind } from "@/api/types"
import { PROBLEM_KINDS } from "@/api/meta"
import { api } from "@/api/client"
import { useAccess, useApp, useUrlParam } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { EntitySheet, FormRow } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { formatDateTime } from "@/lib/dates"
import { cn } from "@/lib/utils"

const kindName = (k: ProblemKind) => PROBLEM_KINDS.find((x) => x.kind === k)?.name ?? k
const STATUS = [
  { value: "open", label: "Открытые" },
  { value: "muted", label: "Заглушённые" },
  { value: "resolved", label: "Решённые" },
  { value: "all", label: "Все" },
]

function since(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3600000)
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))} мин`
  if (h < 48) return `${h} ч`
  return `${Math.floor(h / 24)} дн.`
}

export default function ProblemsPage() {
  const { timezone } = useApp()
  const qc = useQueryClient()
  const { canEdit, isFull, level } = useAccess("problems")
  // a buyer handles problems of his campaigns; company-wide ones (networks, domains, caps) — team leads and admins
  const canHandle = (p: Problem) => canEdit && (isFull || level === "groups" || p.buyer_id != null)
  const [status, setStatus] = useUrlParam("status", "open")
  const [kind, setKind] = useUrlParam("kind")
  const [buyer, setBuyer] = useUrlParam("buyer")
  const [settings, setSettings] = useState(false)
  const list = useQuery({ queryKey: ["problems"], queryFn: api.problems.list, refetchInterval: 60000 })
  const users = useQuery({ queryKey: ["users"], queryFn: api.users.list })
  const login = (id: number | null) => (id == null ? "все" : users.data?.find((u) => u.id === id)?.login ?? `#${id}`)

  const done = () => { qc.invalidateQueries({ queryKey: ["problems"] }) }
  const mute = useMutation({ mutationFn: (id: string) => api.problems.mute(id, 4), onSuccess: () => { done(); toast.success("Заглушено на 4 ч: алертов не будет, потом проблема вернётся, если не исправлена") } })
  const resolve = useMutation({ mutationFn: (id: string) => api.problems.resolve(id), onSuccess: () => { done(); toast.success("Отмечено решённой. Если проверка снова найдёт проблему, она откроется заново") } })
  const reopen = useMutation({ mutationFn: (id: string) => api.problems.reopen(id), onSuccess: done })

  const all = list.data ?? []
  const byStatus = all.filter((p) => status === "all" || p.status === status)
  const rows = byStatus.filter((p) => (!kind || p.kind === kind) && (!buyer || String(p.buyer_id) === buyer || p.buyer_id == null))
  const counts = useMemo(() => {
    const m = new Map<ProblemKind, number>()
    for (const p of byStatus) m.set(p.kind, (m.get(p.kind) ?? 0) + 1)
    return m
  }, [byStatus])
  const buyers = [...new Set(all.map((p) => p.buyer_id).filter((x): x is number => x != null))]
  const [, setParams] = useSearchParams()
  const filtered = !!(kind || buyer || status !== "open")
  const reset = () => setParams((p) => { const n = new URLSearchParams(p); ["kind", "buyer", "status"].forEach((k) => n.delete(k)); return n }, { replace: true })
  const critical = all.filter((p) => p.status === "open" && p.severity === "critical").length

  return (
    <Page>
      <PageHeader
        title="Проблемы"
        actions={isFull && <Button variant="outline" onClick={() => setSettings(true)}><Icon icon={SettingsIcon} size={14} /> Настроить проверки</Button>}
      >
        <p className="text-sm text-muted-foreground">
          Проверки идут каждые 5 минут по кликам, постбекам, расходам FB, капам и доменам. Новая проблема сразу уходит в Telegram.
          {critical > 0 && <> Сейчас критичных: <span className="text-destructive">{critical}</span>.</>}
        </p>
      </PageHeader>

      <div className="flex flex-wrap gap-1.5 text-sm">
        <KindChip active={!kind} onClick={() => setKind("")} label="Все" n={byStatus.length} />
        {PROBLEM_KINDS.filter((k) => counts.get(k.kind)).map((k) => (
          <KindChip key={k.kind} active={kind === k.kind} onClick={() => setKind(kind === k.kind ? "" : k.kind)} label={k.name} n={counts.get(k.kind)!} />
        ))}
      </div>

      <Toolbar
        right={
          <>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            {buyers.length > 1 && (
              <Select value={buyer || "all"} onValueChange={(v) => setBuyer(v === "all" ? "" : v)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все байеры</SelectItem>
                  {buyers.map((b) => <SelectItem key={b} value={String(b)}>{login(b)}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </>
        }
      />

      {list.isLoading ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border px-4 py-10 text-center text-sm text-muted-foreground">
          {status === "open" && !kind && !buyer ? "Проблем нет: все проверки проходят." : "Ничего не найдено."}
          {filtered && <div className="mt-2"><Button variant="outline" onClick={reset}>Сбросить фильтры</Button></div>}
        </div>
      ) : (
        <ul className="rounded-md border">
          {rows.map((p) => (
            <ProblemRow
              key={p.id}
              p={p}
              buyer={login(p.buyer_id)}
              timezone={timezone}
              canEdit={canHandle(p)}
              onMute={() => mute.mutate(p.id)}
              onResolve={() => resolve.mutate(p.id)}
              onReopen={() => reopen.mutate(p.id)}
            />
          ))}
        </ul>
      )}

      {isFull && <ChecksSheet open={settings} onClose={() => setSettings(false)} />}
    </Page>
  )
}

function KindChip({ active, onClick, label, n }: { active: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2", active ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground")}
    >
      {label} <span className="num text-foreground">{n}</span>
    </button>
  )
}

function ProblemRow({ p, buyer, timezone, canEdit, onMute, onResolve, onReopen }: {
  p: Problem; buyer: string; timezone: string; canEdit: boolean; onMute: () => void; onResolve: () => void; onReopen: () => void
}) {
  const critical = p.severity === "critical"
  return (
    <li className={cn("flex flex-col gap-2 border-b px-3 py-3 last:border-b-0 sm:flex-row sm:items-start", p.status !== "open" && "text-muted-foreground")}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn("size-2 shrink-0 rounded-full", critical ? "bg-destructive" : "bg-warning")} aria-hidden />
          <span className={cn("text-xs", critical ? "text-destructive" : "text-warning")}>{critical ? "Критично" : "Внимание"}</span>
          <span className="text-xs text-muted-foreground">{kindName(p.kind)}</span>
          {p.status === "muted" && <span className="text-xs">заглушено до {formatDateTime(p.muted_until, timezone)}</span>}
          {p.status === "resolved" && <span className="text-xs">отмечено решённой</span>}
        </div>
        <div className="font-medium break-words text-foreground">{p.title}</div>
        <p className="text-sm break-words text-muted-foreground">{p.details}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
          {p.where.map((w) => <a key={w.href + w.label} href={w.href} className="max-w-full truncate text-link">{w.label}</a>)}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:w-64 sm:flex-col sm:items-end">
        <div className="text-sm sm:text-right">
          <span className="num">{since(p.since)}</span> <span className="text-muted-foreground">· с {formatDateTime(p.since, timezone)}</span>
          <div className="text-xs text-muted-foreground">Байер: {buyer}</div>
        </div>
        {canEdit && (
          <div className="flex gap-2 max-sm:ml-auto">
            {p.status === "open" ? (
              <>
                <Button variant="outline" size="sm" onClick={onMute}>Заглушить на 4 ч</Button>
                <Button variant="outline" size="sm" onClick={onResolve}>Решено</Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={onReopen}>Вернуть в открытые</Button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

function ChecksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ["problems", "checks"], queryFn: api.problems.checks, enabled: open })
  return (
    <EntitySheet open={open} onOpenChange={(v) => !v && onClose()} title="Проверки" description="Что проверять, с какими порогами и что отправлять в Telegram" wide>
      {q.data ? <ChecksForm key={JSON.stringify(q.data)} initial={q.data} onSaved={() => { qc.invalidateQueries({ queryKey: ["problems"] }); onClose() }} onCancel={onClose} /> : <p className="text-sm text-muted-foreground">Загрузка…</p>}
    </EntitySheet>
  )
}

function ChecksForm({ initial, onSaved, onCancel }: { initial: { checks: ProblemCheck[]; chat: string }; onSaved: () => void; onCancel: () => void }) {
  const [checks, setChecks] = useState(initial.checks)
  const [chat, setChat] = useState(initial.chat)
  const save = useMutation({ mutationFn: () => api.problems.saveChecks({ checks, chat }), onSuccess: () => { toast.success("Проверки сохранены"); onSaved() } })
  const patch = (kind: ProblemKind, v: Partial<ProblemCheck>) => setChecks((xs) => xs.map((c) => (c.kind === kind ? { ...c, ...v } : c)))
  return (
    <div className="flex flex-col gap-3">
      <FormRow label="Чат Telegram" htmlFor="pr-chat" hint="Куда уходят алерты. Байер дополнительно получает алерты по своим кампаниям в личку бота">
        <Input id="pr-chat" value={chat} onChange={(e) => setChat(e.target.value)} />
      </FormRow>
      <ul className="rounded-md border">
        {checks.map((c) => {
          const def = PROBLEM_KINDS.find((k) => k.kind === c.kind)!
          return (
            <li key={c.kind} className="flex flex-col gap-2 border-b px-3 py-2.5 last:border-b-0">
              <div className="flex items-start gap-3">
                <Switch checked={c.enabled} onCheckedChange={(v) => patch(c.kind, { enabled: v })} aria-label={def.name} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{def.name}</div>
                  <div className="text-xs text-muted-foreground">{def.hint}</div>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  В Telegram <Switch checked={c.notify} disabled={!c.enabled} onCheckedChange={(v) => patch(c.kind, { notify: v })} />
                </label>
              </div>
              {c.enabled && def.unit && (
                <div className="flex flex-wrap items-center gap-2 pl-12 text-sm">
                  {def.auto && (
                    <label className="flex items-center gap-2">
                      <Switch checked={c.threshold == null} onCheckedChange={(v) => patch(c.kind, { threshold: v ? null : 6 })} /> Порог автоматически
                    </label>
                  )}
                  {c.threshold != null ? (
                    <span className="flex items-center gap-2">
                      Порог <Input type="number" min={1} className="h-8 w-20" value={c.threshold} onChange={(e) => patch(c.kind, { threshold: Math.max(1, Number(e.target.value) || 1) })} /> {def.unit}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{def.auto}</span>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Отмена</Button>
        <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>Сохранить</Button>
      </div>
    </div>
  )
}
