// «Проверить клик»: pick visitor attributes and see which stream takes the click (with unsaved weights).
import { useMemo, useState } from "react"
import { CheckIcon, MinusIcon, XIcon } from "lucide-react"
import type { Stream } from "@/api/types"
import { STREAM_FILTERS, streamFilterDef } from "@/api/meta"
import { cn } from "@/lib/utils"
import { fmtPercent } from "@/lib/format"
import { Icon } from "@/components/icon"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { filterText } from "./stream-text"
import { simulate, type Visitor } from "./simulate"

const ANY = "__any"
const FIELDS = ["country", "region", "device_type", "os", "browser", "language", "connection_type"] as const

const TYPE_TITLE = { forced: "Перехватывающие", regular: "Обычные", default: "Замыкающие" } as const

export function CheckClickDialog({ open, onOpenChange, streams, weightOf }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  streams: Stream[]
  weightOf: (s: Stream) => number
}) {
  const [v, setV] = useState<Visitor>({ country: "US", region: "", device_type: "mobile", os: "iOS", browser: "Facebook", language: "en", connection_type: "", bot: false })
  const res = useMemo(() => simulate(streams, weightOf, v), [streams, weightOf, v])
  const winners = res.steps.filter((s) => s.chance > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Проверить клик</DialogTitle>
          <DialogDescription>Какой поток получит посетителя с такими данными. Учитываются несохранённые веса.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          {FIELDS.map((k) => {
            const def = STREAM_FILTERS.find((f) => f.key === k)!
            return (
              <div key={k} className="flex min-w-0 flex-col gap-1">
                <Label className="text-sm text-muted-foreground">{def.name}</Label>
                <Select value={v[k] || ANY} onValueChange={(x) => setV((p) => ({ ...p, [k]: x === ANY ? "" : x }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Не важно</SelectItem>
                    {def.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
          <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
            <Switch size="sm" checked={v.bot} onCheckedChange={(b) => setV((p) => ({ ...p, bot: b }))} /> Бот
          </label>
        </div>

        <div className="rounded-md border px-3 py-2 text-sm">
          {winners.length === 0 ? (
            <span className="text-destructive">Ни один поток не подходит — клик получит ошибку. Добавьте замыкающий поток.</span>
          ) : winners.length === 1 ? (
            <span>Клик получит <b className="font-medium">{winners[0].stream.name}</b>{res.fallback && <span className="text-muted-foreground"> (ни один обычный поток не подошёл)</span>}</span>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Клик распределится по весам:</span>
              {winners.map((w) => (
                <div key={w.stream.id} className="flex justify-between gap-3">
                  <span className="truncate">{w.stream.name}</span>
                  <span className="num shrink-0">{fmtPercent(w.chance)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full border-separate border-spacing-0 text-sm [&_td]:border-b [&_th]:border-b">
            <thead className="text-[13px] text-muted-foreground">
              <tr>
                <th className="h-9 px-2.5 text-left font-medium">Поток</th>
                <th className="px-2.5 text-right font-medium">Шанс</th>
                <th className="px-2 text-left font-medium">Фильтры</th>
              </tr>
            </thead>
            <tbody>
              {res.steps.map((s, i) => {
                const head = i === 0 || res.steps[i - 1].stream.type !== s.stream.type
                return [
                  head && (
                    <tr key={`h-${s.stream.type}`}><td colSpan={3} className="h-8 bg-muted px-2.5 text-xs font-medium text-muted-foreground">{TYPE_TITLE[s.stream.type]}</td></tr>
                  ),
                  <tr key={s.stream.id} className={cn("align-top", !s.passed && "text-muted-foreground")}>
                    <td className="h-9 px-2.5 py-1">{s.stream.name}</td>
                    <td className={cn("num h-9 px-2.5 py-1 text-right", s.chance > 0 ? "font-medium text-success" : "text-muted-foreground")}>{s.chance > 0 ? fmtPercent(s.chance) : "—"}</td>
                    <td className="h-9 px-2 py-1">
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {s.checks.length === 0 && <span className="text-muted-foreground">без фильтров</span>}
                        {s.checks.map((c, j) => (
                          <span
                            key={j}
                            title={c.ok === null ? `«${streamFilterDef(c.filter.name)?.name ?? c.filter.name}» здесь не проверяется` : undefined}
                            className={cn("inline-flex items-center gap-1 whitespace-nowrap", c.ok === true && "text-success", c.ok === false && "text-destructive")}
                          >
                            <Icon icon={c.ok === null ? MinusIcon : c.ok ? CheckIcon : XIcon} size={11} />
                            {filterText(c.filter)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>,
                ]
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
