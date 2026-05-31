// src/main/core/conversations/adapters/index.ts
import { getProvider, type AgentProviderId } from '@shared/agent-provider-registry';
import type { ChatMessage } from '@shared/chat';
import { adaptClaudeEvent, extractSessionId } from './claude-json';

export type ChatAdapter = {
  adapt: (
    raw: unknown,
    ctx: { conversationId: string; providerId: AgentProviderId }
  ) => ChatMessage | null;
  sessionId: (raw: unknown) => string | null;
};

const ADAPTERS: Record<string, ChatAdapter> = {
  'claude-json': { adapt: adaptClaudeEvent, sessionId: extractSessionId },
};

/** Returns the adapter for a provider, or null if it has no structured adapter (Phase 1: claude only). */
export function getChatAdapter(providerId: AgentProviderId): ChatAdapter | null {
  const key = getProvider(providerId)?.chatAdapter;
  if (!key || key === 'raw') return null;
  return ADAPTERS[key] ?? null;
}
