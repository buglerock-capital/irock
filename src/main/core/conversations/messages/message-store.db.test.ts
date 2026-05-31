import { openFixture } from '@tooling/utils/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDb } from '@main/db/client';
import { conversations, messages, projects, tasks } from '@main/db/schema';
import type { ChatMessage } from '@shared/chat';
import { getChatMessages, insertChatMessage } from './message-store';

const mocks = vi.hoisted(() => ({
  db: undefined as AppDb | undefined,
}));

vi.mock('@main/db/client', () => ({
  get db() {
    if (!mocks.db) throw new Error('Test database not initialized');
    return mocks.db;
  },
}));

async function seedConversation(convId: string): Promise<void> {
  await mocks
    .db!.insert(projects)
    .values({ id: 'p1', name: 'P', path: '/tmp/p' })
    .onConflictDoNothing();
  await mocks
    .db!.insert(tasks)
    .values({ id: 't1', projectId: 'p1', name: 'T', status: 'in_progress' })
    .onConflictDoNothing();
  await mocks
    .db!.insert(conversations)
    .values({ id: convId, projectId: 'p1', taskId: 't1', title: 'C' })
    .onConflictDoNothing();
}

function makeMessage(id: string, convId: string): ChatMessage {
  return {
    id,
    conversationId: convId,
    role: 'assistant',
    providerId: 'claude',
    blocks: [{ type: 'text', text: 'hi' }],
    status: 'complete',
    createdAt: new Date().toISOString(),
  };
}

describe('message-store', () => {
  let fixture: Awaited<ReturnType<typeof openFixture>>;

  beforeEach(async () => {
    fixture = await openFixture('empty');
    mocks.db = fixture.db;
    await fixture.db.delete(messages);
  });

  afterEach(() => {
    fixture.close();
    mocks.db = undefined;
  });

  it('round-trips a chat message', async () => {
    await seedConversation('conv-rt');
    await insertChatMessage(makeMessage('m1', 'conv-rt'));
    const loaded = await getChatMessages('conv-rt');
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({
      id: 'm1',
      role: 'assistant',
      blocks: [{ type: 'text', text: 'hi' }],
    });
  });

  it('returns messages for a conversation in insertion order', async () => {
    await seedConversation('conv-ord');
    await insertChatMessage(makeMessage('a', 'conv-ord'));
    await insertChatMessage(makeMessage('b', 'conv-ord'));
    const loaded = await getChatMessages('conv-ord');
    expect(loaded.map((m) => m.id)).toEqual(['a', 'b']);
  });
});
