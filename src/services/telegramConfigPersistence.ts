export interface TelegramServerConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

/** Persist the complete next value before returning it for runtime activation. */
export function persistTelegramConfigUpdate(
  current: TelegramServerConfig,
  input: unknown,
  write: (next: TelegramServerConfig) => void,
): TelegramServerConfig {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const next = {
    botToken: typeof body.botToken === 'string' && body.botToken.trim() ? body.botToken.trim() : current.botToken,
    chatId: typeof body.chatId === 'string' && body.chatId.trim() ? body.chatId.trim() : current.chatId,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
  };
  write(next);
  return next;
}
