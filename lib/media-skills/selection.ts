// Skill fields as one media job carries them (PRD IV auto mode).
//
// Two shapes ride the submit chain:
// - a bare `string[]` — the legacy manual contract: every id is a pin,
//   applied unconditionally. Kept so untouched callers (workflow nodes,
//   canvas, prompt-enhance) stay byte-identical on the wire.
// - a `JobSkillSelection` — auto mode: `skills` are the user's pins,
//   `skill_candidates` the enabled pool the backend's relevance selector may
//   draw from per prompt, `skills_auto` the flag that arms it.

export interface JobSkillSelection {
  /** Pins — always applied, legacy `skills[]` semantics. */
  skills: string[]
  /** The enabled pool the backend may auto-select from. Irrelevant, stale or
   * out-of-scope candidates are dropped server-side, never an error. */
  skill_candidates?: string[]
  skills_auto?: boolean
}

export type SkillsInput = string[] | JobSkillSelection | undefined

/** Split one turn's enabled in-scope ids into the selection the job carries.
 * Auto OFF returns the historical shape — every enabled id is a pin. Auto ON
 * keeps the user's "always apply" pins as pins and offers the rest as
 * candidates for the backend's per-prompt relevance selector. */
export function buildJobSkillSelection(
  enabledIds: string[],
  alwaysApplyIds: string[],
  autoMode: boolean,
  laneIds: string[] = [],
): JobSkillSelection {
  if (!autoMode) return { skills: enabledIds }
  // A lane skill is a pipeline, not a directive: it reads the reference video,
  // writes documents and stops at a confirm gate. Offering it as a CANDIDATE
  // would mean a relevance model decides whether the user's turn becomes that
  // job — and the backend deliberately refuses to auto-select one, so a lane
  // sent as a candidate is silently dropped and the user's selection does
  // nothing. Pin it.
  const isPinned = (id: string) =>
    alwaysApplyIds.includes(id) || laneIds.includes(id)
  const pinned = enabledIds.filter(isPinned)
  const candidates = enabledIds.filter((id) => !isPinned(id))
  return {
    skills: pinned,
    ...(candidates.length
      ? { skill_candidates: candidates, skills_auto: true }
      : {}),
  }
}

/** The exact wire fields for one job body. Every field is omitted when empty
 * so a manual-mode body stays byte-identical to the historical shape. */
export function skillJobFields(input: SkillsInput): {
  skills?: string[]
  skill_candidates?: string[]
  skills_auto?: true
} {
  if (!input) return {}
  const selection: JobSkillSelection = Array.isArray(input)
    ? { skills: input }
    : input
  return {
    ...(selection.skills?.length ? { skills: selection.skills } : {}),
    ...(selection.skills_auto && selection.skill_candidates?.length
      ? { skill_candidates: selection.skill_candidates, skills_auto: true }
      : {}),
  }
}
