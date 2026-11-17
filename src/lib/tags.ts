// Campaign tags, one rule for the form and the server: no commas (the list filter and the URL split on them),
// trimmed, at most 40 characters, «—» is reserved for «no tags» in reports, case-insensitive duplicates dropped.
export const TAG_MAX = 40
export function normalizeTags(raw: readonly string[]): string[] {
  const out: string[] = []
  for (const part of raw.flatMap((t) => String(t).split(","))) {
    const t = part.trim().slice(0, TAG_MAX).trim()
    if (t && t !== "—" && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  return out
}
