import { Children, Fragment, isValidElement, type ReactNode } from "react"
import { useIsFetching, useQueryClient } from "@tanstack/react-query"
import { RefreshCwIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon"

// Page frame: title row + optional toolbar + content. Every section page uses it.
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto flex w-full max-w-[1800px] flex-col gap-3 px-4 py-4 md:px-6", className)}>{children}</div>
}

// Reloads the data of the open page (all queries on screen) without reloading the browser tab.
// Desktop: last control of the toolbar, right after the period (as in Keitaro). Phones: next to the page title.
export function RefreshButton({ className }: { className?: string }) {
  const qc = useQueryClient()
  const busy = useIsFetching() > 0
  return (
    <Button variant="outline" size="icon" className={className} aria-label="Обновить данные" title="Обновить данные" disabled={busy}
      onClick={() => qc.refetchQueries({ type: "active" })}>
      <Icon icon={RefreshCwIcon} />
    </Button>
  )
}

export function PageHeader({ title, actions, children, refresh = true }: { title: ReactNode; actions?: ReactNode; children?: ReactNode; refresh?: boolean }) {
  return (
    // fixed row height: a page without buttons on the right starts its content at the same place as the others
    <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {refresh && <RefreshButton className="sm:hidden" />}
      </div>
      {children}
      {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
    </div>
  )
}

// Row of filters / buttons above a table. Left side = actions and search, right side = filters + period.
// The refresh button is glued to the last control (the period), so it never wraps onto a row of its own.
// Phones: buttons and filters two per row, search and period on full rows (the refresh button is next to the title there).
export function Toolbar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const items = Children.toArray(isValidElement<{ children?: ReactNode }>(right) && right.type === Fragment ? right.props.children : right)
  const last = items.pop()
  return (
    <div className="flex flex-wrap items-center gap-2 max-sm:[&>*]:grow max-sm:[&>*]:basis-[calc(50%-0.25rem)]">
      {left}
      <div className="flex flex-wrap items-center gap-2 xl:ml-auto max-sm:!basis-full max-sm:[&>*]:grow max-sm:[&>*]:basis-[calc(50%-0.25rem)]">
        {items}
        <div className="flex items-center gap-2 max-sm:!basis-full max-sm:[&>*:first-child]:grow">
          {last}
          <RefreshButton className="max-sm:hidden" />
        </div>
      </div>
    </div>
  )
}

export function Section({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-md border bg-card", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5 pb-1.5">
          {title && <h2 className="text-base font-medium">{title}</h2>}
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
