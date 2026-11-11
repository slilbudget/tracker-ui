// Small shared building blocks used across sections.
import { useState, type ReactNode } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { CheckIcon, CopyIcon, SearchIcon } from "lucide-react"
import { metricDef } from "@/api/meta"
import { fmtMetric, signClass } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Icon } from "@/components/icon"

// ---------- state ----------

export function StateDot({ state }: { state: string }) {
  const color =
    state === "active" || state === "ok" ? "bg-success"
    : state === "error" ? "bg-destructive"
    : state === "paused" || state === "awaiting_dns" || state === "requesting_cert" || state === "retrying" || state === "ignored" ? "bg-warning"
    : "bg-muted-foreground/40"
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", color)} />
}

// «Название» cell of entity lists: state dot + name. Long names are cut (full text in the tooltip) so default columns fit 1280px.
export function EntityName({ state, name }: { state: string; name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <StateDot state={state} />
      <span data-cap className="max-w-52 min-w-0 truncate font-medium min-[1400px]:max-w-96" title={name}>{name}</span>
    </span>
  )
}

export function StateFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Все состояния</SelectItem>
        <SelectItem value="active">Включённые</SelectItem>
        <SelectItem value="disabled">Выключенные</SelectItem>
      </SelectContent>
    </Select>
  )
}

// ---------- search ----------

export function SearchInput({ value, onChange, placeholder = "Поиск…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn("relative w-full max-sm:!basis-full sm:w-72", className)}>
      <Icon icon={SearchIcon} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  )
}

// ---------- metric columns ----------

// Builds right-aligned, formatted, sortable columns for metric keys. `get` reads stats for a row.
export function metricColumns<T>(keys: string[], get: (row: T) => Record<string, number> | undefined, hidden: string[] = []): ColumnDef<T, unknown>[] {
  return keys
    .filter((k) => !hidden.includes(k))
    .map((k) => {
      const def = metricDef(k)
      return {
        id: k,
        header: def?.short ?? def?.name ?? k,
        meta: { align: "right", label: def?.name ?? k, metric: true },
        accessorFn: (row: T) => get(row)?.[k] ?? 0,
        cell: ({ getValue }) => {
          const v = getValue() as number
          return <span className={signClass(k, v)}>{fmtMetric(k, v)}</span>
        },
      } satisfies ColumnDef<T, unknown>
    })
}

// Summary footer values for metric columns from a list of stats.
export function metricSummary(keys: string[], stats: Record<string, number>[]): Record<string, ReactNode> {
  const sum = (k: string) => stats.reduce((s, x) => s + (x?.[k] ?? 0), 0)
  const clicks = sum("clicks"), cost = sum("cost"), revenue = sum("revenue"), sale = sum("sale_revenue")
  const leads = sum("leads"), sales = sum("sales"), lp = sum("lp_clicks")
  const derived: Record<string, number> = {
    cr: clicks ? (leads / clicks) * 100 : 0, crs: clicks ? (sales / clicks) * 100 : 0, lp_ctr: clicks ? (lp / clicks) * 100 : 0,
    approve: leads ? (sales / leads) * 100 : 0,
    roi: cost ? ((revenue - cost) / cost) * 100 : 0, roi_confirmed: cost ? ((sale - cost) / cost) * 100 : 0,
    epc_confirmed: clicks ? sale / clicks : 0, cpc: clicks ? cost / clicks : 0,
    cpa: leads ? cost / leads : 0, cps: sales ? cost / sales : 0, avg_sale: sales ? sale / sales : 0,
  }
  return Object.fromEntries(
    keys.map((k) => {
      const v = k in derived ? derived[k] : sum(k)
      return [k, <span key={k} className={signClass(k, v)}>{fmtMetric(k, v)}</span>]
    }),
  )
}

// ---------- confirm ----------

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = "Подтвердить", destructive, onConfirm,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: ReactNode; confirmLabel?: string; destructive?: boolean; onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? "destructive" : "default"} onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------- side panel for create / edit forms ----------

export function EntitySheet({
  open, onOpenChange, title, description, children, onSubmit, submitLabel = "Сохранить", submitting, wide, footerExtra,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode
  onSubmit?: () => void; submitLabel?: string; submitting?: boolean; wide?: boolean; footerExtra?: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} className={cn("flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl", wide && "data-[side=right]:sm:max-w-3xl")}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => { e.preventDefault(); onSubmit?.() }}
        >
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
          {onSubmit && (
            <SheetFooter className="flex-row flex-wrap items-center gap-2">
              {footerExtra}
              <Button type="button" variant="outline" className="ml-auto" onClick={() => onOpenChange(false)}>Отмена</Button>
              <Button type="submit" disabled={submitting}>{submitLabel}</Button>
            </SheetFooter>
          )}
        </form>
      </SheetContent>
    </Sheet>
  )
}

// Label + control row. Stacks on mobile, label column on wider panels.
export function FormRow({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1.5 py-2 sm:grid-cols-[180px_1fr] sm:items-start sm:gap-4">
      <Label htmlFor={htmlFor} className="pt-1.5 text-sm text-muted-foreground">{label}</Label>
      <div className="flex min-h-8 min-w-0 flex-col justify-center gap-1">
        {children}
        {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}

// ---------- copy ----------

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size={label ? "default" : "icon-sm"}
      aria-label="Копировать"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard?.writeText(value).catch(() => {})
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
    >
      <Icon icon={done ? CheckIcon : CopyIcon} />
      {label && (done ? "Скопировано" : label)}
    </Button>
  )
}

// ---------- CSV export ----------

export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    // Excel with Russian settings reads «;» as the separator and «,» as the decimal mark
    const s = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v)
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [header, ...rows].map((r) => r.map(esc).join(";")).join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
