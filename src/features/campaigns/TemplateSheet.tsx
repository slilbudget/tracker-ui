// «Применить к кампаниям»: copies the streams of a reference campaign into the campaigns linked to it.
// Shows per campaign what changes (streams matched by name), the user unticks campaigns to skip.
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { Campaign } from "@/api/types"
import { api } from "@/api/client"
import { EntitySheet } from "@/components/common"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export function TemplateSheet({ template, open, onClose }: { template: Campaign; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [skip, setSkip] = useState<Set<number>>(new Set())
  const [keepWeights, setKeepWeights] = useState(true)
  const diff = useQuery({ queryKey: ["templateDiff", template.id], queryFn: () => api.campaigns.templateDiff(template.id), enabled: open })
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })
  const rows = diff.data ?? []
  const changes = (r: (typeof rows)[number]) => r.added.length + r.removed.length + r.changed.length
  const chosen = rows.filter((r) => !skip.has(r.campaign_id) && changes(r) > 0)

  const apply = useMutation({
    mutationFn: () => api.campaigns.applyTemplate(template.id, chosen.map((r) => r.campaign_id), keepWeights),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["streams"] })
      qc.invalidateQueries({ queryKey: ["templateDiff"] })
      qc.invalidateQueries({ queryKey: ["campaigns"] })
      toast.success(`Эталон применён к кампаниям: ${res.campaigns}`)
      setSkip(new Set())
      onClose()
    },
  })

  return (
    <EntitySheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      wide
      title="Применить эталон к кампаниям"
      description={`Потоки кампаний станут такими же, как в «${template.name}». Потоки сравниваются по названию.`}
      onSubmit={() => chosen.length && apply.mutate()}
      submitLabel={chosen.length ? `Применить к ${chosen.length}` : "Нечего применять"}
      submitting={apply.isPending || !chosen.length}
    >
      <label className="flex items-start gap-2 pb-3 text-sm">
        <Checkbox className="mt-0.5" checked={keepWeights} onCheckedChange={(v) => setKeepWeights(!!v)} />
        <span>
          Оставить веса потоков кампаний
          <span className="block text-xs text-muted-foreground">Байер мог перекинуть вес под себя: у потоков с тем же названием вес не изменится</span>
        </span>
      </label>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{diff.isLoading ? "Считаю…" : "К эталону не привязана ни одна кампания. Привяжите в настройках кампании или создайте кампанию по эталону."}</p>
      ) : (
        <ul className="rounded-md border">
          {rows.map((r) => {
            const n = changes(r)
            const name = campaigns.data?.find((c) => c.id === r.campaign_id)?.name ?? `#${r.campaign_id}`
            return (
              <li key={r.campaign_id} className={cn("flex items-start gap-3 border-b px-3 py-2 last:border-b-0", !n && "text-muted-foreground")}>
                <Checkbox
                  className="mt-0.5"
                  aria-label={name}
                  disabled={!n}
                  checked={n > 0 && !skip.has(r.campaign_id)}
                  onCheckedChange={(v) => setSkip((s) => { const x = new Set(s); if (v) x.delete(r.campaign_id); else x.add(r.campaign_id); return x })}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <a href={`#/campaigns/${r.campaign_id}`} className="truncate text-sm text-link">{name}</a>
                  {n === 0 ? (
                    <span className="text-xs">Уже как эталон</span>
                  ) : (
                    <span className="flex flex-col text-xs text-muted-foreground">
                      {r.added.length > 0 && <span title={r.added.join("\n")}>Добавятся: {list(r.added)}</span>}
                      {r.changed.length > 0 && <span title={r.changed.join("\n")}>Изменятся: {list(r.changed)}</span>}
                      {r.removed.length > 0 && <span className="text-warning" title={r.removed.join("\n")}>Уйдут в архив: {list(r.removed)}</span>}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </EntitySheet>
  )
}

const list = (xs: string[]) => (xs.length > 2 ? `${xs.slice(0, 2).join(", ")} и ещё ${xs.length - 2}` : xs.join(", "))
