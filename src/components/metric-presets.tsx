import { METRICS, METRIC_PRESETS } from "@/api/meta"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// The column sets of the «Колонки» menus (Основные / Воронка / Финансы), as one row of buttons.
export function PresetButtons({ value, hidden, onPick, chart, small }: { value: string[]; hidden: string[]; onPick: (keys: string[]) => void; chart?: boolean; small?: boolean }) {
  const order = (keys: string[]) => METRICS.map((x) => x.key).filter((k) => keys.includes(k) && !hidden.includes(k))
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((k) => b.includes(k))
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Наборы метрик">
      {METRIC_PRESETS.map((p) => {
        const keys = order(chart ? p.chart : p.keys)
        return (
          <Button key={p.name} type="button" variant="ghost" size={small ? "sm" : "default"} title={p.hint} className={cn(same(keys, value) && "bg-accent text-accent-foreground")} onClick={() => onPick(keys)}>
            {p.name}
          </Button>
        )
      })}
    </div>
  )
}

