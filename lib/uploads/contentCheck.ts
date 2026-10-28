import {
  isCodeTextFile,
  UploadRejectedError,
  type UploadRejection,
} from "@/lib/uploads/limits";

/**
 * Does the file's CONTENT match what its name and type claim?
 *
 * `preflightUpload` only reads `file.type`, which the browser guesses from the
 * extension. Renaming a program, a PNG or random bytes to `.txt`, or giving junk a
 * `.png`/`.docx`/`.pdf` name, therefore sailed through every layer. This reads the
 * first and last few KB — never the whole file — and checks the signature the
 * format must carry. It answers "is this plausibly a <type>", not "is it perfect":
 * a file whose header is right and whose middle is damaged is for the server.
 *
 * It is a convenience for the person (a 500 MB video is refused in a blink, not
 * after minutes of upload), not the gate: the browser can be bypassed, so the
 * upload service has to make the same check.
 */

type Kind =
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "pdf"
  | "mp4"
  | "webm"
  | "mp3"
  | "wav"
  | "aac"
  | "ogg"
  | "ooxml"
  | "ole2"
  | "text";

const HEAD_BYTES = 8192;
/** Largest ZIP end-of-central-directory search window: a 22-byte record + 64 KiB comment. */
const ZIP_TAIL_BYTES = 22 + 65535;

const BY_MIME: Readonly<Record<string, Kind>> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/quicktime": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "ooxml",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "ooxml",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "ooxml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": "ooxml",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": "ooxml",
  "application/vnd.openxmlformats-officedocument.presentationml.template": "ooxml",
  // A plain ZIP (skill bundles) is the same container as an Office file: local header
  // first, end-of-central-directory record last.
  "application/zip": "ooxml",
  "application/x-zip-compressed": "ooxml",
  "application/msword": "ole2",
  "application/vnd.ms-excel": "ole2",
  "application/vnd.ms-powerpoint": "ole2",
  "text/plain": "text",
  "text/csv": "text",
  "text/markdown": "text",
  "text/html": "text",
  "text/xml": "text",
  "text/tab-separated-values": "text",
  "application/json": "text",
  "application/xml": "text",
};

/** For a file the browser could not name (empty or octet-stream type). */
const BY_EXTENSION: Readonly<Record<string, Kind>> = {
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  gif: "gif",
  webp: "webp",
  pdf: "pdf",
  mp4: "mp4",
  mov: "mp4",
  webm: "webm",
  mp3: "mp3",
  wav: "wav",
  aac: "aac",
  ogg: "ogg",
  docx: "ooxml",
  xlsx: "ooxml",
  pptx: "ooxml",
  zip: "ooxml",
  skill: "ooxml",
  dotx: "ooxml",
  xltx: "ooxml",
  potx: "ooxml",
  doc: "ole2",
  xls: "ole2",
  ppt: "ole2",
  txt: "text",
  csv: "text",
  md: "text",
  markdown: "text",
  html: "text",
  htm: "text",
  json: "text",
  xml: "text",
  tsv: "text",
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function kindOf(file: File): Kind | null {
  const type = file.type.trim().toLowerCase();
  const fromType = BY_MIME[type];
  if (fromType) return fromType;
  if (isCodeTextFile(file)) return "text";
  // Only when the browser said nothing useful; a named type that is not in the
  // table (e.g. an unlisted video) is not ours to judge.
  if (type === "" || type === "application/octet-stream") {
    return BY_EXTENSION[extensionOf(file.name)] ?? null;
  }
  return null;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], at = 0): boolean {
  if (bytes.length < at + signature.length) return false;
  return signature.every((byte, index) => bytes[at + index] === byte);
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let out = "";
  for (let index = from; index < Math.min(to, bytes.length); index += 1) {
    out += String.fromCharCode(bytes[index]);
  }
  return out;
}

/** Signatures of formats that must never pass as a text file. */
function looksLikeBinaryFormat(head: Uint8Array): boolean {
  return (
    startsWith(head, [0x89, 0x50, 0x4e, 0x47]) || // PNG
    startsWith(head, [0xff, 0xd8, 0xff]) || // JPEG
    ascii(head, 0, 3) === "GIF" ||
    ascii(head, 0, 5) === "%PDF-" ||
    startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || // ZIP / OOXML
    startsWith(head, [0x4d, 0x5a]) || // MZ (Windows executable)
    startsWith(head, [0x7f, 0x45, 0x4c, 0x46]) || // ELF
    startsWith(head, [0xcf, 0xfa, 0xed, 0xfe]) || // Mach-O
    startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) || // OLE2
    ascii(head, 0, 4) === "RIFF" ||
    ascii(head, 0, 4) === "OggS"
  );
}

function isText(head: Uint8Array): boolean {
  if (looksLikeBinaryFormat(head)) return false;
  // A UTF-16 BOM legitimately fills the text with NUL bytes.
  const utf16 = startsWith(head, [0xff, 0xfe]) || startsWith(head, [0xfe, 0xff]);
  if (utf16) return true;
  if (head.includes(0)) return false;
  try {
    // `stream` so a multi-byte character cut by the end of the window is not an error.
    new TextDecoder("utf-8", { fatal: true }).decode(head, { stream: true });
    return true;
  } catch {
    return false;
  }
}

/** True when the ZIP's end-of-central-directory record is present (a cut-off download lacks it). */
function hasZipEnd(tail: Uint8Array): boolean {
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tail[index] === 0x50 && tail[index + 1] === 0x4b && tail[index + 2] === 0x05 && tail[index + 3] === 0x06) {
      return true;
    }
  }
  return false;
}

/**
 * Whether these bytes could be a `kind` file. Pure over bytes, so it is testable
 * without a File. `head` is the start, `tail` the end (the whole file when small).
 */
export function matchesKind(kind: Kind, head: Uint8Array, tail: Uint8Array): boolean {
  switch (kind) {
    case "png":
      // Signature, then the mandatory IHDR chunk first; and IEND to close it.
      return (
        startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
        ascii(head, 12, 16) === "IHDR" &&
        ascii(tail, tail.length - 8, tail.length - 4) === "IEND"
      );
    case "jpeg":
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case "gif":
      return ascii(head, 0, 6) === "GIF87a" || ascii(head, 0, 6) === "GIF89a";
    case "webp":
      return ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP";
    case "pdf":
      // The spec allows up to 1024 bytes of junk before the header.
      return ascii(head, 0, 1024).includes("%PDF-");
    case "mp4":
      return ["ftyp", "moov", "mdat", "free", "wide", "skip"].includes(ascii(head, 4, 8));
    case "webm":
      return startsWith(head, [0x1a, 0x45, 0xdf, 0xa3]);
    case "mp3":
      return ascii(head, 0, 3) === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
    case "wav":
      return ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WAVE";
    case "aac":
      return (
        (head[0] === 0xff && (head[1] & 0xf6) === 0xf0) ||
        ascii(head, 0, 4) === "ADIF" ||
        ascii(head, 4, 8) === "ftyp"
      );
    case "ogg":
      return ascii(head, 0, 4) === "OggS";
    case "ooxml":
      return startsWith(head, [0x50, 0x4b, 0x03, 0x04]) && hasZipEnd(tail);
    case "ole2":
      return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "text":
      return isText(head);
  }
}

async function read(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Null when the file is plausible (or of a kind this does not judge); otherwise
 * the refusal to show. Empty files are refused outright.
 */
export async function inspectUploadContent(file: File): Promise<UploadRejection | null> {
  if (file.size === 0) {
    return {
      code: "empty_file",
      messageKey: "uploads.emptyFile",
      params: { name: file.name },
      detail: `file ${file.name} is empty`,
    };
  }
  const kind = kindOf(file);
  if (!kind) return null;

  let head: Uint8Array;
  let tail: Uint8Array;
  try {
    head = await read(file.slice(0, HEAD_BYTES));
    const tailBytes = kind === "ooxml" ? ZIP_TAIL_BYTES : kind === "png" ? 16 : 0;
    tail = tailBytes > 0 ? await read(file.slice(Math.max(0, file.size - tailBytes))) : head;
  } catch {
    // Unreadable here (permissions, a vanished file): the server decides.
    return null;
  }

  if (matchesKind(kind, head, tail)) return null;
  return contentMismatch(file, kind, "does not look like");
}

function contentMismatch(file: File, kind: Kind, verdict: string): UploadRejection {
  const extension = extensionOf(file.name);
  return {
    code: "bad_content",
    messageKey: "uploads.contentMismatch",
    params: { name: file.name, type: extension ? `.${extension}` : file.type || kind },
    detail: `file ${file.name} ${verdict} ${kind}`,
  };
}

const PICTURE_KINDS: ReadonlySet<Kind> = new Set(["png", "jpeg", "gif", "webp"]);
const CLIP_TAGS: Partial<Record<Kind, "video" | "audio">> = {
  mp4: "video",
  webm: "video",
  mp3: "audio",
  wav: "audio",
  aac: "audio",
  ogg: "audio",
};

/** How long a clip may take to show its header before the check stops waiting and lets it pass. */
const DECODE_TIMEOUT_MS = 8000;

/**
 * Can the browser draw or play the file? A right header over a broken body passes the check
 * above, uploads, then shows "Could not load" on the card that holds it (workflow editor).
 */
export async function inspectMediaDecode(file: File): Promise<UploadRejection | null> {
  const kind = kindOf(file);
  if (!kind) return null;
  const tag = CLIP_TAGS[kind];
  const decodes = PICTURE_KINDS.has(kind)
    ? await drawsAsPicture(file)
    : tag
      ? await playsAsClip(file, tag)
      : true;
  return decodes ? null : undecodable(file, kind);
}

/** Header fine, body unreadable: its own words, so it is not mistaken for a renamed file. */
function undecodable(file: File, kind: Kind): UploadRejection {
  return {
    code: "bad_content",
    messageKey: CLIP_TAGS[kind] === "video" ? "uploads.videoUnplayable" : "uploads.corruptFile",
    params: { name: file.name },
    detail: `file ${file.name} does not decode as ${kind}`,
  };
}

async function drawsAsPicture(file: File): Promise<boolean> {
  // No decoder here (server render, tests): not ours to judge.
  if (typeof createImageBitmap !== "function") return true;
  try {
    // Scaled down, so a large photo never holds a full-size bitmap just to be checked.
    (await createImageBitmap(file, { resizeWidth: 64 })).close();
    return true;
  } catch {
    return false;
  }
}

function playsAsClip(file: File, tag: "video" | "audio"): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(true);
  return new Promise((resolve) => {
    const media = document.createElement(tag);
    const url = URL.createObjectURL(file);
    const settle = (plays: boolean) => {
      clearTimeout(timer);
      media.onloadedmetadata = media.onloadeddata = media.onerror = null;
      media.removeAttribute("src");
      media.load();
      URL.revokeObjectURL(url);
      resolve(plays);
    };
    // A slow header is not a broken file: past the wait it passes and the card decides.
    const timer = setTimeout(() => settle(true), DECODE_TIMEOUT_MS);
    const hasPicture = () => tag === "audio" || (media as HTMLVideoElement).videoWidth > 0;
    // No length or no picture plays as black at 0:00; a live WebM's length is Infinity.
    media.onloadedmetadata = () => {
      if (!(media.duration > 0) || !hasPicture()) settle(false);
      else if (tag === "audio") settle(true);
    };
    // A video passes only once its first frame decodes; a broken body errors here instead.
    media.onloadeddata = () => settle(hasPicture());
    media.onerror = () => settle(false);
    media.preload = tag === "video" ? "auto" : "metadata";
    media.src = url;
  });
}

/** For the upload functions that already throw on a pre-flight refusal. */
export async function assertUploadContent(file: File): Promise<void> {
  const rejection = await inspectUploadContent(file);
  if (rejection) throw new UploadRejectedError(rejection);
}
