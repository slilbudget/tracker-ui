// Extra mock endpoints of the system sections (users, integrations, settings, archive, profile).
// Same contract style as client.ts: every function = one backend endpoint, bodies over the seed.
import type { ConversionStatus, ID, Integration, PostbackLogEntry, User } from "./types"
import * as db from "@/mock/seed"

const LATENCY = 30
const wait = <T,>(v: T): Promise<T> => new Promise((res) => setTimeout(() => res(structuredClone(v)), LATENCY))
const nextId = (xs: { id: number }[]) => Math.max(0, ...xs.map((x) => x.id)) + 1
const now = () => new Date().toISOString()
const rand = (n: number) => Array.from({ length: n }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)]).join("")

// ---------- settings: fields the base Settings type does not carry ----------

export interface SystemSettings {
  bot_ip_list: boolean
  empty_ua_is_bot: boolean
  extra_bot_ips: string // IP / CIDR separated by space or newline
}
const systemSettings: SystemSettings = { bot_ip_list: true, empty_ua_is_bot: true, extra_bot_ips: "" }

// ---------- integrations: secrets and per-kind fields ----------

interface IntegrationExtra {
  token: string
  account: string // Cloudflare account / TikTok advertiser
  proxy_enabled: boolean
  proxy_protocol: "http" | "https" | "socks5"
  proxy_address: string
  proxy_port: string
  proxy_login: string
  proxy_password: string
  send_statuses: ConversionStatus[]
}
export type IntegrationFull = Integration & IntegrationExtra
export const EMPTY_EXTRA: IntegrationExtra = {
  token: "", account: "", proxy_enabled: false, proxy_protocol: "http", proxy_address: "", proxy_port: "", proxy_login: "",
  proxy_password: "", send_statuses: ["sale"],
}
const extras: Record<ID, Partial<IntegrationExtra>> = {
  1: { token: "EAAGm0PX4ZCpsBO-demo-token-1" },
  2: { token: "EAAGm0PX4ZCpsBO-demo-token-2", proxy_enabled: true, proxy_address: "proxy.example.net", proxy_port: "8080" },
  3: { token: "EAAGm0PX4ZCpsBO-demo-capi-token", send_statuses: ["lead", "sale"] },
  4: { token: "cf-demo-token", account: "team@example.com" },
}

// ---------- archive ----------

export type ArchiveEntity = "campaigns" | "streams" | "landings" | "offers" | "affiliateNetworks" | "trafficSources" | "domains"
const tables: Record<ArchiveEntity, { id: ID; state?: string }[]> = {
  campaigns: db.campaigns, streams: db.streams, landings: db.landings, offers: db.offers,
  affiliateNetworks: db.affiliateNetworks, trafficSources: db.trafficSources, domains: db.domains as unknown as { id: ID; state?: string }[],
}

// ---------- postbacks: retry of a failed outgoing postback ----------

export interface RetryResult {
  id: ID
  ok: boolean
  http_code: number
  result: PostbackLogEntry["result"]
  attempts: number
}
let retryCalls = 0

export const systemApi = {
  postbacks: {
    // Mock: every 3rd retry fails again (HTTP 400), so the "retry did not help" scenario can be tested.
    retry: (id: ID) => {
      const p = db.postbackLog.find((x) => x.id === id)
      if (!p) return Promise.reject(new Error("Постбек не найден"))
      retryCalls += 1
      const ok = retryCalls % 3 !== 0
      p.attempts += 1
      if (ok) Object.assign(p, { result: "ok", http_code: 200, message: "" })
      else Object.assign(p, {
        result: p.attempts >= 5 ? "error" : "retrying", http_code: 400,
        message: p.message || "Invalid OAuth access token — токен пикселя истёк",
      })
      return wait<RetryResult>({ id, ok, http_code: p.http_code ?? 0, result: p.result, attempts: p.attempts })
    },
  },
  settings: {
    get: () => wait(systemSettings),
    update: (patch: Partial<SystemSettings>) => wait(Object.assign(systemSettings, patch)),
  },
  integrations: {
    // base integration + secrets in one object (the sheet edits both)
    get: (id: ID) => {
      const base = db.integrations.find((i) => i.id === id)
      return base ? wait({ ...EMPTY_EXTRA, ...extras[id], ...base } as IntegrationFull) : Promise.reject(new Error("Не найдено"))
    },
    list: () => wait(db.integrations.filter((i) => (i.state as string) !== "deleted")),
    save: (v: Partial<IntegrationFull> & Pick<IntegrationFull, "kind" | "name">) => {
      const { token, account, proxy_enabled, proxy_protocol, proxy_address, proxy_port, proxy_login, proxy_password, send_statuses, ...base } = v
      const extra = { token, account, proxy_enabled, proxy_protocol, proxy_address, proxy_port, proxy_login, proxy_password, send_statuses }
      let id = v.id
      if (id) {
        const x = db.integrations.find((i) => i.id === id)
        if (x) Object.assign(x, base)
      } else {
        id = nextId(db.integrations)
        db.integrations.push({
          id, state: "active", campaign_ids: [], ad_account_id: "", pixel_id: "", update_every_min: 30,
          last_sync_at: null, last_error: "", ...base,
        } as Integration)
      }
      extras[id] = { ...extras[id], ...extra }
      return wait({ id })
    },
    setState: (id: ID, state: "active" | "paused") => {
      const x = db.integrations.find((i) => i.id === id)
      if (x) Object.assign(x, { state, ...(state === "active" ? { last_error: "" } : {}) })
      return wait({ ok: true })
    },
    sync: (id: ID) => {
      const x = db.integrations.find((i) => i.id === id)
      if (!x) return Promise.reject(new Error("Не найдено"))
      if (x.state === "paused") return Promise.reject(new Error("Интеграция на паузе. Возобновите её и повторите."))
      if (x.state === "error") return Promise.reject(new Error(x.last_error || "Ошибка синхронизации"))
      x.last_sync_at = now()
      return wait({ ok: true })
    },
    remove: (id: ID) => {
      const i = db.integrations.findIndex((x) => x.id === id)
      if (i >= 0) db.integrations.splice(i, 1)
      delete extras[id]
      return wait({ ok: true })
    },
  },
  users: {
    resetPassword: (id: ID) => {
      void id
      return wait({ password: `${rand(4)}-${rand(4)}-${rand(4)}` })
    },
    reset2fa: (id: ID) => {
      const u = db.users.find((x) => x.id === id)
      if (u) u.two_factor = false
      return wait({ ok: true })
    },
  },
  profile: {
    changePassword: (_current: string, _next: string) => wait({ ok: true }),
    twoFactorSetup: () => wait({ secret: "JBSW Y3DP EHPK 3PXP" }),
    setTwoFactor: (userId: ID, on: boolean, code?: string) => {
      if (on && !/^\d{6}$/.test(code ?? "")) return Promise.reject(new Error("Код — 6 цифр из приложения-аутентификатора"))
      const u: User | undefined = db.users.find((x) => x.id === userId)
      if (u) u.two_factor = on
      return wait({ ok: true })
    },
  },
  archive: {
    // permanent removal of archived items (all of the entity, or the given ids)
    purge: (entity: ArchiveEntity, ids?: ID[]) => {
      const t = tables[entity]
      for (let i = t.length - 1; i >= 0; i--) if (t[i].state === "deleted" && (!ids || ids.includes(t[i].id))) t.splice(i, 1)
      return wait({ ok: true })
    },
  },
}
