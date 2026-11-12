// Company directories: approaches («подходы») and the standard ad naming they are part of.
// Same contract style as client.ts: each function is one backend endpoint.
import type { Approach, ID } from "./types"
import * as db from "@/mock/seed"
import { viewerAccess } from "@/mock/scope"
import { wait } from "./mock-util"


// Ad naming: tokens in braces, separated by «-». {подход} takes the approach code.
let adNaming = "{язык}-{команда}-{номер}-{подход}-{штат}-{бренд}-{крео}"
export const NAMING_EXAMPLE: Record<string, string> = { "{язык}": "EN", "{команда}": "ALP", "{номер}": "159", "{штат}": "OH", "{бренд}": "GOLDPEAK", "{крео}": "009" }
export const namingExample = (template: string, code: string) =>
  template.replace(/\{[^}]+\}/g, (t) => (t === "{подход}" ? code || "КОД" : NAMING_EXAMPLE[t] ?? t))
// position of the approach code in an ad name built by the template
export const approachIndex = (template: string) => template.split("-").indexOf("{подход}")
export const currentAdNaming = () => adNaming

export const directoryApi = {
  approaches: {
    list: () => wait(db.approaches),
    // any buyer may add one while creating a campaign; the code must be unique
    create: (v: Pick<Approach, "name" | "code" | "description">) => {
      const code = v.code.trim().toUpperCase()
      if (db.approaches.some((a) => a.code === code || a.name.toLowerCase() === v.name.trim().toLowerCase()))
        return Promise.reject(new Error("Такой подход или код уже есть"))
      const a: Approach = { id: Math.max(0, ...db.approaches.map((x) => x.id)) + 1, name: v.name.trim(), code, description: v.description, created_by: db.CURRENT_USER_ID, created_at: new Date().toISOString() }
      db.approaches.push(a)
      return wait(a)
    },
    // rename / delete: settings edit access; anyone with campaigns may add (create above)
    update: (id: ID, patch: Partial<Pick<Approach, "name" | "code" | "description">>) => {
      if (!["full", "own", "groups"].includes(viewerAccess("settings"))) return Promise.reject(new Error("Нет прав менять справочник подходов"))
      const a = db.approaches.find((x) => x.id === id)
      if (!a) return Promise.reject(new Error("Подход не найден"))
      const old = a.name
      Object.assign(a, patch, patch.code ? { code: patch.code.trim().toUpperCase() } : {})
      // campaigns keep the approach by name
      if (patch.name && patch.name !== old) for (const c of db.campaigns) if (c.approach === old) c.approach = patch.name
      return wait(a)
    },
    remove: (id: ID) => {
      if (!["full", "own", "groups"].includes(viewerAccess("settings"))) return Promise.reject(new Error("Нет прав менять справочник подходов"))
      const a = db.approaches.find((x) => x.id === id)
      if (!a) return wait({ ok: true })
      if (db.campaigns.some((c) => c.approach === a.name && c.state !== "deleted")) return Promise.reject(new Error("Подход стоит в кампаниях: сначала смените его там"))
      db.approaches.splice(db.approaches.indexOf(a), 1)
      return wait({ ok: true })
    },
  },
  adNaming: {
    get: () => wait({ template: adNaming }),
    update: (template: string) => { adNaming = template; return wait({ template }) },
  },
}
