// «Обновить расходы» for one campaign (as in Keitaro): a sum for a period replaces the cost of its clicks and is spread
// evenly over them; optional filters by ad account (sub_id_1) and ad id (sub_id_6). The spend collector uses the same API.
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { DateRange } from "@/api/types"
import { api } from "@/api/client"
import { useApp } from "@/app/state"
import { EntitySheet, FormRow } from "@/components/common"
import { PeriodSelect } from "@/components/period-select"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fmtMoney } from "@/lib/format"

export function CostsSheet({ campaign, onClose }: { campaign: { id: number; name: string } | null; onClose: () => void }) {
  const { timezone } = useApp()
  const qc = useQueryClient()
  const [period, setPeriod] = useState<Pick<DateRange, "interval" | "from" | "to">>({ interval: "yesterday" })
  const [cost, setCost] = useState("")
  const [unique, setUnique] = useState("all")
  const [account, setAccount] = useState("")
  const [ad, setAd] = useState("")
  const [err, setErr] = useState("")
  const save = useMutation({
    mutationFn: (v: number) =>
      api.campaigns.updateCosts({
        campaign_id: campaign!.id, range: { ...period, timezone }, cost: v, unique_only: unique === "unique",
        sub_id_1: account.trim() || undefined, sub_id_6: ad.trim() || undefined,
      }),
    onSuccess: (r, v) => {
      if (!r.clicks) {
        toast.error("За этот период нет кликов по фильтру: расход некуда записать")
        return
      }
      qc.invalidateQueries()
      toast.success(`Расход ${fmtMoney(v)} распределён по кликам: ${r.clicks}`)
      onClose()
    },
  })
  const submit = () => {
    const v = Number(cost.replace(",", "."))
    if (!cost.trim() || !Number.isFinite(v) || v < 0) return setErr("Введите сумму, например 125,50")
    setErr("")
    save.mutate(v)
  }
  return (
    <EntitySheet
      open={!!campaign}
      onOpenChange={(v) => !v && onClose()}
      title="Обновить расходы"
      description={campaign?.name}
      onSubmit={submit}
      submitLabel="Обновить"
      submitting={save.isPending}
    >
      <p className="pb-2 text-sm text-muted-foreground">
        Сумма заменит расход кликов за период и разделится между ними поровну. Обычно расходы приходят сами через API, вручную — для исправлений.
      </p>
      <FormRow label="Период">
        <div><PeriodSelect value={{ ...period, timezone }} onChange={setPeriod} /></div>
      </FormRow>
      <FormRow label="Расход, $" error={err} htmlFor="c-cost">
        <Input id="c-cost" inputMode="decimal" className="w-40" value={cost} onChange={(e) => setCost(e.target.value)} aria-invalid={!!err} />
      </FormRow>
      <FormRow label="Делить между">
        <Select value={unique} onValueChange={setUnique}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всеми кликами</SelectItem>
            <SelectItem value="unique">Только уникальными кликами</SelectItem>
          </SelectContent>
        </Select>
      </FormRow>
      <FormRow label="Рекламный кабинет" hint="sub_id_1. Пусто — все кабинеты" htmlFor="c-acc">
        <Input id="c-acc" className="font-mono" value={account} onChange={(e) => setAccount(e.target.value)} />
      </FormRow>
      <FormRow label="ID объявления" hint="sub_id_6. Пусто — все объявления" htmlFor="c-ad">
        <Input id="c-ad" className="font-mono" value={ad} onChange={(e) => setAd(e.target.value)} />
      </FormRow>
    </EntitySheet>
  )
}
