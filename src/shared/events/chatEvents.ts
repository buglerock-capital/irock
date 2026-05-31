import type { ChatMessage } from '@shared/chat';
import { defineEvent } from '@shared/ipc/events';

export const chatMessageChannel = defineEvent<{
  conversationId: string;
  taskId: string;
  message: ChatMessage;
}>('chat:message');
