import { cdpFetch } from "@/lib/cdp";

// ── Types ──────────────────────────────────────────────────────────────────

export type TelegramConnection = {
  id: string;
  botUsername: string;
  status: string;
  isPlatformDefault: boolean;
};

export type TelegramBindingToken = {
  token: string;
  deepLink: string;
  expiresAt: string;
};

export type TelegramBinding = {
  id: string;
  connectionId: string;
  telegramUserId: string;
  agentId: string;
  operatorUserId: string;
  status: string;
  updatedAt: string;
};

/** The system has a single AI agent (no more versions). */
export const CLUEGA_AGENT_ID = "cluega_1_0";
export const CLUEGA_AGENT_NAME = "Cluega 1.0";

// ── Internal DTOs ──────────────────────────────────────────────────────────

type TelegramConnectionDTO = {
  id: string;
  bot_username?: string;
  status?: string;
  is_platform_default?: boolean;
};

type TelegramBindingTokenDTO = {
  token: string;
  deep_link: string;
  expires_at: string;
};

type TelegramBindingDTO = {
  id: string;
  connection_id: string;
  telegram_user_id: string;
  agent_id: string;
  operator_user_id: string;
  status: string;
  updated_at: string;
};

// ── Mappers ────────────────────────────────────────────────────────────────

function mapTelegramConnection(dto: TelegramConnectionDTO): TelegramConnection {
  return {
    id: dto.id,
    botUsername: dto.bot_username ?? "",
    status: dto.status ?? "active",
    isPlatformDefault: dto.is_platform_default ?? false,
  };
}

// ── API functions ──────────────────────────────────────────────────────────

export async function listTelegramConnections(): Promise<TelegramConnection[]> {
  const dtos = await cdpFetch<TelegramConnectionDTO[]>(
    "/api/v1/integrations/telegram/connections",
    { auth: { kind: "auto" } },
  );
  return (dtos ?? []).map(mapTelegramConnection);
}

export async function issueTelegramBindingToken(
  connectionId: string,
  agentId: string,
): Promise<TelegramBindingToken> {
  const dto = await cdpFetch<TelegramBindingTokenDTO>(
    `/api/v1/integrations/telegram/connections/${encodeURIComponent(connectionId)}/bindings/issue`,
    {
      method: "POST",
      auth: { kind: "auto" },
      body: { agent_id: agentId },
    },
  );
  return {
    token: dto.token,
    deepLink: dto.deep_link,
    expiresAt: dto.expires_at,
  };
}

export async function listTelegramBindings(connectionId: string): Promise<TelegramBinding[]> {
  const dtos = await cdpFetch<TelegramBindingDTO[]>(
    `/api/v1/integrations/telegram/connections/${encodeURIComponent(connectionId)}/bindings`,
    { auth: { kind: "auto" } },
  );
  return (dtos ?? []).map((d) => ({
    id: d.id,
    connectionId: d.connection_id,
    telegramUserId: d.telegram_user_id,
    agentId: d.agent_id,
    operatorUserId: d.operator_user_id,
    status: d.status,
    updatedAt: d.updated_at,
  }));
}
