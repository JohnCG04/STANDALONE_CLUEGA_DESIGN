// The app's own language codes, translated to tags the `Intl` APIs understand.
//
// ⚠ Two of the three are wrong if passed through, and NEITHER fails loudly:
//
//   - `vn` is not a language tag — Vietnamese is `vi`. `Intl` treats an
//     unrecognised tag as a request it cannot satisfy and falls back to the
//     default locale, so a Vietnamese user silently reads English.
//   - bare `zh` resolves to SIMPLIFIED Chinese, while this product's `zh`
//     dictionary is Traditional. So `zh` renders 马来西亚时间 into a UI that
//     everywhere else says 馬來西亞時間 — half-translated in a way only a reader
//     of the language notices.
//
// Both failures look like working software from the outside, which is why this
// mapping is one function with a test rather than a conditional at each call
// site.

/**
 * A BCP 47 tag for one of the app's language codes.
 *
 * Unknown input is returned trimmed rather than replaced: a tag this product
 * has not heard of is more likely to be a real locale than a mistake, and
 * `Intl` already has an answer for one it cannot use.
 */
export function intlLocale(lang: string): string {
  switch (lang.trim().toLowerCase()) {
    case "vn":
    case "vi":
      return "vi";
    case "zh":
      // The script subtag rather than a country: this dictionary is Traditional
      // Chinese, which is not a claim about which territory the reader is in.
      return "zh-Hant";
    case "th":
      // Gregorian: a bare `th` counts years in the Buddhist era (2026 → 2569).
      return "th-TH-u-ca-gregory";
    case "":
      return "en";
    default:
      return lang.trim();
  }
}
