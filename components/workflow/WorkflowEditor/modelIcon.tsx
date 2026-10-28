import type { ReactNode } from "react";
import {
  ByteDance,
  Claude,
  DeepSeek,
  Gemini,
  Grok,
  OpenAI,
  Qwen,
} from "@lobehub/icons";
import { Sparkles } from "lucide-react";

/** A brand icon for a model label/id; the catalogs ship none, and a model is never iconless. */
export function resolveModelIcon(label: string): ReactNode {
  const s = (label ?? "").toLowerCase();

  if (
    s.includes("byteplus") ||
    s.includes("bytedance") ||
    s.includes("seedance") ||
    s.includes("dreamina")
  )
    return <ByteDance size={16} />;

  if (s.includes("claude") || s.includes("anthropic")) return <Claude size={16} />;
  if (s.includes("gpt") || s.includes("openai") || s.includes("dall") || s.includes("o1") || s.includes("o3"))
    return <OpenAI size={16} />;
  if (
    s.includes("gemini") ||
    s.includes("imagen") ||
    s.includes("veo") ||
    s.includes("nano banana") ||
    s.includes("google")
  )
    return <Gemini size={16} />;
  if (s.includes("deepseek")) return <DeepSeek size={16} />;
  if (s.includes("grok")) return <Grok size={16} />;
  if (s.includes("qwen")) return <Qwen size={16} />;

  // Default fallback — an unknown provider still gets an icon, never a blank.
  return <Sparkles size={16} className="text-muted-foreground" />;
}
