// Ad accounts («Кабинеты»), their assignment to buyers by period and the providers who gave them.
// Same contract style as client.ts: each function is one backend endpoint.
import type { AdAccountAssignment, AdProvider, FbAdAccount, ID } from "./types"
import * as db from "@/mock/seed"
import { canSeeCampaign } from "@/mock/scope"

const wait = <T,>(v: T, ms = 30): Promise<T> => new Promise((res) => setTimeout(() => res(structuredClone(v)), ms))
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const mask = (t: string) => (t.length > 10 ? `${t.slice(0, 4)}…${t.slice(-4)}` : t ? "…" : "")

// A viewer sees accounts of buyers whose campaigns they see; free accounts only with full scope.
const visible = (a: FbAdAccount) =>
  canSeeCampaign(null) ? true : a.buyer_id != null && db.campaigns.some((c) => c.owner_id === a.buyer_id && canSeeCampaign(c.id))

function log(summary: string) {
  db.audit.unshift({ id: Math.max(0, ...db.audit.map((x) => x.id)) + 1, datetime: new Date().toISOString(), user_id: db.CURRENT_USER_ID, action: "update", resource: "ad_accounts", resource_id: null, summary, ip: "127.0.0.1" })
}

export const accountsApi = {
  // token masked; proxy is visible only in get() for admins (the UI asks with full = true)
  list: () => wait(db.fbAccounts.filter(visible).map((a) => ({ ...a, api_token: mask(a.api_token), proxy: a.proxy ? "задан" : "" }))),
  get: (id: string, full: boolean) => {
    const a = db.fbAccounts.find((x) => x.id === id)
    if (!a || !visible(a)) return wait(null)
    return wait({
      account: full ? a : { ...a, api_token: mask(a.api_token), proxy: a.proxy ? "задан" : "" },
      assignments: db.adAssignments.filter((x) => x.account_id === id).sort((x, y) => (x.date_from < y.date_from ? 1 : -1)),
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
  update: (id: string, patch: Partial<FbAdAccount>) => {
    const a = db.fbAccounts.find((x) => x.id === id)
    if (!a) return Promise.reject(new Error("Кабинет не найден"))
    if (patch.active === false && a.active) patch.disabled_at = new Date().toISOString()
    if (patch.active === true) patch.disabled_at = null
    Object.assign(a, patch)
    db.syncAccount(a)
    log(`Изменён кабинет ${a.name}`)
    return wait(a)
  },
  // Hand the account to a buyer from a date: the open period closes the day before.
  assign: (q: { account_id: string; buyer_id: ID; provider_id: ID | null; provider_fee: number | null; date_from: string }) => {
    const a = db.fbAccounts.find((x) => x.id === q.account_id)
    if (!a) return Promise.reject(new Error("Кабинет не найден"))
    const open = db.adAssignments.find((x) => x.account_id === q.account_id && x.date_to == null)
    if (open) {
      if (q.date_from <= open.date_from) return Promise.reject(new Error(`Дата должна быть позже начала текущего закрепления (${open.date_from})`))
      open.date_to = ymd(new Date(new Date(`${q.date_from}T00:00:00Z`).getTime() - 86400000))
    }
    const row: AdAccountAssignment = { id: Math.max(0, ...db.adAssignments.map((x) => x.id)) + 1, ...q, date_to: null }
    db.adAssignments.push(row)
    db.syncAccount(a)
    log(`Кабинет ${a.name} закреплён за ${db.users.find((u) => u.id === q.buyer_id)?.login} с ${q.date_from}`)
    return wait(row)
  },
  // Take the account back: the open period ends today, the account becomes free.
  release: (accountId: string) => {
    const open = db.adAssignments.find((x) => x.account_id === accountId && x.date_to == null)
    if (open) open.date_to = ymd(new Date())
    const a = db.fbAccounts.find((x) => x.id === accountId)
    if (a) db.syncAccount(a)
    return wait({ ok: true })
  },
  providers: {
    list: () => wait(db.adProviders),
    create: (v: Omit<AdProvider, "id">) => {
      const p = { ...v, id: Math.max(0, ...db.adProviders.map((x) => x.id)) + 1 }
      db.adProviders.push(p)
      return wait(p)
    },
    update: (id: ID, patch: Partial<AdProvider>) => {
      const p = db.adProviders.find((x) => x.id === id)
      if (!p) return Promise.reject(new Error("Провайдер не найден"))
      Object.assign(p, patch)
      for (const a of db.fbAccounts) db.syncAccount(a)
      return wait(p)
    },
  },
}
