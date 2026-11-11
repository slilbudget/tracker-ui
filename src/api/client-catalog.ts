// Mock endpoints for the catalog sections (landings, offers, domains). Same contract style as client.ts:
// each function is one backend endpoint; swap the bodies for fetch() later.
import type { ID } from "./types"
import * as db from "@/mock/seed"

const wait = <T,>(v: T, ms = 300): Promise<T> => new Promise((res) => setTimeout(() => res(structuredClone(v)), ms))

interface ZipInfo { name: string; size: number }
interface LandingFile { path: string; size: number }

// Uploaded archives live in memory until the real file storage exists.
const zips = new Map<ID, ZipInfo>()

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

export const catalogApi = {
  // Archive and unpacked file list of a local landing. Landings created before the upload existed get a demo archive.
  landingFiles: (id: ID) => {
    const zip = zips.get(id) ?? { name: `landing-${id}.zip`, size: 180_000 + (hash(String(id)) % 400_000) }
    const h = hash(zip.name)
    const files: LandingFile[] = [
      { path: "index.html", size: 6_000 + (h % 9_000) },
      { path: "css/style.css", size: 2_000 + (h % 5_000) },
      { path: "img/hero.jpg", size: Math.round(zip.size * 0.55) },
      { path: "img/logo.svg", size: 1_200 + (h % 2_000) },
    ]
    return wait({ zip, files })
  },
  setLandingZip: (id: ID, zip: ZipInfo) => {
    zips.set(id, zip)
    return wait({ ok: true }, 400)
  },
  // «Проверить URL»: mock of a server-side GET to the page.
  checkUrl: (url: string) => {
    let host = ""
    try {
      const u = new URL(url)
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("protocol")
      host = u.hostname
    } catch {
      return wait({ ok: false as const, message: "Адрес некорректный: начните с http:// или https://" }, 200)
    }
    if (!host.includes(".")) return wait({ ok: false as const, message: `Домен «${host}» не найден: проверьте адрес` })
    if (/(bad|404|error)/.test(url)) return wait({ ok: false as const, message: "Страница ответила HTTP 404: проверьте путь" })
    return wait({ ok: true as const, message: `Страница отвечает: HTTP 200, ${120 + (hash(host) % 380)} мс` })
  },
  // Domain removal is guarded on the server: a domain used by campaigns cannot be deleted.
  removeDomain: (id: ID) => {
    const d = db.domains.find((x) => x.id === id)
    if (!d) return Promise.reject(new Error("Домен не найден"))
    const used = db.campaigns.filter((c) => c.domain_id === id && c.state !== "deleted").length
    if (d.campaigns_count > 0 || used > 0) return Promise.reject(new Error("Домен используется в кампаниях: сначала смените домен в них"))
    db.domains.splice(db.domains.indexOf(d), 1)
    return wait({ ok: true }, 30)
  },
}
