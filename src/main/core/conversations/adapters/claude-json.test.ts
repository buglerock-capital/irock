// src/main/core/conversations/adapters/claude-json.test.ts
import { describe, expect, it } from 'vitest';
import { adaptClaudeEvent, extractSessionId } from './claude-json';

const ctx = { conversationId: 'c1', providerId: 'claude' as const };

describe('adaptClaudeEvent', () => {
  it('maps an assistant text event to an assistant message with a text block', () => {
    const msg = adaptClaudeEvent(
      {
        type: 'assistant',
        message: { id: 'msg_1', role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
      },
      ctx
    );
    expect(msg).toEqual({
      id: 'msg_1',
      conversationId: 'c1',
      role: 'assistant',
      providerId: 'claude',
      blocks: [{ type: 'text', text: 'Hello' }],
      status: 'complete',
      createdAt: expect.any(String),
    });
  });

  it('maps a Bash tool_use to a running command block', () => {
    const msg = adaptClaudeEvent(
      {
        type: 'assistant',
        message: {
          id: 'msg_2',
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }],
        },
      },
      ctx
    );
    expect(msg?.blocks).toEqual([
      { type: 'command', command: 'npm test', output: '', running: true },
    ]);
  });

  it('maps a non-Bash tool_use to an activity block', () => {
    const msg = adaptClaudeEvent(
      {
        type: 'assistant',
        message: {
          id: 'msg_3',
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/a/b.ts' } }],
        },
      },
      ctx
    );
    expect(msg?.blocks).toEqual([{ type: 'activity', label: 'Read' }]);
  });

  it('maps a tool_result (user role) to a tool message with output', () => {
    const msg = adaptClaudeEvent(
      {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok', is_error: false }],
        },
      },
      ctx
    );
    expect(msg?.role).toBe('tool');
    expect(msg?.blocks).toEqual([{ type: 'tool_result', ok: true, output: 'ok' }]);
  });

  it('returns null for a system/init event', () => {
    expect(adaptClaudeEvent({ type: 'system', subtype: 'init', session_id: 's1' }, ctx)).toBeNull();
  });

  it('maps an error result to an error message', () => {
    const msg = adaptClaudeEvent(
      { type: 'result', subtype: 'error', result: 'boom', is_error: true, session_id: 's1' },
      ctx
    );
    expect(msg?.status).toBe('error');
    expect(msg?.blocks).toEqual([{ type: 'error', message: 'boom' }]);
  });

  it('returns null for a successful result (already streamed as assistant text)', () => {
    expect(
      adaptClaudeEvent(
        { type: 'result', subtype: 'success', result: 'done', is_error: false, session_id: 's1' },
        ctx
      )
    ).toBeNull();
  });

  it('returns null when assistant content contains only unrecognized block types', () => {
    // An image block (or any future unknown type) produces no recognizable ChatBlock,
    // so the adapter should return null rather than an empty-blocks message.
    expect(
      adaptClaudeEvent(
        {
          type: 'assistant',
          message: { id: 'msg_x', role: 'assistant', content: [{ type: 'image', source: {} }] },
        },
        ctx
      )
    ).toBeNull();
  });

  it('returns null when assistant event has no content field (Fix 1 array guard)', () => {
    // Claude may emit assistant events without a content key; guard must not throw.
    expect(
      adaptClaudeEvent({ type: 'assistant', message: { id: 'msg_y', role: 'assistant' } }, ctx)
    ).toBeNull();
  });
});

describe('extractSessionId', () => {
  it('reads session_id from an init event', () => {
    expect(extractSessionId({ type: 'system', subtype: 'init', session_id: 's42' })).toBe('s42');
  });
  it('returns null when absent', () => {
    expect(extractSessionId({ type: 'assistant', message: {} })).toBeNull();
  });
});
