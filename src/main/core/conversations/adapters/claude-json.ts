// src/main/core/conversations/adapters/claude-json.ts
import type { AgentProviderId } from '@shared/agent-provider-registry';
import type { ChatBlock, ChatMessage } from '@shared/chat';

export type ClaudeAdapterContext = {
  conversationId: string;
  providerId: AgentProviderId;
};

type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean };

type ClaudeEvent =
  | { type: 'system'; subtype?: string; session_id?: string }
  | { type: 'assistant'; message: { id: string; role: string; content: ClaudeContentBlock[] } }
  | { type: 'user'; message: { role: string; content: ClaudeContentBlock[] } }
  | { type: 'result'; subtype?: string; result?: string; is_error?: boolean; session_id?: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function blockFromContent(c: ClaudeContentBlock): ChatBlock | null {
  if (c.type === 'text') return { type: 'text', text: c.text };
  if (c.type === 'tool_use') {
    if (c.name === 'Bash') {
      const command = typeof c.input.command === 'string' ? c.input.command : '';
      return { type: 'command', command, output: '', running: true };
    }
    return { type: 'activity', label: c.name };
  }
  if (c.type === 'tool_result') {
    const output = typeof c.content === 'string' ? c.content : JSON.stringify(c.content);
    return { type: 'tool_result', ok: !c.is_error, output };
  }
  return null;
}

let toolCounter = 0;

export function adaptClaudeEvent(raw: unknown, ctx: ClaudeAdapterContext): ChatMessage | null {
  if (!isRecord(raw) || typeof raw.type !== 'string') return null;
  const ev = raw as ClaudeEvent;
  const base = {
    conversationId: ctx.conversationId,
    providerId: ctx.providerId,
    createdAt: new Date().toISOString(),
  };

  if (ev.type === 'assistant' && isRecord(ev.message)) {
    const blocks = ev.message.content
      .map(blockFromContent)
      .filter((b): b is ChatBlock => b !== null);
    if (blocks.length === 0) return null;
    return { id: ev.message.id, role: 'assistant', blocks, status: 'complete', ...base };
  }

  if (ev.type === 'user' && isRecord(ev.message)) {
    const blocks = ev.message.content
      .filter((c) => c.type === 'tool_result')
      .map(blockFromContent)
      .filter((b): b is ChatBlock => b !== null);
    if (blocks.length === 0) return null;
    return { id: `tool_${(toolCounter += 1)}`, role: 'tool', blocks, status: 'complete', ...base };
  }

  if (ev.type === 'result' && ev.is_error) {
    return {
      id: `err_${(toolCounter += 1)}`,
      role: 'assistant',
      blocks: [{ type: 'error', message: ev.result ?? 'Agent error' }],
      status: 'error',
      ...base,
    };
  }

  return null;
}

export function extractSessionId(raw: unknown): string | null {
  if (isRecord(raw) && typeof raw.session_id === 'string') return raw.session_id;
  return null;
}
