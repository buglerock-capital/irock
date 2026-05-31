import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@shared/chat';
import { ChatStore } from './chat-store';

function msg(id: string, text: string): ChatMessage {
  return {
    id,
    conversationId: 'c1',
    role: 'assistant',
    providerId: 'claude',
    blocks: [{ type: 'text', text }],
    status: 'complete',
    createdAt: new Date().toISOString(),
  };
}

describe('ChatStore', () => {
  it('appends new messages in order', () => {
    const store = new ChatStore('c1');
    store.upsert(msg('a', 'one'));
    store.upsert(msg('b', 'two'));
    expect(store.messages.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('upserts (replaces) a message with the same id', () => {
    const store = new ChatStore('c1');
    store.upsert(msg('a', 'one'));
    store.upsert(msg('a', 'updated'));
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].blocks).toEqual([{ type: 'text', text: 'updated' }]);
  });

  it('hydrate replaces all messages', () => {
    const store = new ChatStore('c1');
    store.upsert(msg('x', 'stale'));
    store.hydrate([msg('a', 'one'), msg('b', 'two')]);
    expect(store.messages.map((m) => m.id)).toEqual(['a', 'b']);
  });
});
