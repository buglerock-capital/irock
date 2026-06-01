import type { ChatMessage } from '@shared/chat';
import { getChatMessages as loadChatMessages } from './messages/message-store';

export async function getChatMessages(conversationId: string): Promise<ChatMessage[]> {
  return loadChatMessages(conversationId);
}
