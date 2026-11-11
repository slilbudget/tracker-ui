// Filters popover shared by the report builder and the clicks log.
// Edits a local draft; «Применить» commits it (the URL / queries change once, not per keystroke).
// Values of dictionary fields (campaign, stream, landing, offer, partner, source, buyer, country...) are picked from lists;
// «содержит» and fields without a dictionary (sub ids...) take free text.
import { useState } from "react"
import { ChevronsUpDownIcon, ListFilterIcon, PlusIcon, XIcon } from "lucide-react"
import type { DimensionDef, FilterOperator, ReportFilter } from "@/api/types"
import { DIMENSIONS, dimensionDef } from "@/api/meta"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Icon } from "@/components/icon"
import { useDictionaries, type Option } from "./shared"

const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "EQUALS", label: "равно" },
  { value: "NOT_EQUAL", label: "не равно" },
  { value: "CONTAINS", label: "содержит" },
  { value: "NOT_CONTAIN", label: "не содержит" },
  { value: "IN_LIST", label: "в списке" },
  { value: "NOT_IN_LIST", label: "не в списке" },
]
const isList = (op: FilterOperator) => op === "IN_LIST" || op === "NOT_IN_LIST"
const isText = (op: FilterOperator) => op === "CONTAINS" || op === "NOT_CONTAIN"

// Shown under an empty report when an exact-match filter is set.
export const RELAX_HINT = "Нет совпадений — попробуйте оператор «содержит»."
export const hasExactFilter = (fs: ReportFilter[]) => fs.some((f) => f.operator === "EQUALS" || f.operator === "IN_LIST")

const DIMENSION_GROUPS: Record<DimensionDef["group"], string> = {
  campaign: "Кампания", facebook: "Facebook", geo: "Гео", device: "Устройство", params: "Параметры", time: "Время", other: "Прочее",
}

// Select of dimensions grouped by DimensionDef.group.
export function DimensionSelect({
  value, onChange, dimensions = DIMENSIONS, disabledKeys = [], className,
}: { value: string; onChange: (v: string) => void; dimensions?: DimensionDef[]; disabledKeys?: string[]; className?: string }) {
  const groups = (Object.keys(DIMENSION_GROUPS) as DimensionDef["group"][])
    .map((g) => ({ g, items: dimensions.filter((d) => d.group === g) }))
    .filter((x) => x.items.length)
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue placeholder="Поле" /></SelectTrigger>
      <SelectContent>
        {groups.map(({ g, items }) => (
          <SelectGroup key={g}>
            <SelectLabel>{DIMENSION_GROUPS[g]}</SelectLabel>
            {items.map((d) => <SelectItem key={d.key} value={d.key} disabled={disabledKeys.includes(d.key)}>{d.name}</SelectItem>)}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

export function filterText(f: ReportFilter) {
  const name = dimensionDef(f.name)?.name ?? f.name
  const op = FILTER_OPERATORS.find((o) => o.value === f.operator)?.label ?? f.operator
  const v = Array.isArray(f.expression) ? f.expression.join(", ") : String(f.expression ?? "")
  return `${name} ${op} ${v}`
}

interface Row { name: string; operator: FilterOperator; values: string[]; text: string }
const asArray = (e: ReportFilter["expression"]) => (Array.isArray(e) ? e.map(String) : e == null ? [] : [String(e)])
const toRows = (fs: ReportFilter[], dict: Record<string, Option[]>): Row[] =>
  fs.map((f) => {
    const picker = !!dict[f.name] && !isText(f.operator)
    return { name: f.name, operator: f.operator, values: picker ? asArray(f.expression) : [], text: picker ? "" : asArray(f.expression).join(", ") }
  })
const fromRows = (rows: Row[], dict: Record<string, Option[]>): ReportFilter[] =>
  rows.flatMap((r): ReportFilter[] => {
    if (dict[r.name] && !isText(r.operator)) {
      if (!r.values.length) return []
      return [{ name: r.name, operator: r.operator, expression: isList(r.operator) ? r.values : r.values[0] }]
    }
    if (!r.text.trim()) return []
    return [{ name: r.name, operator: r.operator, expression: isList(r.operator) ? r.text.split(/[,\n]/).map((x) => x.trim()).filter(Boolean) : r.text.trim() }]
  })

// Searchable single / multi select over a dictionary.
function ValueCombobox({
  options, value, onChange, multi, className,
}: { options: Option[]; value: string[]; onChange: (v: string[]) => void; multi: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  // values that are not in the dictionary any more (old link, archived entity) stay selectable
  const all = [...options, ...value.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: v }))]
  const label = value.map((v) => all.find((o) => o.value === v)?.label ?? v).join(", ")
  const toggle = (v: string) => {
    if (!multi) { onChange([v]); setOpen(false); return }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn("w-full justify-between font-normal", className)}>
          <span className={cn("truncate", !label && "text-muted-foreground")}>
            {label || (multi ? "выберите значения" : "выберите значение")}
          </span>
          <Icon icon={ChevronsUpDownIcon} size={14} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        <Command>
          <CommandInput placeholder="Поиск…" />
          <CommandList>
            <CommandEmpty>Ничего не найдено</CommandEmpty>
            {all.map((o) => (
              <CommandItem key={o.value} value={o.label} data-checked={value.includes(o.value)} onSelect={() => toggle(o.value)}>
                <span className="truncate">{o.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        {multi && value.length > 0 && (
          <div className="flex items-center justify-between border-t px-2 py-1 text-xs text-muted-foreground">
            Выбрано: {value.length}
            <Button variant="ghost" size="xs" onClick={() => onChange([])}><Icon icon={XIcon} size={12} /> Очистить</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function FilterBuilder({
  value, onChange, dimensions = DIMENSIONS,
}: { value: ReportFilter[]; onChange: (f: ReportFilter[]) => void; dimensions?: DimensionDef[] }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const dict = useDictionaries()
  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const commit = () => { onChange(fromRows(rows, dict)); setOpen(false) }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        if (v) setRows(toRows(value, dict))
        setOpen(v)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Icon icon={ListFilterIcon} className="text-muted-foreground" /> Фильтры{value.length ? ` (${value.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("gap-2 p-3", rows.length === 0 ? "w-[min(20rem,calc(100vw-1.5rem))]" : "w-[min(40rem,calc(100vw-1.5rem))]")}>
        <div className="text-sm font-medium">Фильтры (все условия через И)</div>
        {rows.length === 0 && <p className="text-xs text-muted-foreground">Условий нет. Добавьте первое.</p>}
        {rows.length > 0 && <p className="text-xs text-muted-foreground">Значения берутся из справочников. Нужна часть названия — выберите оператор «содержит».</p>}
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => {
            const options = dict[r.name]
            const picker = !!options && !isText(r.operator)
            const valueCls = "col-span-2 col-start-1 row-start-2 sm:col-span-1 sm:col-start-auto sm:row-start-auto"
            return (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 sm:grid-cols-[10rem_8rem_1fr_auto]">
                <DimensionSelect value={r.name} onChange={(v) => patch(i, { name: v, values: [], text: "" })} dimensions={dimensions} className="w-full" />
                <Select
                  value={r.operator}
                  onValueChange={(v) => {
                    const op = v as FilterOperator
                    // keep what was typed / picked when the value kind stays the same, carry one value across kinds
                    const wasPicker = !!options && !isText(r.operator)
                    const nowPicker = !!options && !isText(op)
                    patch(i, {
                      operator: op,
                      values: nowPicker ? (isList(op) ? r.values : r.values.slice(0, 1)) : [],
                      text: nowPicker ? "" : wasPicker ? r.values[0] ?? "" : r.text,
                    })
                  }}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{FILTER_OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
                {picker ? (
                  <div className={valueCls}>
                    <ValueCombobox options={options} value={r.values} multi={isList(r.operator)} onChange={(values) => patch(i, { values })} />
                  </div>
                ) : (
                  <Input
                    className={valueCls}
                    value={r.text}
                    onChange={(e) => patch(i, { text: e.target.value })}
                    placeholder={isList(r.operator) ? "значения через запятую" : isText(r.operator) ? "часть названия" : "значение"}
                    aria-label="Значение"
                    onKeyDown={(e) => e.key === "Enter" && commit()}
                  />
                )}
                <Button variant="ghost" size="icon" aria-label="Убрать условие" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  <Icon icon={XIcon} size={14} />
                </Button>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="outline" onClick={() => setRows((rs) => [...rs, { name: dimensions[0].key, operator: "EQUALS", values: [], text: "" }])}>
            <Icon icon={PlusIcon} size={14} /> Условие
          </Button>
          <Button variant="ghost" className="ml-auto" onClick={() => { onChange([]); setOpen(false) }}>Сбросить</Button>
          <Button onClick={commit}>Применить</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
