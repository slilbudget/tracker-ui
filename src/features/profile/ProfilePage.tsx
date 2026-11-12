// «Профиль»: own account settings, password, theme, 2FA, own API keys.
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { User } from "@/api/types"
import { TIMEZONES } from "@/api/meta"
import { api } from "@/api/client"

import { useUrlParam } from "@/app/state"
import type { ReactNode } from "react"
import { Page, PageHeader } from "@/components/page"
import { ConfirmDialog, CopyButton, FormRow } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiKeysTable } from "@/features/users/UsersPage"

// One frame per page, blocks separated by a thin line.
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="px-3 pt-2.5 pb-1.5 text-base font-medium">{title}</h2>
      {children}
    </section>
  )
}

export default function ProfilePage() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me })
  const [tab, setTab] = useUrlParam("tab", "profile")
  return (
    <Page className="mx-0 max-w-3xl">
      <PageHeader title="Профиль" refresh={false} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="profile">Профиль</TabsTrigger>
          <TabsTrigger value="keys">API-ключи</TabsTrigger>
        </TabsList>
      </Tabs>
      {!me.data ? (
        <Skeleton className="h-64 w-full" />
      ) : tab === "keys" ? (
        <ApiKeysTable userId={me.data.id} canManage />
      ) : (
        <ProfileForm key={me.data.id} me={me.data} />
      )}
    </Page>
  )
}

function ProfileForm({ me }: { me: User }) {
  const qc = useQueryClient()
  const [name, setName] = useState(me.name)
  const [timezone, setTimezone] = useState(me.timezone)
  const [language, setLanguage] = useState<User["language"]>(me.language)
  const [cur, setCur] = useState("")
  const [next, setNext] = useState("")
  const [rep, setRep] = useState("")
  const [err, setErr] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: async () => {
      await api.users.update(me.id, { name: name.trim(), timezone, language })
      if (next) await api.system.profile.changePassword(cur, next)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      qc.invalidateQueries({ queryKey: ["me"] })
      toast.success(next ? "Профиль сохранён, пароль изменён" : "Профиль сохранён")
      setCur(""); setNext(""); setRep("")
    },
  })

  const submit = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = "Введите имя"
    if (next || rep || cur) {
      if (!cur) e.cur = "Введите текущий пароль"
      if (next.length < 8) e.next = "Минимум 8 символов"
      if (next !== rep) e.rep = "Пароли не совпадают"
    }
    setErr(e)
    if (Object.keys(e).length) return
    save.mutate()
  }

  return (
    <div className="flex flex-col divide-y rounded-md border bg-card">
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col divide-y">
        <Section title="Основное">
          <div className="px-3 py-1">
            <FormRow label="Логин"><Input value={me.login} readOnly disabled className="w-full" /></FormRow>
            <FormRow label="Имя" error={err.name} htmlFor="p-name">
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err.name} />
            </FormRow>
            <FormRow label="Часовой пояс" hint="Отчёты пока в Europe/London: смена пояса на них не влияет.">
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </FormRow>
            <FormRow label="Язык">
              <Select value={language} onValueChange={(v) => setLanguage(v as User["language"])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ru">Русский</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </FormRow>
          </div>
        </Section>

        <Section title="Смена пароля">
          <div className="px-3 py-1">
            <FormRow label="Текущий пароль" error={err.cur} htmlFor="p-cur">
              <Input id="p-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} aria-invalid={!!err.cur} />
            </FormRow>
            <FormRow label="Новый пароль" error={err.next} htmlFor="p-new" hint="Оставьте пустым, чтобы не менять.">
              <Input id="p-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={!!err.next} />
            </FormRow>
            <FormRow label="Повторите пароль" error={err.rep} htmlFor="p-rep">
              <Input id="p-rep" type="password" autoComplete="new-password" value={rep} onChange={(e) => setRep(e.target.value)} aria-invalid={!!err.rep} />
            </FormRow>
            <div className="py-2 sm:pl-[196px]">
              <Button type="submit" disabled={save.isPending}>Сохранить профиль</Button>
            </div>
          </div>
        </Section>
      </form>

      <TwoFactor me={me} />
    </div>
  )
}

function TwoFactor({ me }: { me: User }) {
  const qc = useQueryClient()
  const [setup, setSetup] = useState(false)
  const [code, setCode] = useState("")
  const [confirmOff, setConfirmOff] = useState(false)
  const secret = useQuery({ queryKey: ["2fa-secret"], queryFn: api.system.profile.twoFactorSetup, enabled: setup })

  const toggle = useMutation({
    mutationFn: (on: boolean) => api.system.profile.setTwoFactor(me.id, on, code),
    onSuccess: (_, on) => {
      qc.invalidateQueries({ queryKey: ["me"] })
      qc.invalidateQueries({ queryKey: ["users"] })
      setSetup(false); setCode("")
      toast.success(on ? "2FA включена" : "2FA отключена")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Section title="Двухфакторная защита (2FA)">
      <div className="flex flex-col gap-3 px-3 py-3">
        <div className="flex items-center gap-3">
          <Switch
            id="p-2fa"
            checked={me.two_factor || setup}
            onCheckedChange={(v) => (v ? setSetup(true) : me.two_factor ? setConfirmOff(true) : setSetup(false))}
          />
          <Label htmlFor="p-2fa">
            {me.two_factor ? "Включена: при входе нужен код из приложения" : "Выключена: вход только по паролю"}
          </Label>
        </div>
        {setup && !me.two_factor && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex size-40 shrink-0 items-center justify-center border border-dashed p-2 text-center text-xs text-muted-foreground">
              Здесь будет QR-код для приложения-аутентификатора
            </div>
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <p>1. Откройте Google Authenticator, 1Password или аналог и отсканируйте QR-код. Или введите ключ вручную:</p>
              <div className="flex items-center gap-2">
                <code className="rounded-md border bg-muted px-2 py-1 font-mono">{secret.data?.secret ?? "…"}</code>
                {secret.data && <CopyButton value={secret.data.secret.replace(/\s/g, "")} />}
              </div>
              <p>2. Введите 6-значный код из приложения:</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input className="w-28 font-mono" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Код из приложения" />
                <Button type="button" disabled={toggle.isPending} onClick={() => toggle.mutate(true)}>Подтвердить и включить</Button>
                <Button type="button" variant="outline" onClick={() => { setSetup(false); setCode("") }}>Отмена</Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title="Отключить 2FA"
        description="Вход будет защищён только паролем. Включить 2FA можно снова в любой момент."
        confirmLabel="Отключить"
        destructive
        onConfirm={() => { toggle.mutate(false); setConfirmOff(false) }}
      />
    </Section>
  )
}
