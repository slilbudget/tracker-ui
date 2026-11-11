// Viewer scope of the mock API: which campaigns the current role may see.
// The real backend applies the same rule server-side from the session; the UI never filters by itself.
import { campaigns, users } from "./seed"
import type { Role } from "@/api/types"

let allowed: Set<number> | null = null

export function setViewerRole(role: Role) {
  const level = role.access.campaigns
  if (level === "full" || level === "read") { allowed = null; return }
  // demo: «own» = buyer a_volkov (group 1), «groups» = team lead Alpha (groups 1-4)
  const groupIds = level === "own" ? [1] : users.find((u) => u.login === "lead_alpha")?.group_ids ?? []
  allowed = new Set(campaigns.filter((c) => c.group_id != null && groupIds.includes(c.group_id)).map((c) => c.id))
}
export const canSeeCampaign = (id: number | null | undefined) => allowed === null || (id != null && allowed.has(id))
