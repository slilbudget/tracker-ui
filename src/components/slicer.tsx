// «Команда: все ▾» — a button that opens a checkbox list with search; empty selection = all.
// Used above the report and in the offer replacement.
import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface SlicerOption { value: string; label: string }

export function Slicer({ label, options, value, onChange, className }: {
  label: string
  options: SlicerOption[]
  value: string[]
  onChange: (v: string[]) => void
  className?: string
}) {
  const [q, setQ] = useState("")
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
  const text = !value.length ? "все" : value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? value[0] : `выбрано ${value.length}`
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-between font-normal sm:max-w-64", value.length > 0 && "border-primary", className)}>
          <span className="truncate"><span className="text-muted-foreground">{label}:</span> {text}</span>
          <Icon icon={ChevronDownIcon} size={14} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(18rem,calc(100vw-1.5rem))] gap-2 p-2">
        {options.length > 8 && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" aria-label={`Поиск: ${label}`} />}
        <div className="max-h-72 overflow-y-auto">
          {shown.map((o) => (
            <Label key={o.value} className="h-8 gap-2 rounded-md px-1 text-sm font-normal">
              <Checkbox checked={value.includes(o.value)} onCheckedChange={(v) => onChange(v ? [...value, o.value] : value.filter((x) => x !== o.value))} />
              <span className="truncate">{o.label}</span>
            </Label>
          ))}
          {!shown.length && <p className="p-2 text-xs text-muted-foreground">Ничего не найдено</p>}
        </div>
        {value.length > 0 && <Button variant="ghost" onClick={() => onChange([])}>Все {label.toLowerCase()}</Button>}
      </PopoverContent>
    </Popover>
  )
}
