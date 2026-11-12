// Settings → «Подходы и нейминг объявлений»: the shared approaches directory and the ad naming template
// whose {подход} token takes the approach code. Saved per row, outside the main settings form.
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { XIcon } from "lucide-react"
import type { Approach } from "@/api/types"
import { api } from "@/api/client"
import { NAMING_EXAMPLE, namingExample } from "@/api/client-directory"
import { FormRow } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DevNote } from "@/features/devnotes/notes"
import { useAccess } from "@/app/state"

export function ApproachesSection() {
  const qc = useQueryClient()
  const { canEdit } = useAccess("settings")
  const list = useQuery({ queryKey: ["approaches"], queryFn: api.approaches.list })
  const users = useQuery({ queryKey: ["users"], queryFn: api.users.list })
  const naming = useQuery({ queryKey: ["adNaming"], queryFn: api.adNaming.get })
  const [tpl, setTpl] = useState<string | null>(null)
  const template = tpl ?? naming.data?.template ?? ""
  const saveTpl = useMutation({
    mutationFn: () => api.adNaming.update(template.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["adNaming"] }); setTpl(null); toast.success("Шаблон нейминга сохранён") },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.approaches.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["approaches"] }); toast.success("Подход удалён") },
    onError: (e: Error) => toast.error(e.message),
  })
  const tplError = template && !template.includes("{подход}") ? "В шаблоне нет {подход}: трекер не сможет понять подход по названию объявления" : ""

  return (
    <section className="mt-6 rounded-md border">
      <h2 className="px-3 pt-2.5 pb-1.5 text-base font-medium">Подходы и нейминг объявлений</h2>
      <div className="px-3">
        <FormRow
          label="Нейминг объявлений" htmlFor="ad-naming" error={tplError}
          hint={<>Части через «-». Доступно: {[...Object.keys(NAMING_EXAMPLE), "{подход}"].map((t) => <code key={t} className="mr-1 font-mono">{t}</code>)}<br />Пример: <span className="font-mono">{namingExample(template, list.data?.[0]?.code ?? "NEURO")}</span></>}
        >
          <div className="flex gap-2">
            <Input id="ad-naming" className="font-mono" disabled={!canEdit} value={template} onChange={(e) => setTpl(e.target.value)} />
            <Button type="button" variant="outline" disabled={!canEdit || tpl == null || !!tplError || saveTpl.isPending} onClick={() => saveTpl.mutate()}>Сохранить</Button>
          </div>
        </FormRow>
      </div>
      <div className="overflow-x-auto border-t">
        <table className="w-full text-sm">
          <thead className="text-[13px] text-muted-foreground">
            <tr className="border-b">
              <th className="h-9 px-3 text-left font-medium">Название</th>
              <th className="h-9 px-3 text-left font-medium">Код в нейминге</th>
              <th className="h-9 px-3 text-left font-medium">Описание</th>
              <th className="h-9 px-3 text-left font-medium">Добавил</th>
              <th className="h-9 w-10" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((a) => (
              <ApproachRow key={`${a.id}|${a.name}|${a.code}|${a.description}`} a={a} canEdit={canEdit} by={users.data?.find((u) => u.id === a.created_by)?.login ?? "—"} onRemove={() => remove.mutate(a.id)} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-xs text-muted-foreground">Новые подходы байеры добавляют при создании кампании («Новый» рядом с полем «Подход»). Переименование меняет подход во всех кампаниях.</p>
      <div className="px-3 pb-3"><DevNote id="approaches" /></div>
    </section>
  )
}

function ApproachRow({ a, by, canEdit, onRemove }: { a: Approach; by: string; canEdit: boolean; onRemove: () => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState({ name: a.name, code: a.code, description: a.description })
  const dirty = v.name !== a.name || v.code !== a.code || v.description !== a.description
  const save = useMutation({
    mutationFn: () => api.approaches.update(a.id, v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["approaches"] }); qc.invalidateQueries({ queryKey: ["campaigns"] }); toast.success("Подход сохранён") },
    onError: (e: Error) => toast.error(e.message),
  })
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-3 py-1.5"><Input disabled={!canEdit} className="min-w-28" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-label="Название подхода" /></td>
      <td className="px-3 py-1.5"><Input disabled={!canEdit} className="min-w-24 font-mono" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} aria-label="Код подхода" /></td>
      <td className="px-3 py-1.5"><Input disabled={!canEdit} className="min-w-48" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} aria-label="Описание подхода" /></td>
      <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{by}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        {!canEdit ? null : dirty
          ? <Button type="button" size="sm" disabled={!v.name.trim() || !v.code.trim() || save.isPending} onClick={() => save.mutate()}>Сохранить</Button>
          : <Button type="button" variant="ghost" size="icon-sm" aria-label={`Удалить подход ${a.name}`} onClick={onRemove}><Icon icon={XIcon} size={14} /></Button>}
      </td>
    </tr>
  )
}
