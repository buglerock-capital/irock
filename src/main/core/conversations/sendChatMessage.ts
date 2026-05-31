import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildAgentEnv } from '@main/core/pty/pty-env';
import { db } from '@main/db/client';
import { conversations } from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import {
  getProvider,
  isValidProviderId,
  type AgentProviderId,
} from '@shared/agent-provider-registry';
import type { ChatMessage } from '@shared/chat';
import { parseConversationConfig } from '@shared/conversation-config';
import { chatMessageChannel } from '@shared/events/chatEvents';
import { runHeadlessTurn } from './impl/headless-runner';
import { resolveTurnCwd } from './impl/resolve-turn-cwd';
import { insertChatMessage } from './messages/message-store';
import { persistChatProviderSessionId } from './save-provider-session-id';

export type SendChatMessageParams = {
  conversationId: string;
  taskId: string;
  text: string;
};

export async function sendChatMessage(params: SendChatMessageParams): Promise<void> {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.conversationId))
    .limit(1);

  if (!conv) throw new Error(`Conversation ${params.conversationId} not found`);

  const rawProvider = conv.provider ?? 'claude';
  let providerId: AgentProviderId;
  if (isValidProviderId(rawProvider)) {
    providerId = rawProvider;
  } else {
    log.warn('chat: unknown provider on conversation, defaulting to claude', {
      provider: conv.provider,
    });
    providerId = 'claude';
  }

  const providerDef = getProvider(providerId);
  if (!providerDef?.headlessArgs) {
    throw new Error(`Provider ${providerId} has no headless mode`);
  }

  const userMessage: ChatMessage = {
    id: randomUUID(),
    conversationId: params.conversationId,
    role: 'user',
    providerId,
    blocks: [{ type: 'text', text: params.text }],
    status: 'complete',
    createdAt: new Date().toISOString(),
  };

  await insertChatMessage(userMessage);
  events.emit(chatMessageChannel, {
    conversationId: params.conversationId,
    taskId: params.taskId,
    message: userMessage,
  });

  const priorSessionId = parseConversationConfig(conv.config).providerSessionId;
  const cwd = await resolveTurnCwd(params.taskId);

  const args: string[] = [...providerDef.headlessArgs];
  if (providerDef.autoApproveFlag) args.unshift(providerDef.autoApproveFlag);
  if (priorSessionId && providerDef.resumeFlag) {
    args.push(providerDef.resumeFlag, priorSessionId);
  }
  args.push(params.text);

  const result = await runHeadlessTurn(
    {
      providerId,
      conversationId: params.conversationId,
      command: providerDef.cli ?? providerId,
      args,
      cwd,
      env: buildAgentEnv({}),
    },
    {
      onMessage: (message) => {
        insertChatMessage(message).catch((err: unknown) =>
          log.warn('chat: failed to persist agent message', { err })
        );
        events.emit(chatMessageChannel, {
          conversationId: params.conversationId,
          taskId: params.taskId,
          message,
        });
      },
    }
  );

  if (result.sessionId && result.sessionId !== priorSessionId) {
    await persistChatProviderSessionId(params.conversationId, result.sessionId).catch(
      (err: unknown) => log.warn('chat: failed to persist provider session id', { err })
    );
  }
}
