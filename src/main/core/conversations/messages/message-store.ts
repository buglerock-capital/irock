import { asc, eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { messages } from '@main/db/schema';
import type { ChatMessage } from '@shared/chat';

function firstText(message: ChatMessage): string {
  const block = message.blocks.find((b) => b.type === 'text');
  return block && block.type === 'text' ? block.text : '';
}

export async function insertChatMessage(message: ChatMessage): Promise<void> {
  const content = firstText(message);
  const metadata = JSON.stringify(message);
  await db
    .insert(messages)
    .values({
      id: message.id,
      conversationId: message.conversationId,
      content,
      sender: message.role,
      timestamp: message.createdAt,
      metadata,
    })
    .onConflictDoUpdate({
      target: messages.id,
      set: { content, sender: message.role, timestamp: message.createdAt, metadata },
    });
}

export async function getChatMessages(conversationId: string): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.timestamp), asc(messages.id));
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.metadata ?? '') as ChatMessage;
      } catch {
        return null;
      }
    })
    .filter((m): m is ChatMessage => m !== null);
}
