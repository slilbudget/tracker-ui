// Ad accounts («Кабинеты»), their assignment to buyers by period, the providers who gave them and the provider fee by period.
// Same contract style as client.ts: each function is one backend endpoint.
import type { AdFeePeriod, AdProvider, FbAdAccount, ID } from "./types"
import * as db from "@/mock/seed"
import { canSeeCampaign, viewerAccess, viewerUser } from "@/mock/scope"
import { audit, nextId, wait } from "./mock-util"

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const mask = (t: string) => (t.length > 10 ? `${t.slice(0, 4)}…${t.slice(-4)}` : t ? "…" : "")

// A viewer sees accounts of buyers whose campaigns they see; free accounts only with full scope.
const visible = (a: FbAdAccount) =>
  canSeeCampaign(null) ? true : a.buyer_id != null && db.campaigns.some((c) => c.owner_id === a.buyer_id && canSeeCampaign(c.id))

const log = (summary: string) => audit("ad_accounts", summary)

// «Передача кабинетов» is a per-user permission, not part of the role.
// all: any account (free ones too) to any buyer, and release; team: an account of a buyer of my team to another buyer of my team.
export function transferRule(account: Pick<FbAdAccount, "buyer_id">) {
  const me = viewerUser()
  const team = (id: ID | null) => db.users.find((u) => u.id === id)?.team
  if (me.account_transfer === "all") return { can: true, release: true, team: null as string | null }
  if (me.account_transfer === "team" && account.buyer_id != null && team(account.buyer_id) === me.team) return { can: true, release: false, team: me.team }
  return { can: false, release: false, team: null as string | null }
}
const withFee = (p: AdProvider): AdProvider => ({ ...p, fee: db.providerFeeOn(p.id, ymd(new Date())) })

export const accountsApi = {
  // token masked; proxy is visible only in get() for admins (the UI asks with full = true)
  list: () => wait(db.fbAccounts.filter(visible).map((a) => ({ ...a, api_token: mask(a.api_token), proxy: a.proxy ? "задан" : "" }))),
  // token and proxy in clear only for full access (decided here, not by the caller)
  get: (id: string) => {
    const a = db.fbAccounts.find((x) => x.id === id)
    if (!a || !visible(a)) return wait(null)
    return wait({
      account: viewerAccess("ad_accounts") === "full" ? a : { ...a, api_token: mask(a.api_token), proxy: a.proxy ? "задан" : "" },
      assignments: db.adAssignments.filter((x) => x.account_id === id).sort((x, y) => (x.date_from < y.date_from ? 1 : -1)),
      // fee rows that apply to this account (its provider's and its own), newest first
      fees: db.adFees.filter((f) => f.provider_id === a.provider_id && (f.account_id == null || f.account_id === a.id))
        .sort((x, y) => ((x.date_from ?? "") < (y.date_from ?? "") ? 1 : -1)),
      unattributed: db.unattributed.get(id) ?? [],
      transfer: transferRule(a),
    })
  },
  create: (v: Omit<FbAdAccount, "buyer_id" | "agency" | "agency_fee" | "total_spend" | "spend_diff" | "fb_balance" | "balance_checked_at" | "last_error" | "disabled_at">) => {
    if (db.fbAccounts.some((x) => x.id === v.id)) return Promise.reject(new Error("Кабинет с таким ID уже есть"))
    const a: FbAdAccount = { ...v, buyer_id: null, agency: "", agency_fee: 0, total_spend: 0, spend_diff: 0, fb_balance: 0, balance_checked_at: null, last_error: "", disabled_at: null }
    db.syncAccount(a)
    db.fbAccounts.push(a)
    log(`Добавлен кабинет ${a.name} (${a.id})`)
    return wait(a)
  },
  // Writable fields only. Without full access: the spend comment and the alert threshold.
  // Computed fields (buyer, provider name, fee, spend) are never taken from the client.
  update: (id: string, input: Partial<FbAdAccount>) => {
    const a = db.fbAccounts.find((x) => x.id === id)
    if (!a || !visible(a)) return Promise.reject(new Error("Кабинет не найден"))
    const keys: (keyof FbAdAccount)[] = viewerAccess("ad_accounts") === "full"
      ? ["name", "provider_id", "api_token", "proxy", "active", "currency", "timezone", "handed_at", "spend_offset", "spend_diff_comment", "alert_on_spend_diff", "multi_geo"]
      : ["spend_diff_comment", "alert_on_spend_diff"]
    const patch: Partial<FbAdAccount> = Object.fromEntries(keys.filter((k) => k in input).map((k) => [k, input[k]]))
    if (patch.alert_on_spend_diff != null && patch.alert_on_spend_diff < 0) return Promise.reject(new Error("Порог алерта не может быть отрицательным"))
    if (patch.active === false && a.active) patch.disabled_at = new Date().toISOString()
    if (patch.active === true) patch.disabled_at = null
    Object.assign(a, patch)
    db.syncAccount(a)
    log(`Изменён кабинет ${a.name}`)
    return wait(a)
  },
  // Hand the account to a buyer from a date: the open period closes the day before.
  assign: (q: { account_id: string; buyer_id: ID; date_from: string }) => {
    const a = db.fbAccounts.find((x) => x.id === q.account_id)
    if (!a) return Promise.reject(new Error("Кабинет не найден"))
    const rule = transferRule(a)
    const to = db.users.find((u) => u.id === q.buyer_id)
    if (!rule.can || (rule.team && to?.team !== rule.team)) return Promise.reject(new Error("Нет права передавать этот кабинет этому байеру"))
    // periods never overlap: the new one starts after every closed period
    const lastClosed = db.adAssignments.filter((x) => x.account_id === q.account_id && x.date_to != null).map((x) => x.date_to!).sort().at(-1)
    if (lastClosed && q.date_from <= lastClosed) return Promise.reject(new Error(`Кабинет закреплён до ${lastClosed}: дата должна быть позже`))
    const open = db.adAssignments.find((x) => x.account_id === q.account_id && x.date_to == null)
    if (open) {
      if (q.date_from <= open.date_from) return Promise.reject(new Error(`Дата должна быть позже начала текущего закрепления (${open.date_from})`))
      open.date_to = ymd(new Date(new Date(`${q.date_from}T00:00:00Z`).getTime() - 86400000))
    }
    db.adAssignments.push({ id: nextId(db.adAssignments), ...q, date_to: null })
    db.syncAccount(a)
    log(`Кабинет ${a.name} закреплён за ${to?.login} с ${q.date_from}`)
    return wait({ ok: true })
  },
  // Take the account back (only «all»): the open period ends today, the account becomes free.
  release: (accountId: string) => {
    const a = db.fbAccounts.find((x) => x.id === accountId)
    if (!a || !transferRule(a).release) return Promise.reject(new Error("Нет права освобождать кабинеты"))
    const open = db.adAssignments.find((x) => x.account_id === accountId && x.date_to == null)
    if (open) open.date_to = ymd(new Date())
    db.syncAccount(a)
    log(`Кабинет ${a.name} освобождён`)
    return wait({ ok: true })
  },
  providers: {
    list: () => wait(db.adProviders.map(withFee)),
    // the fee given here is the provider's fee from the start
    create: (v: Omit<AdProvider, "id">) => {
      const p: AdProvider = { ...v, id: nextId(db.adProviders) }
      db.adProviders.push(p)
      db.adFees.push({ id: nextId(db.adFees), provider_id: p.id, account_id: null, fee: v.fee, date_from: null, comment: "", created_by: viewerUser().id })
      return wait(withFee(p))
    },
    // name, group, farm flag; the fee changes only through fees.create
    update: (id: ID, patch: Partial<Omit<AdProvider, "fee">>) => {
      const p = db.adProviders.find((x) => x.id === id)
      if (!p) return Promise.reject(new Error("Провайдер не найден"))
      Object.assign(p, patch)
      for (const a of db.fbAccounts) db.syncAccount(a)
      return wait(withFee(p))
    },
  },
  // Provider fee by period: a new row from a date changes the fee from that day on; earlier spend keeps the old one.
  fees: {
    list: () => wait([...db.adFees].sort((x, y) => ((x.date_from ?? "") < (y.date_from ?? "") ? 1 : -1))),
    create: (v: Omit<AdFeePeriod, "id" | "created_by">) => {
      if (!(v.fee >= 0 && v.fee <= 100)) return Promise.reject(new Error("Комиссия — от 0 до 100%"))
      if (v.account_id && db.fbAccounts.find((a) => a.id === v.account_id)?.provider_id !== v.provider_id)
        return Promise.reject(new Error("Кабинет не от этого провайдера"))
      if (db.adFees.some((f) => f.provider_id === v.provider_id && f.account_id === v.account_id && f.date_from === v.date_from))
        return Promise.reject(new Error("С этой даты комиссия уже задана — удалите старую строку"))
      const row: AdFeePeriod = { ...v, id: nextId(db.adFees), created_by: viewerUser().id }
      db.adFees.push(row)
      for (const a of db.fbAccounts) db.syncAccount(a)
      log(`Комиссия ${db.adProviders.find((p) => p.id === v.provider_id)?.name}${v.account_id ? ` (кабинет ${v.account_id})` : ""}: ${v.fee}% с ${v.date_from ?? "начала"}`)
      return wait(row)
    },
    remove: (id: ID) => {
      const row = db.adFees.find((f) => f.id === id)
      if (!row) return Promise.reject(new Error("Строка не найдена"))
      if (row.date_from == null && row.account_id == null) return Promise.reject(new Error("Базовую комиссию провайдера удалить нельзя — добавьте новую с даты"))
      db.adFees.splice(db.adFees.indexOf(row), 1)
      for (const a of db.fbAccounts) db.syncAccount(a)
      return wait({ ok: true })
    },
  },
}
