// Conversion side sheet (full data + status / payout change with a reason) and the bulk status dialog.
import { useState } from "react"
import { api } from "@/api/client"
import { Link } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { Conversion, ConversionStatus } from "@/api/types"

import { REJECT_REASONS, rejectReasonLabel } from "@/api/meta"
import { useAccess, useApp, useCanSeeMoney } from "@/app/state"
import { CopyButton, EntitySheet, FormRow } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime } from "@/lib/dates"
import { fmtMoney } from "@/lib/format"
import { ConversionStatusCell, EntityLink, STATUS_SHORT, useNames } from "./shared"

// Statuses a user may set by hand.
const EDITABLE: ConversionStatus[] = ["lead", "sale", "rejected"]

// Refresh everything that shows conversions or numbers built from them.
function useRefresh() {
  const qc = useQueryClient()
  return () => {
    for (const key of ["conversions", "report", "stats", "clicks", "audit", "offerGroups", "problems", "names"]) qc.invalidateQueries({ queryKey: [key] })
  }
}

export function duration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} с`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} мин`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч ${m % 60} мин`
  return `${Math.floor(h / 24)} д ${h % 24} ч`
}

export function ConversionSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["conversions", "one", id], queryFn: () => api.stats.conversions.get(id), enabled: !!id })
  const c = q.data
  return (
    <EntitySheet open={!!id} onOpenChange={(v) => !v && onClose()} title="Конверсия" description={`ID ${id}`} wide>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : !c ? (
        <p className="text-sm text-muted-foreground">Конверсия не найдена</p>
      ) : (
        // the key resets the form after the saved values come back
        <ConversionBody key={`${c.status}|${c.revenue}`} c={c} />
      )}
    </EntitySheet>
  )
}

function ConversionBody({ c }: { c: Conversion }) {
  const { timezone } = useApp()
  const money = useCanSeeMoney()
  const { canEdit } = useAccess("conversions")
  const nm = useNames().data
  const refresh = useRefresh()
  const [status, setStatus] = useState<ConversionStatus>(c.status)
  const [payout, setPayout] = useState(String(c.revenue))
  const [reason, setReason] = useState("")
  const [rejectReason, setRejectReason] = useState(c.reject_reason)
  const [error, setError] = useState("")

  const payoutNum = Number(payout.replace(",", "."))
  const payoutChanged = money && payout.trim() !== "" && payoutNum !== c.revenue
  const changed = status !== c.status || payoutChanged || (status === "rejected" && rejectReason !== c.reject_reason)

  const save = useMutation({
    mutationFn: () => api.stats.conversions.update([c.conversion_id], {
      status, revenue: payoutChanged ? payoutNum : undefined, reject_reason: status === "rejected" ? rejectReason : undefined,
      reason: reason.trim() || (status === "rejected" ? rejectReasonLabel(rejectReason) : ""),
    }),
    onSuccess: () => {
      refresh()
      const parts = [
        status !== c.status ? `статус: ${STATUS_SHORT[c.status]} → ${STATUS_SHORT[status]}` : "",
        payoutChanged ? `выплата: ${fmtMoney(c.revenue)} → ${fmtMoney(payoutNum)}` : "",
      ].filter(Boolean)
      toast.success(`Конверсия изменена (${parts.join(", ")})`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const submit = () => {
    if (payoutChanged && (!isFinite(payoutNum) || payoutNum < 0)) return setError("Выплата: число не меньше 0")
    if (status === "rejected" && !rejectReason) return setError("Выберите причину отклонения")
    if (payoutChanged && reason.trim().length < 3) return setError("Укажите причину: она попадёт в журнал действий")
    setError("")
    save.mutate()
  }

  const rows: [string, React.ReactNode][] = [
    ["Время постбека", formatDateTime(c.postback_datetime, timezone)],
    ["Время клика", formatDateTime(c.click_datetime, timezone)],
    ["До конверсии", duration(Date.parse(c.postback_datetime) - Date.parse(c.click_datetime))],
    [
      "Subid",
      <span key="s" className="inline-flex items-center gap-2">
        <Link to={`/clicks?click=${c.sub_id}&period=all_time`} className="font-mono text-link">{c.sub_id}</Link>
        <CopyButton value={c.sub_id} />
      </span>,
    ],
    ["TID", <span key="t" className="inline-flex items-center gap-2"><span className="font-mono">{c.tid}</span><CopyButton value={c.tid} /></span>],
    ["Кампания", <EntityLink key="c" kind="campaign" id={c.campaign_id} name={nm?.campaigns[c.campaign_id]} />],
    ["Поток", <EntityLink key="st" kind="stream" id={c.stream_id} parent={c.campaign_id} name={nm?.streams[c.stream_id]} />],
    ["Лендинг", <EntityLink key="l" kind="landing" id={c.landing_id} name={c.landing_id ? nm?.landings[c.landing_id] : undefined} />],
    ["Оффер", <EntityLink key="o" kind="offer" id={c.offer_id} name={c.offer_id ? nm?.offers[c.offer_id] : undefined} />],
    ["Статус", <ConversionStatusCell key="b" status={c.status} />],
    ["Исходный статус", c.original_status],
    ["Предыдущий статус", c.previous_status ? STATUS_SHORT[c.previous_status] : "—"],
    ...(c.status === "rejected" ? [["Причина отклонения", c.reject_reason ? `${c.reject_reason} — ${rejectReasonLabel(c.reject_reason)}` : "не указана"] as [string, string]] : []),
    ...(money ? [["Выплата", fmtMoney(c.revenue)] as [string, string]] : []),
    ...(money && c.status === "rejected" ? [["Отклонённая сумма", fmtMoney(c.rejected_revenue)] as [string, string]] : []),
  ]

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[minmax(7rem,10rem)_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="col-span-2 grid grid-cols-subgrid border-b py-1 last:border-b-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      {canEdit ? (
        <section className="rounded-md border p-3">
          <h3 className="text-sm font-semibold">Изменить конверсию</h3>
          <FormRow label="Статус">
            <Select value={status} onValueChange={(v) => setStatus(v as ConversionStatus)}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(EDITABLE.includes(c.status) ? EDITABLE : [c.status, ...EDITABLE]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_SHORT[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>
          {status === "rejected" && (
            <FormRow label="Причина отклонения" hint="Как в отчёте партнёрки. Попадает в отчёт «PBI: Срезы»">
              <Select value={rejectReason || undefined} onValueChange={setRejectReason}>
                <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Выберите причину" /></SelectTrigger>
                <SelectContent>{REJECT_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.value} — {r.label}</SelectItem>)}</SelectContent>
              </Select>
            </FormRow>
          )}
          {money && (
            <FormRow
              label="Выплата, $"
              htmlFor="conv-payout"
              hint={status === "sale" && payoutNum === 0 ? "Продажа без выплаты: проверьте оффер и постбек." : undefined}
            >
              <Input id="conv-payout" inputMode="decimal" className="sm:w-56" value={payout} onChange={(e) => setPayout(e.target.value)} />
            </FormRow>
          )}
          <FormRow label="Комментарий" htmlFor="conv-reason" error={error} hint="Обязателен при смене выплаты. Записывается в журнал действий.">
            <Textarea id="conv-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: фрод по данным партнёрки" />
          </FormRow>
          <div className="flex gap-2 pt-1">
            <Button type="button" disabled={!changed || save.isPending} onClick={submit}>Сохранить</Button>
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Ваша роль не позволяет менять конверсии.</p>
      )}
    </div>
  )
}

// Bulk «Подтвердить» / «Отклонить» for selected rows: one dialog with the reason.
export function BulkStatusDialog({
  status, ids, onClose, onDone,
}: { status: ConversionStatus | null; ids: string[]; onClose: () => void; onDone: () => void }) {
  const refresh = useRefresh()
  const [reason, setReason] = useState("")
  const [rejectReason, setRejectReason] = useState("")
  const [error, setError] = useState("")
  const reject = status === "rejected"
  const run = useMutation({
    mutationFn: () => api.stats.conversions.update(ids, {
      status: status!, reject_reason: reject ? rejectReason : undefined,
      reason: reason.trim() || (reject ? rejectReasonLabel(rejectReason) : ""),
    }),
    onSuccess: (r) => {
      refresh()
      toast.success(`${reject ? "Отклонено" : "Подтверждено"}: ${r.updated}`)
      setReason("")
      onDone()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <Dialog open={!!status} onOpenChange={(v) => { if (!v) { setError(""); onClose() } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{reject ? `Отклонить конверсии (${ids.length})` : `Подтвердить конверсии (${ids.length})`}</DialogTitle>
          <DialogDescription>
            {reject
              ? "Статус станет «Отклонено», выплата обнулится. Причина попадёт в журнал действий."
              : "Статус станет «Продажа». Нулевая выплата заменится выплатой оффера."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {reject && (
            <Select value={rejectReason || undefined} onValueChange={setRejectReason}>
              <SelectTrigger className="w-full" aria-label="Причина отклонения"><SelectValue placeholder="Причина отклонения (обязательно)" /></SelectTrigger>
              <SelectContent>{REJECT_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.value} — {r.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Комментарий (необязательно)"
            aria-label="Комментарий"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button
            variant={reject ? "destructive" : "default"}
            disabled={run.isPending}
            onClick={() => {
              if (reject && !rejectReason) return setError("Выберите причину отклонения")
              run.mutate()
            }}
          >
            {reject ? "Отклонить" : "Подтвердить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
