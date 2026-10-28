// Thread readers, the ask-once rule and the question mapping; the routing call decides what to ask.

import type { AgentQuestion, ClarifyQuestion, ThreadTurn } from "./types";

/**
 * The user's earlier turns, oldest first, without the one being sent.
 * Kept apart from the request: joined, nothing marks which sentence is the new one.
 */
export function contextFrom(
  history: readonly ThreadTurn[],
  latest: string,
): string {
  const said = history
    .filter((m) => m.role === "user" && m.text.trim())
    .map((m) => m.text.trim());
  // The panel may or may not have appended the turn being sent.
  if (said.at(-1) === latest.trim()) said.pop();
  return said.join("\n");
}

/**
 * Every user turn, oldest first, as one brief. The assistant's turns are left out:
 * fed its own words back, a model treats them as requirements.
 */
export function briefFrom(history: readonly ThreadTurn[], latest: string): string {
  const asked = history
    .filter((m) => m.role === "user" && m.text.trim())
    .map((m) => m.text.trim());
  // The panel may or may not have appended the turn being sent.
  if (asked.at(-1) !== latest.trim()) asked.push(latest.trim());
  return asked.join("\n");
}

/**
 * The questions as a form, not a paragraph.
 * Also the snake_case (media-ai) to camelCase (agent package) boundary.
 */
export function toAgentQuestions(
  questions: readonly ClarifyQuestion[],
): AgentQuestion[] {
  return questions.map((q, i) => ({
    // An answer keyed on `undefined` would overwrite its neighbour, so position stands in.
    id: q.id || `q${i + 1}`,
    question: q.question,
    hint: q.hint,
    required: q.required,
    // A closed list is a select; `allow_custom` options are hints, so the declared type stays.
    inputType: q.options?.length && !q.allow_custom ? "select" : q.input_type,
    options: q.options,
    allowCustom: q.allow_custom,
    about: q.about,
    optionNodes: q.option_nodes,
  }));
}

/**
 * Whether a question was already put to the user, in a turn of either role.
 * The whole normalised question must appear, so a passing mention in prose does not count.
 */
function alreadyAsked(history: readonly ThreadTurn[], question: string): boolean {
  const needle = normalise(question);
  if (!needle) return false;
  return history.some((turn) => normalise(turn.text).includes(needle));
}

/**
 * Lowercase, collapse whitespace, drop the punctuation a rewording changes.
 * `?` survives: it tells an answered form ("X? 9:16") from prose. `？` is mapped for zh.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\uff1f/g, "?")
    .replace(/[!.,:;"'`()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The questions worth asking this turn: none on an answer turn (one round per brief),
 * and never one already asked in this thread, even if the user declined it.
 */
export function worthAsking(
  history: readonly ThreadTurn[],
  questions: readonly AgentQuestion[],
  answering = false,
): AgentQuestion[] {
  if (answering) return [];
  return questions.filter((q) => !alreadyAsked(history, q.question));
}
