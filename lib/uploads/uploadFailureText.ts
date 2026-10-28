/**
 * The reason an upload failed, without the file name it opens with.
 *
 * Some refusals are written as a sentence about a file ("report.docx doesn't look like a
 * valid .docx file…") because they also travel as a bare toast or error. A failed chip
 * already prints the name on the line above, so repeating it reads as noise and costs the
 * chip a second line.
 */
export function reasonWithoutName(message: string | undefined, fileName: string): string {
  const text = (message ?? "").trim();
  const name = fileName.trim();
  if (!text || !name || !text.startsWith(name)) return text;
  const rest = text.slice(name.length).replace(/^[\s:,\-–—]+/, "");
  // "doesn't look like…" → "Doesn't look like…": the sentence now starts the line.
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : text;
}
