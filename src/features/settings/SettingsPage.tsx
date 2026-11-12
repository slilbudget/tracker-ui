// «Настройки»: main, postbacks, retention, bots. Save bar appears only when something changed.
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { PlusIcon, XIcon } from "lucide-react"
import { CURRENCIES, TIMEZONES } from "@/api/meta"
import { api } from "@/api/client"
import { type SystemSettings } from "@/api/client-system"
import type { Settings } from "@/api/types"
import { useAccess } from "@/app/state"
import type { ReactNode } from "react"
import { Page, PageHeader } from "@/components/page"
import { CopyButton, FormRow } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ApproachesSection } from "./ApproachesSection"

interface AliasRow { param: string; list: string }
interface Form {
  base: Settings
  sys: SystemSettings
  aliases: AliasRow[]
}

// One frame per page, blocks separated by a thin line.
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="px-3 pt-2.5 pb-1.5 text-base font-medium">{title}</h2>
      {children}
    </section>
  )
}

const toRows = (a: Record<string, string[]>): AliasRow[] => Object.entries(a).map(([param, l]) => ({ param, list: l.join(", ") }))
const splitList = (s: string) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean)
const fromRows = (rows: AliasRow[]) =>
  Object.fromEntries(rows.filter((r) => r.param.trim()).map((r) => [r.param.trim(), splitList(r.list)])) as Record<string, string[]>

export default function SettingsPage() {
  const base = useQuery({ queryKey: ["settings"], queryFn: api.settings.get })
  const sys = useQuery({ queryKey: ["settings", "system"], queryFn: api.system.settings.get })
  const ready = base.data && sys.data
  return (
    <Page className="mx-0 max-w-3xl">
      <PageHeader title="Настройки" refresh={false} />
      {ready ? (
        <>
          <SettingsForm key={JSON.stringify([base.data, sys.data])} initial={{ base: base.data!, sys: sys.data!, aliases: toRows(base.data!.global_aliases) }} />
          <ApproachesSection />
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      )}
    </Page>
  )
}

function SettingsForm({ initial }: { initial: Form }) {
  const qc = useQueryClient()
  const { canEdit } = useAccess("settings")
  const [form, setForm] = useState<Form>(initial)
  const [err, setErr] = useState<Record<string, string>>({})
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial])

  const setBase = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, base: { ...f.base, [k]: v } }))
  const setSys = <K extends keyof SystemSettings>(k: K, v: SystemSettings[K]) => setForm((f) => ({ ...f, sys: { ...f.sys, [k]: v } }))
  const setAlias = (i: number, patch: Partial<AliasRow>) => setForm((f) => ({ ...f, aliases: f.aliases.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))

  const save = useMutation({
    mutationFn: async () => {
      await api.settings.update({ ...form.base, global_aliases: fromRows(form.aliases) })
      await api.system.settings.update(form.sys)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] })
      toast.success("Настройки сохранены")
    },
  })

  const submit = () => {
    const e: Record<string, string> = {}
    const s2s = form.base.s2s_timeout_sec
    if (!(s2s >= 1 && s2s <= 60)) e.s2s = "От 1 до 60 секунд"
    if (!(form.base.statistics_retention_days >= 0 && form.base.statistics_retention_days <= 3560)) e.stat = "От 0 до 3560 дней, 0 = не чистить"
    if (!(form.base.archive_retention_days >= 1 && form.base.archive_retention_days <= 3560)) e.arch = "От 1 до 3560 дней"
    const names = form.aliases.map((r) => r.param.trim()).filter(Boolean)
    if (new Set(names).size !== names.length) e.aliases = "Параметр указан дважды"
    const bad = form.sys.extra_bot_ips.split(/\s+/).filter(Boolean).find((x) => !/^[\d.:a-f]+(\/\d{1,3})?$/i.test(x))
    if (bad) e.ips = `Не похоже на IP или CIDR: ${bad}`
    setErr(e)
    if (Object.keys(e).length) return
    save.mutate()
  }
  const num = (v: string) => (v === "" ? NaN : Number(v))

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-3">
      <fieldset disabled={!canEdit} className="flex min-w-0 flex-col divide-y rounded-md border bg-card">
        <Section title="Основные">
          <div className="px-3 py-1">
            <FormRow label="Валюта" hint="Смена валюты не пересчитывает уже собранные данные. В прототипе суммы всегда показываются в $.">
              <Select value={form.base.currency} onValueChange={(v) => setBase("currency", v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </FormRow>
            <FormRow label="Часовой пояс по умолчанию" hint="Для новых пользователей. Отчёты пока считаются в Europe/London.">
              <Select value={form.base.timezone} onValueChange={(v) => setBase("timezone", v)}>
                <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
                <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </FormRow>
          </div>
        </Section>

        <Section title="Постбеки">
          <div className="px-3 py-1">
            <FormRow label="Ключ постбека" hint="Часть URL входящего постбека. Меняется только в конфиге сервера, чтобы не сломать подключённые партнёрки.">
              <div className="flex items-center gap-2">
                <Input readOnly value={form.base.postback_key} className="w-40 font-mono" aria-label="Ключ постбека" />
                <CopyButton value={form.base.postback_key} />
              </div>
            </FormRow>
            <FormRow label="Таймаут S2S, сек" error={err.s2s} hint="Сколько ждать ответа пикселя или вебхука, прежде чем считать отправку неудачной.">
              <Input
                type="number" min={1} max={60} className="w-24" value={Number.isNaN(form.base.s2s_timeout_sec) ? "" : form.base.s2s_timeout_sec}
                onChange={(e) => setBase("s2s_timeout_sec", num(e.target.value))} aria-invalid={!!err.s2s}
              />
            </FormRow>
            <FormRow label="Алиасы параметров" error={err.aliases} hint="Какие имена параметров трекер считает одним и тем же. Например, партнёрка шлёт clickid вместо subid.">
              <div className="flex flex-col gap-1.5">
                {form.aliases.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input className="w-32 shrink-0 font-mono sm:w-40" placeholder="параметр" aria-label="Параметр" value={r.param} onChange={(e) => setAlias(i, { param: e.target.value })} />
                    <span className="text-muted-foreground">→</span>
                    <Input className="min-w-0 flex-1 font-mono" placeholder="alias1, alias2" aria-label="Алиасы через запятую" value={r.list} onChange={(e) => setAlias(i, { list: e.target.value })} />
                    {canEdit && (
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Убрать строку" onClick={() => setForm((f) => ({ ...f, aliases: f.aliases.filter((_, j) => j !== i) }))}>
                        <Icon icon={XIcon} size={14} />
                      </Button>
                    )}
                  </div>
                ))}
                {form.aliases.length === 0 && <span className="text-xs text-muted-foreground">Алиасов нет</span>}
                {canEdit && (
                  <div>
                    <Button type="button" variant="outline" onClick={() => setForm((f) => ({ ...f, aliases: [...f.aliases, { param: "", list: "" }] }))}>
                      <Icon icon={PlusIcon} size={14} /> Добавить параметр
                    </Button>
                  </div>
                )}
              </div>
            </FormRow>
          </div>
        </Section>

        <Section title="Хранение">
          <div className="px-3 py-1">
            <FormRow label="Хранить статистику, дней" error={err.stat} hint="Клики и конверсии старше удаляются. 0 — не удалять.">
              <Input type="number" min={0} className="w-28" value={Number.isNaN(form.base.statistics_retention_days) ? "" : form.base.statistics_retention_days} onChange={(e) => setBase("statistics_retention_days", num(e.target.value))} aria-invalid={!!err.stat} />
            </FormRow>
            <FormRow label="Хранить архив, дней" error={err.arch} hint="Через столько дней удалённые сущности стираются из архива окончательно.">
              <Input type="number" min={1} className="w-28" value={Number.isNaN(form.base.archive_retention_days) ? "" : form.base.archive_retention_days} onChange={(e) => setBase("archive_retention_days", num(e.target.value))} aria-invalid={!!err.arch} />
            </FormRow>
          </div>
        </Section>

        <Section title="Боты">
          <div className="px-3 py-1">
            <FormRow label="Список IP ботов" hint="Клики с этих адресов помечаются как боты.">
              <Switch checked={form.sys.bot_ip_list} onCheckedChange={(v) => setSys("bot_ip_list", v)} />
            </FormRow>
            <FormRow label="Пустой User-Agent = бот">
              <Switch checked={form.sys.empty_ua_is_bot} onCheckedChange={(v) => setSys("empty_ua_is_bot", v)} />
            </FormRow>
            <FormRow label="Дополнительные IP" error={err.ips} hint="IP или подсети CIDR через пробел или с новой строки.">
              <Textarea rows={4} className="font-mono" placeholder="203.0.113.0/24 198.51.100.7" value={form.sys.extra_bot_ips} onChange={(e) => setSys("extra_bot_ips", e.target.value)} aria-invalid={!!err.ips} />
            </FormRow>
          </div>
        </Section>
      </fieldset>

      {canEdit && dirty && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background px-4 py-2 md:-mx-6 md:px-6">
          <span className="text-xs text-muted-foreground">Есть несохранённые изменения</span>
          <Button type="button" variant="outline" className="ml-auto" onClick={() => { setForm(initial); setErr({}) }}>Отменить</Button>
          <Button type="submit" disabled={save.isPending}>Сохранить</Button>
        </div>
      )}
    </form>
  )
}
