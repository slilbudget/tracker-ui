// «Загрузить конверсии»: textarea with CSV lines → live preview of parsed rows and errors per line → import.
// A single line is also the way to add a conversion by hand. An existing conversion of the same subid (and TID) is updated.
import { useDeferredValue, useMemo, useState } from "react"
import { api } from "@/api/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { ConversionStatus } from "@/api/types"
import { type ImportRow } from "@/api/client-stats"
import { useCanSeeMoney } from "@/app/state"
import { EntitySheet } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { fmtMoney } from "@/lib/format"
import { REJECT_REASONS, rejectReasonLabel } from "@/api/meta"
import { ConversionStatusCell } from "./shared"

const STATUSES: ConversionStatus[] = ["lead", "sale", "rejected", "rebill", "registration", "deposit"]
const EXAMPLE = "a1b2c3d4k9,sale,150,tx-1001\nf5e6d7c8m2,rejected,0,tx-1002,chargeback\n9c8b7a6fz1,lead,,"
const MAX_LINES = 5000

interface Parsed { rows: ImportRow[]; errors: { line: number; text: string }[]; total: number }

function parseConversions(text: string, money: boolean): Parsed {
  const rows: ImportRow[] = []
  const errors: Parsed["errors"] = []
  const lines = text.split(/\r?\n/)
  let total = 0
  lines.forEach((raw, i) => {
    const line = i + 1
    const t = raw.trim()
    if (!t) return
    const parts = t.split(/[,;\t]/).map((x) => x.trim())
    if (total === 0 && parts[0].toLowerCase() === "subid") return // header line
    total++
    if (total > MAX_LINES) return
    const [subid, statusRaw, payoutRaw = "", tid = "", reason = ""] = parts
    if (parts.length > 5) return void errors.push({ line, text: "больше 5 полей: ожидается subid,status,payout,tid,reason" })
    if (!subid) return void errors.push({ line, text: "пустой subid" })
    if (!/^[\w-]+$/.test(subid)) return void errors.push({ line, text: `subid «${subid}» содержит недопустимые символы` })
    const status = statusRaw?.toLowerCase() as ConversionStatus
    if (!statusRaw) return void errors.push({ line, text: "не указан статус (lead, sale или rejected)" })
    if (!STATUSES.includes(status)) return void errors.push({ line, text: `неизвестный статус «${statusRaw}»: допустимы lead, sale, rejected` })
    let payout: number | null = null
    if (payoutRaw !== "") {
      payout = Number(payoutRaw.replace(",", "."))
      if (!isFinite(payout) || payout < 0) return void errors.push({ line, text: `выплата «${payoutRaw}» не число (формат 150 или 150.5)` })
    }
    if (rows.some((r) => r.subid === subid && r.tid === tid && tid)) return void errors.push({ line, text: "дубль строки с тем же subid и tid" })
    if (reason && status !== "rejected") return void errors.push({ line, text: "причина указывается только для rejected" })
    rows.push({ line, subid, status, payout: money ? payout : null, tid, reason })
  })
  if (total > MAX_LINES) errors.push({ line: MAX_LINES + 1, text: `за один раз можно загрузить не больше ${MAX_LINES} строк` })
  return { rows, errors, total }
}

export function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const money = useCanSeeMoney()
  const qc = useQueryClient()
  const [text, setText] = useState("")
  const deferred = useDeferredValue(text)
  const parsed = useMemo(() => parseConversions(deferred, money), [deferred, money])
  const check = useQuery({
    queryKey: ["conversions", "import-preview", parsed.rows],
    queryFn: () => api.stats.conversions.previewImport(parsed.rows),
    enabled: open && parsed.rows.length > 0,
  })
  const checks = new Map(check.data?.map((c) => [c.line, c]))
  const serverErrors = (check.data ?? []).filter((c) => c.error).map((c) => ({ line: c.line, text: c.error! }))
  const errors = [...parsed.errors, ...serverErrors].sort((a, b) => a.line - b.line)
  const good = parsed.rows.filter((r) => !checks.get(r.line)?.error)

  const run = useMutation({
    mutationFn: () => api.stats.conversions.importRows(good),
    onSuccess: (r) => {
      for (const key of ["conversions", "report", "stats", "clicks", "audit", "offerGroups", "problems", "names"]) qc.invalidateQueries({ queryKey: [key] })
      toast.success(`Загружено: создано ${r.created}, обновлено ${r.updated}${errors.length ? `, пропущено строк с ошибкой: ${errors.length}` : ""}`)
      setText("")
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <EntitySheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Загрузить конверсии"
      description="Пакетная смена статусов по отчёту партнёрки или ручное добавление"
      wide
      onSubmit={() => good.length && run.mutate()}
      submitLabel={good.length ? `Загрузить (${good.length}${errors.length ? ` из ${parsed.total}` : ""})` : "Загрузить"}
      submitting={run.isPending || !good.length || check.isFetching}
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-md border bg-muted p-3 text-sm">
          <div className="font-medium">Формат: <span className="font-mono">subid,status,payout,tid,reason</span></div>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            <li>Одна конверсия на строку, разделитель запятая, точка с запятой или табуляция. Строку-заголовок можно оставить.</li>
            <li><span className="font-mono">status</span>: lead, sale или rejected.{money && <> <span className="font-mono">payout</span> можно пропустить: для sale возьмётся выплата оффера.</>}</li>
            <li><span className="font-mono">tid</span> необязателен. Если конверсия по этому subid уже есть, она обновится, иначе создастся новая.</li>
            <li><span className="font-mono">reason</span> — причина отклонения для rejected, как в отчёте партнёрки: {REJECT_REASONS.map((r) => r.value).join(", ")} или свой текст. Попадает в отчёт «Причины отклонений».</li>
          </ul>
        </div>

        <Textarea
          rows={8}
          className="font-mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE}
          aria-label="Строки конверсий"
          spellCheck={false}
        />

        {parsed.total > 0 && (
          <div className="text-sm text-muted-foreground">
            Строк: {parsed.total} · к загрузке: <span className="text-foreground">{good.length}</span>
            {errors.length > 0 && <> · с ошибкой: <span className="text-destructive">{errors.length}</span></>}
          </div>
        )}

        {errors.length > 0 && (
          <div className="rounded-md border border-destructive/50 p-2 text-sm">
            <div className="mb-1 font-medium text-destructive">Ошибки (эти строки не загрузятся)</div>
            <ul className="flex flex-col gap-0.5">
              {errors.slice(0, 50).map((e, i) => (
                <li key={i}><span className="num text-muted-foreground">Строка {e.line}:</span> {e.text}</li>
              ))}
              {errors.length > 50 && <li className="text-muted-foreground">…и ещё {errors.length - 50}</li>}
            </ul>
          </div>
        )}

        {good.length > 0 && (
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="text-[13px] text-muted-foreground">
                <tr>
                  <th className="h-9 px-2 text-right font-medium">№</th>
                  <th className="h-9 px-2 text-left font-medium">Subid</th>
                  <th className="h-9 px-2 text-left font-medium">Статус</th>
                  {money && <th className="h-9 px-2 text-right font-medium">Выплата</th>}
                  <th className="h-9 px-2 text-left font-medium">TID</th>
                  <th className="h-9 px-2 text-left font-medium">Причина</th>
                  <th className="h-9 px-2 text-left font-medium">Действие</th>
                </tr>
              </thead>
              <tbody>
                {good.slice(0, 50).map((r) => (
                  <tr key={r.line} className="border-t">
                    <td className="num h-9 px-2 text-right text-muted-foreground">{r.line}</td>
                    <td className="h-9 px-2 font-mono">{r.subid}</td>
                    <td className="h-9 px-2"><ConversionStatusCell status={r.status} /></td>
                    {money && <td className="num h-9 px-2 text-right">{r.payout == null ? <span className="text-muted-foreground">авто</span> : fmtMoney(r.payout)}</td>}
                    <td className="h-9 px-2 font-mono">{r.tid || <span className="text-muted-foreground">—</span>}</td>
                    <td className="h-9 px-2">{r.reason ? rejectReasonLabel(r.reason) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="h-9 px-2">
                      {checks.get(r.line)?.action === "update" ? <Badge variant="secondary">Обновить</Badge>
                        : checks.get(r.line)?.action === "create" ? <Badge variant="outline">Создать</Badge>
                        : <span className="text-muted-foreground">…</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {good.length > 50 && <div className="border-t px-2 py-1.5 text-xs text-muted-foreground">Показаны первые 50 из {good.length}</div>}
          </div>
        )}
      </div>
    </EntitySheet>
  )
}
