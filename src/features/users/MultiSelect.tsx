// Multi-select with search: popover with a checkbox list, selected items listed under the trigger.
import { useState } from "react"
import { ChevronDownIcon, XIcon } from "lucide-react"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function MultiSelect({
  options, value, onChange, placeholder = "Не выбрано", disabled,
}: {
  options: { value: number; label: string }[]
  value: number[]
  onChange: (v: number[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [q, setQ] = useState("")
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
  const toggle = (v: number) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const selected = options.filter((o) => value.includes(o.value))
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Popover>
        <PopoverTrigger asChild disabled={disabled}>
          <Button type="button" variant="outline" className="w-full justify-between font-normal">
            <span className={value.length ? "" : "text-muted-foreground"}>{value.length ? `Выбрано: ${value.length}` : placeholder}</span>
            <Icon icon={ChevronDownIcon} size={14} className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-60 p-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск…" className="mb-2" />
          <div className="mb-1 flex gap-2 text-xs">
            <Button type="button" variant="ghost" size="xs" onClick={() => onChange(Array.from(new Set([...value, ...shown.map((o) => o.value)])))}>Выбрать все</Button>
            <Button type="button" variant="ghost" size="xs" onClick={() => onChange([])}>Снять все</Button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {shown.length === 0 && <div className="px-2 py-3 text-sm text-muted-foreground">Ничего не найдено</div>}
            {shown.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                <Checkbox checked={value.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.slice(0, 40).map((o) => (
            <span key={o.value} className="inline-flex h-5 items-center gap-1 rounded-sm border bg-muted pr-1 pl-2 text-xs">
              {o.label}
              {!disabled && (
                <button type="button" aria-label={`Убрать ${o.label}`} onClick={() => toggle(o.value)} className="text-muted-foreground">
                  <Icon icon={XIcon} size={10} />
                </button>
              )}
            </span>
          ))}
          {selected.length > 40 && <span className="text-xs text-muted-foreground">и ещё {selected.length - 40}</span>}
        </div>
      )}
    </div>
  )
}
