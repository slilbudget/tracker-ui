// Stream filters editor: add from a searchable grouped list, edit each as a sentence «Страна = США».
import { useState } from "react"
import { ChevronsUpDownIcon, PlusIcon, XIcon } from "lucide-react"
import type { StreamFilter, StreamFilterDef } from "@/api/types"
import { STREAM_FILTERS, STREAM_FILTER_GROUPS, streamFilterDef } from "@/api/meta"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Icon } from "@/components/icon"
import { cn } from "@/lib/utils"

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

export function FilterEditor({
  filters, onChange, filterOr, onFilterOrChange, readOnly,
}: { filters: StreamFilter[]; onChange: (f: StreamFilter[]) => void; filterOr: boolean; onFilterOrChange: (v: boolean) => void; readOnly?: boolean }) {
  const [adding, setAdding] = useState(false)
  const update = (i: number, patch: Partial<StreamFilter>) => onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const groups = Object.entries(Object.groupBy(STREAM_FILTERS, (f) => f.group)) as [StreamFilterDef["group"], StreamFilterDef[]][]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Поток срабатывает, если выполнены</span>
        <ToggleGroup type="single" variant="outline" value={filterOr ? "or" : "and"} onValueChange={(v) => v && onFilterOrChange(v === "or")} disabled={readOnly}>
          <ToggleGroupItem value="and">Все условия</ToggleGroupItem>
          <ToggleGroupItem value="or">Любое условие</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {filters.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Фильтров нет: в поток попадает весь трафик кампании
        </p>
      )}

      {filters.map((f, i) => {
        const def = streamFilterDef(f.name)
        return (
          <div key={i} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{def?.name ?? f.name}</span>
              <ToggleGroup type="single" variant="outline" value={f.mode} onValueChange={(v) => v && update(i, { mode: v as StreamFilter["mode"] })} disabled={readOnly}>
                <ToggleGroupItem value="accept">{def?.input === "boolean" ? "Да" : "Равно"}</ToggleGroupItem>
                <ToggleGroupItem value="reject">{def?.input === "boolean" ? "Нет" : "Не равно"}</ToggleGroupItem>
              </ToggleGroup>
              {!readOnly && (
                <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Удалить фильтр" onClick={() => onChange(filters.filter((_, j) => j !== i))}>
                  <Icon icon={XIcon} size={14} />
                </Button>
              )}
            </div>
            {def && def.input !== "boolean" && (
              <div className="mt-2">
                <FilterValue def={def} value={f.payload} onChange={(payload) => update(i, { payload })} readOnly={readOnly} />
              </div>
            )}
            {def?.hint && <p className="mt-1 text-xs text-muted-foreground">{def.hint}</p>}
          </div>
        )
      })}

      {!readOnly && (
        <Popover open={adding} onOpenChange={setAdding}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="self-start"><Icon icon={PlusIcon} size={14} /> Добавить фильтр</Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <Command>
              <CommandInput placeholder="Страна, бот, sub_id…" />
              <CommandList className="max-h-80">
                <CommandEmpty>Нет такого фильтра</CommandEmpty>
                {groups.map(([g, defs]) => (
                  <CommandGroup key={g} heading={STREAM_FILTER_GROUPS[g]}>
                    {defs.map((d) => (
                      <CommandItem
                        key={d.key}
                        value={`${d.name} ${d.key}`}
                        onSelect={() => {
                          onChange([...filters, { name: d.key, mode: "accept", payload: d.input === "boolean" ? ["1"] : [] }])
                          setAdding(false)
                        }}
                      >
                        {d.name}
                        {filters.some((f) => f.name === d.key) && <span className="ml-auto text-xs text-muted-foreground">уже есть</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

function FilterValue({ def, value, onChange, readOnly }: { def: StreamFilterDef; value: string[]; onChange: (v: string[]) => void; readOnly?: boolean }) {
  switch (def.input) {
    case "list":
      return <MultiSelect options={def.options ?? []} value={value} onChange={onChange} readOnly={readOnly} />
    case "tags":
      return (
        <Textarea
          rows={2}
          readOnly={readOnly}
          placeholder="Значения через запятую или с новой строки. Маски * и ?, regex в /слэшах/, @empty = пусто"
          value={value.join("\n")}
          onChange={(e) => onChange(e.target.value.split(/[\n,]/).map((s) => s.trim()).filter((s, i, a) => s || i === a.length - 1))}
        />
      )
    case "text":
      return <Input readOnly={readOnly} placeholder="имя_параметра=значение" value={value[0] ?? ""} onChange={(e) => onChange([e.target.value])} />
    case "limit": {
      const [hour = "", day = "", total = ""] = value
      const set = (i: number, v: string) => { const n = [hour, day, total]; n[i] = v; onChange(n) }
      return (
        <div className="grid grid-cols-3 gap-2 text-sm">
          {["в час", "в сутки", "всего"].map((l, i) => (
            <label key={l} className="flex flex-col gap-1 text-muted-foreground">
              {l}
              <Input type="number" min={0} readOnly={readOnly} value={[hour, day, total][i]} onChange={(e) => set(i, e.target.value)} placeholder="без лимита" />
            </label>
          ))}
        </div>
      )
    }
    case "date_range":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" className="w-40" readOnly={readOnly} value={value[0] ?? ""} onChange={(e) => onChange([e.target.value, value[1] ?? ""])} />
          <span className="text-muted-foreground">—</span>
          <Input type="date" className="w-40" readOnly={readOnly} value={value[1] ?? ""} onChange={(e) => onChange([value[0] ?? "", e.target.value])} />
        </div>
      )
    case "schedule": {
      // payload: ["1,2,3,4,5", "09:00", "21:00"]
      const days = (value[0] ?? "").split(",").filter(Boolean)
      return (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {WEEKDAYS.map((d, i) => {
              const on = days.includes(String(i + 1))
              return (
                <button
                  key={d}
                  type="button"
                  disabled={readOnly}
                  onClick={() => onChange([on ? days.filter((x) => x !== String(i + 1)).join(",") : [...days, String(i + 1)].sort().join(","), value[1] ?? "00:00", value[2] ?? "23:59"])}
                  className={cn("h-8 w-9 rounded-md border text-sm", on ? "border-primary bg-primary text-primary-foreground" : "")}
                >
                  {d}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            с <Input type="time" className="w-28" readOnly={readOnly} value={value[1] ?? "00:00"} onChange={(e) => onChange([value[0] ?? "", e.target.value, value[2] ?? "23:59"])} />
            до <Input type="time" className="w-28" readOnly={readOnly} value={value[2] ?? "23:59"} onChange={(e) => onChange([value[0] ?? "", value[1] ?? "00:00", e.target.value])} />
          </div>
        </div>
      )
    }
    default:
      return null
  }
}

function MultiSelect({ options, value, onChange, readOnly, placeholder = "Выберите значения" }: {
  options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; readOnly?: boolean; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const label = value.length ? value.map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ") : placeholder
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={readOnly}>
        <Button variant="outline" className={cn("w-full justify-between font-normal", !value.length && "text-muted-foreground")}>
          <span className="truncate">{label}</span>
          <Icon icon={ChevronsUpDownIcon} size={14} className="shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Поиск…" />
          <CommandList className="max-h-72">
            <CommandEmpty>Ничего не найдено</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const on = value.includes(o.value)
                return (
                  <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
                    <Checkbox checked={on} className="pointer-events-none" />
                    {o.label}
                    {o.label !== o.value && <span className="ml-auto text-xs text-muted-foreground">{o.value}</span>}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
