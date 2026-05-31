// src/main/core/conversations/impl/headless-runner.test.ts
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@shared/chat';
import { runHeadlessTurn } from './headless-runner';

function fakeChild(lines: string[]) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: () => void;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  queueMicrotask(() => {
    child.stdout.emit('data', lines.join('\n') + '\n');
    child.emit('close', 0);
  });
  return child;
}

describe('runHeadlessTurn', () => {
  it('parses NDJSON, adapts messages, and captures the session id', async () => {
    const init = JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-1' });
    const assistant = JSON.stringify({
      type: 'assistant',
      message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    });
    const spawn = vi.fn(() => fakeChild([init, assistant]));
    const received: ChatMessage[] = [];

    const result = await runHeadlessTurn(
      {
        providerId: 'claude',
        conversationId: 'c1',
        command: 'claude',
        args: ['-p', '--output-format', 'stream-json', '--verbose', 'hi'],
        cwd: '/tmp',
        env: {},
      },
      { onMessage: (m) => received.push(m), spawn: spawn as never }
    );

    expect(received).toHaveLength(1);
    expect(received[0].blocks).toEqual([{ type: 'text', text: 'done' }]);
    expect(result.sessionId).toBe('sess-1');
  });

  it('tolerates a non-JSON line without throwing', async () => {
    const spawn = vi.fn(() =>
      fakeChild(['not json', JSON.stringify({ type: 'system', session_id: 'x' })])
    );
    const received: ChatMessage[] = [];
    const result = await runHeadlessTurn(
      {
        providerId: 'claude',
        conversationId: 'c1',
        command: 'claude',
        args: [],
        cwd: '/tmp',
        env: {},
      },
      { onMessage: (m) => received.push(m), spawn: spawn as never }
    );
    expect(received).toHaveLength(0);
    expect(result.sessionId).toBe('x');
  });
});
