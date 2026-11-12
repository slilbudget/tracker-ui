import { useState } from "react"
import type { DateRange as DayRange } from "react-day-picker"
import { ru } from "react-day-picker/locale"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "@/api/types"
import { DATE_INTERVALS } from "@/api/meta"
import { resolveRange } from "@/lib/dates"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Icon } from "@/components/icon"

const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const fromKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number)
  return new Date(y, m - 1, d)
}
const short = (k: string) => k.split("-").reverse().slice(0, 2).join(".")

// Period picker: presets on the left, calendar for a custom range on the right.
export function PeriodSelect({ value, onChange }: { value: DateRange; onChange: (r: Pick<DateRange, "interval" | "from" | "to">) => void }) {
  const [open, setOpen] = useState(false)
  const resolved = resolveRange(value)
  const [draft, setDraft] = useState<DayRange | undefined>()
  // «today» of the app timezone, not of the browser
  const today = fromKey(resolveRange({ interval: "today", timezone: value.timezone }).to)
  // each opening starts from the period that is applied now
  const onOpenChange = (v: boolean) => {
    if (v) setDraft({ from: fromKey(resolved.from), to: fromKey(resolved.to) })
    setOpen(v)
  }
  const label =
    value.interval === "custom"
      ? `${short(resolved.from)} — ${short(resolved.to)}`
      : DATE_INTERVALS.find((i) => i.value === value.interval)?.label
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-40 justify-start">
          <Icon icon={CalendarIcon} className="text-muted-foreground" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={8} className="max-h-[85svh] w-auto max-w-[calc(100vw-16px)] overflow-y-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="grid grid-cols-2 gap-1 border-b p-2 sm:flex sm:w-44 sm:flex-col sm:border-r sm:border-b-0">
            {DATE_INTERVALS.filter((i) => i.value !== "custom").map((i) => (
              <Button
                key={i.value}
                variant="ghost"
                className={cn("justify-start", value.interval === i.value && "bg-accent text-foreground")}
                onClick={() => { onChange({ interval: i.value }); setOpen(false) }}
              >
                {i.label}
              </Button>
            ))}
          </div>
          <div className="p-2">
            <Calendar mode="range" locale={ru} numberOfMonths={1} selected={draft} onSelect={setDraft} weekStartsOn={1} disabled={{ after: today }} />
            <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-popover pt-2">
              <Button
                disabled={!draft?.from}
                onClick={() => {
                  if (!draft?.from) return
                  onChange({ interval: "custom", from: toKey(draft.from), to: toKey(draft.to ?? draft.from) })
                  setOpen(false)
                }}
              >
                Применить
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
