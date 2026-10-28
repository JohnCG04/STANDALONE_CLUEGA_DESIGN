/**
 * ASCII digits, read by character code — the one digit check the dashboard's
 * date, number and header parsers share. A script's own digits ("２", "٣") are
 * not digits here: `Number` does not read them, and neither does the backend.
 */

/** One ASCII digit, "0"–"9". */
export function isDigit(char: string | undefined): boolean {
  return char !== undefined && char.length === 1 && char >= "0" && char <= "9";
}

/** A non-empty run of ASCII digits and nothing else — no sign, dot, space or newline. */
export function isDigits(text: string): boolean {
  if (text.length === 0) return false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 48 || code > 57) return false;
  }
  return true;
}
