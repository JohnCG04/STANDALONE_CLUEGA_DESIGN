/**
 * The chat's type hierarchy, in one place (matched against Manus, 20/10/2026).
 *
 * The assistant's prose is the thing being read, so it is the LARGEST text in
 * the turn; the trace rows around it (turn header, group rows, step row, live
 * row) are one quiet step smaller and grey. Measured before this file existed,
 * Cluega had it backwards: narration and answer at 13px under 14px trace rows.
 *
 * Manus draws prose at 16/24 and its rows at 14/20. Cluega tried 15/24 on
 * 20/10/2026 and went back the same day: it read a step larger than the rest
 * of the app. Prose sits at the pre-match answer size, 14px / 1.65, still half
 * a pixel above the 13.5px rows.
 *
 * Plain strings with no imports: the markdown renderer and the trace both read
 * them, and this module has to stay loadable from `tsx --test` (no CSS loader).
 */

/** Assistant prose: the narration between steps and the answer's markdown body. */
export const ASSISTANT_PROSE = "text-[14px] leading-[1.65]";

/** Every secondary row of the trace, at weight 400 whatever its parent says. */
export const TRACE_ROW_TYPE = "text-[13.5px] leading-[20px] font-normal";

/** Manus's tertiary grey. Not `--muted-foreground`: a blue-grey, #9d9da6 in dark. */
export const TRACE_TERTIARY = "text-[#737373] dark:text-[#8c8c8c]";
