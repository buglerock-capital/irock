# Unified Chat — Phase 1 (Claude Code structured chat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind a `chat-ui` feature flag, render Claude Code agent conversations as a Cursor-style chat (message bubbles + collapsible command/activity cards) instead of a raw terminal, driving Claude Code in headless `stream-json` mode.

**Architecture:** A new headless spawn path runs `claude -p --output-format stream-json`, a pure adapter normalizes each NDJSON event into a shared `ChatMessage`, messages are emitted on a typed event channel and persisted to the existing (currently unused) `messages` table. The renderer subscribes, accumulates messages in a MobX store, and renders a `ChatPanel` that replaces `PtyPane` at the existing conversations-panel seam when the flag is on. The terminal path is untouched when the flag is off.

**Tech Stack:** TypeScript, Electron (main/renderer), MobX + mobx-react-lite, TanStack Query (not needed here), Drizzle/SQLite, Vitest (node + browser projects), node `child_process`, the project's typed RPC + event bus.

**Spec:** `docs/superpowers/specs/2026-06-01-unified-chat-interface-design.md` (this plan covers Phase 1 / §8 step 1 only; raw fallback, more adapters, and polish are later plans).

**Conventions to honor:** oxfmt (100 col, 2-space, single quotes TS / double quotes JSX, semicolons), oxlint, strict TS, no `any` (local documented escapes only), top-level imports only, RPC methods in `controller.ts` registered via `src/main/rpc.ts`, renderer calls via `rpc` from `@renderer/lib/ipc`, MobX store access through selectors, path aliases `@shared/* @main/* @renderer/*`.

**Local merge gate (run before finishing):**
```bash
pnpm run format && pnpm run lint && pnpm run typecheck && pnpm run test
```

---

## File Structure

**Create:**
- `src/shared/chat.ts` — `ChatBlock`, `ChatMessage`, `ChatRole`, `ChatMessageStatus` types (canonical model).
- `src/shared/events/chatEvents.ts` — typed `chat:message` channel.
- `src/main/core/conversations/adapters/claude-json.ts` — pure: Claude stream-json event → `ChatMessage | null` + the Claude event types.
- `src/main/core/conversations/adapters/claude-json.test.ts` — adapter unit tests.
- `src/main/core/conversations/adapters/index.ts` — `getChatAdapter(providerId)`.
- `src/main/core/conversations/messages/message-store.ts` — `insertChatMessage`, `getChatMessages` (DB access on existing `messages` table).
- `src/main/core/conversations/messages/message-store.test.ts` — DB integration tests (`main-db` project).
- `src/main/core/conversations/impl/headless-runner.ts` — `runHeadlessTurn(...)` spawn+stream+adapt loop (spawn injectable for tests).
- `src/main/core/conversations/impl/headless-runner.test.ts` — runner unit tests with a fake spawn.
- `src/main/core/conversations/sendChatMessage.ts` — RPC handler (persist user msg, run a turn, emit+persist assistant msgs, capture session id).
- `src/main/core/conversations/getChatMessages.ts` — RPC handler (load persisted messages).
- `src/renderer/features/tasks/conversations/chat/chat-store.ts` — MobX store: subscribe to `chat:message`, accumulate by conversation.
- `src/renderer/features/tasks/conversations/chat/chat-store.test.ts` — store unit tests (node project).
- `src/renderer/features/tasks/conversations/chat/ChatPanel.tsx` — panel (list + composer).
- `src/renderer/features/tasks/conversations/chat/ChatMessageList.tsx` — renders messages/blocks.
- `src/renderer/features/tasks/conversations/chat/CommandCard.tsx` — collapsible "Ran `cmd`" card.
- `src/renderer/features/tasks/conversations/chat/ChatComposer.tsx` — textarea + send + agent picker.

**Modify:**
- `src/shared/agent-provider-registry.ts` — add `chatAdapter`, `headlessArgs`, `supportsFollowup` to `AgentProviderDefinition` and to the `claude` entry.
- `src/main/core/conversations/controller.ts` — register `sendChatMessage`, `getChatMessages`.
- `src/renderer/features/tasks/conversations/conversations-panel.tsx` — feature-flag seam: render `<ChatPanel>` instead of `<PtyPane>` when `chat-ui` is on.

---

## Task 1: Shared chat model

**Files:**
- Create: `src/shared/chat.ts`

- [ ] **Step 1: Write the model**

```ts
// src/shared/chat.ts
import type { AgentProviderId } from '@shared/agent-provider-registry';

export type ChatRole = 'user' | 'assistant' | 'tool';

export type ChatMessageStatus = 'streaming' | 'complete' | 'error';

export type ChatBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; ok: boolean; output: string }
  | { type: 'command'; command: string; output: string; exitCode?: number; running: boolean }
  | { type: 'activity'; label: string }
  | { type: 'plan'; steps: { text: string; done: boolean }[] }
  | { type: 'diff'; file: string; patch: string }
  | { type: 'error'; message: string };

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: ChatRole;
  providerId: AgentProviderId;
  blocks: ChatBlock[];
  status: ChatMessageStatus;
  createdAt: string;
};
```

- [ ] **Step 2: Typecheck the file compiles**

Run: `pnpm run typecheck`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/shared/chat.ts
git commit -m "feat(chat): add shared chat message model"
```

---

## Task 2: Typed chat event channel

**Files:**
- Create: `src/shared/events/chatEvents.ts`

- [ ] **Step 1: Write the channel** (mirrors `src/shared/events/conversationEvents.ts`)

```ts
// src/shared/events/chatEvents.ts
import type { ChatMessage } from '@shared/chat';
import { defineEvent } from '@shared/ipc/events';

export const chatMessageChannel = defineEvent<{
  conversationId: string;
  taskId: string;
  message: ChatMessage;
}>('chat:message');
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/events/chatEvents.ts
git commit -m "feat(chat): add chat:message event channel"
```

---

## Task 3: Extend provider registry for chat

**Files:**
- Modify: `src/shared/agent-provider-registry.ts` (type `AgentProviderDefinition`, and the `claude` entry at lines ~110-129)

- [ ] **Step 1: Add fields to the `AgentProviderDefinition` type**

Find the `AgentProviderDefinition` type and add these three optional fields (place them next to `supportsHooks`):

```ts
  /** Which chat adapter normalizes this agent's output. Unset → 'raw' fallback (later phase). */
  chatAdapter?: 'claude-json' | 'raw';
  /** Args to run the agent headless / in structured-output mode (no interactive TUI). */
  headlessArgs?: string[];
  /** True if the agent accepts further turns without a fresh spawn (else resume per turn). */
  supportsFollowup?: boolean;
```

- [ ] **Step 2: Set them on the `claude` provider entry**

In the `claude` entry (the object with `id: 'claude'`), add:

```ts
    chatAdapter: 'claude-json',
    headlessArgs: ['-p', '--output-format', 'stream-json', '--verbose'],
    supportsFollowup: false,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/agent-provider-registry.ts
git commit -m "feat(chat): add chat adapter metadata to provider registry"
```

---

## Task 4: Claude stream-json adapter (TDD)

The adapter is a **pure function**: given one parsed NDJSON object from `claude --output-format stream-json`, return a `ChatMessage` or `null`. Claude emits objects shaped like:
- `{ "type": "system", "subtype": "init", "session_id": "...", ... }`
- `{ "type": "assistant", "message": { "id": "msg_...", "role": "assistant", "content": [ {"type":"text","text":"..."} | {"type":"tool_use","id":"...","name":"Bash","input":{"command":"npm test"}} ] } }`
- `{ "type": "user", "message": { "role":"user", "content":[ {"type":"tool_result","tool_use_id":"...","content":"...","is_error":false} ] } }`
- `{ "type": "result", "subtype": "success", "result": "...", "is_error": false, "session_id": "..." }`

**Files:**
- Create: `src/main/core/conversations/adapters/claude-json.test.ts`
- Create: `src/main/core/conversations/adapters/claude-json.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/main/core/conversations/adapters/claude-json.test.ts
import { describe, expect, it } from 'vitest';
import { adaptClaudeEvent, extractSessionId } from './claude-json';

const ctx = { conversationId: 'c1', providerId: 'claude' as const };

describe('adaptClaudeEvent', () => {
  it('maps an assistant text event to an assistant message with a text block', () => {
    const msg = adaptClaudeEvent(
      { type: 'assistant', message: { id: 'msg_1', role: 'assistant', content: [{ type: 'text', text: 'Hello' }] } },
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
});

describe('extractSessionId', () => {
  it('reads session_id from an init event', () => {
    expect(extractSessionId({ type: 'system', subtype: 'init', session_id: 's42' })).toBe('s42');
  });
  it('returns null when absent', () => {
    expect(extractSessionId({ type: 'assistant', message: {} })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/main/core/conversations/adapters/claude-json.test.ts`
Expected: FAIL (module not found / functions not defined).

- [ ] **Step 3: Implement the adapter**

```ts
// src/main/core/conversations/adapters/claude-json.ts
import type { AgentProviderId } from '@shared/agent-provider-registry';
import type { ChatBlock, ChatMessage } from '@shared/chat';

export type ClaudeAdapterContext = {
  conversationId: string;
  providerId: AgentProviderId;
};

// Minimal structural types for the Claude stream-json objects we consume.
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
    const blocks = ev.message.content.map(blockFromContent).filter((b): b is ChatBlock => b !== null);
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
```

Note: `createdAt: expect.any(String)` in the test tolerates the timestamp. The tests do not assert exact `id` for tool/error messages.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/main/core/conversations/adapters/claude-json.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/core/conversations/adapters/claude-json.ts src/main/core/conversations/adapters/claude-json.test.ts
git commit -m "feat(chat): add Claude stream-json chat adapter"
```

---

## Task 5: Adapter registry

**Files:**
- Create: `src/main/core/conversations/adapters/index.ts`

- [ ] **Step 1: Write the registry**

```ts
// src/main/core/conversations/adapters/index.ts
import { getProvider, type AgentProviderId } from '@shared/agent-provider-registry';
import type { ChatMessage } from '@shared/chat';
import { adaptClaudeEvent, extractSessionId } from './claude-json';

export type ChatAdapter = {
  adapt: (raw: unknown, ctx: { conversationId: string; providerId: AgentProviderId }) => ChatMessage | null;
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
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/core/conversations/adapters/index.ts
git commit -m "feat(chat): add chat adapter registry"
```

---

## Task 6: Message persistence (TDD, main-db)

Reuse the existing unused `messages` table. Map `ChatMessage` → row: `sender` = role, `content` = first text block (or ''), `metadata` = JSON of the full message.

**Files:**
- Create: `src/main/core/conversations/messages/message-store.test.ts`
- Create: `src/main/core/conversations/messages/message-store.ts`

- [ ] **Step 1: Write the failing test** (follows the `main-db` integration pattern; uses the real test db harness)

```ts
// src/main/core/conversations/messages/message-store.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '@shared/chat';
import { db } from '@main/db/client';
import { conversations, messages, projects, tasks } from '@main/db/schema';
import { getChatMessages, insertChatMessage } from './message-store';

async function seedConversation(convId: string): Promise<void> {
  await db.insert(projects).values({ id: 'p1', name: 'P', path: '/tmp/p' }).onConflictDoNothing();
  await db.insert(tasks).values({ id: 't1', projectId: 'p1', name: 'T', branch: 'main' }).onConflictDoNothing();
  await db
    .insert(conversations)
    .values({ id: convId, projectId: 'p1', taskId: 't1', title: 'C', provider: 'claude' })
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
  beforeEach(async () => {
    await db.delete(messages);
  });

  it('round-trips a chat message', async () => {
    await seedConversation('conv-rt');
    await insertChatMessage(makeMessage('m1', 'conv-rt'));
    const loaded = await getChatMessages('conv-rt');
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ id: 'm1', role: 'assistant', blocks: [{ type: 'text', text: 'hi' }] });
  });

  it('returns messages for a conversation in insertion order', async () => {
    await seedConversation('conv-ord');
    await insertChatMessage(makeMessage('a', 'conv-ord'));
    await insertChatMessage(makeMessage('b', 'conv-ord'));
    const loaded = await getChatMessages('conv-ord');
    expect(loaded.map((m) => m.id)).toEqual(['a', 'b']);
  });
});
```

NOTE before running: confirm the exact required columns for `projects` and `tasks` inserts by reading `src/main/db/schema.ts`; adjust the seed `.values({...})` to satisfy NOT NULL columns. The schema is the source of truth — match it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --project main-db src/main/core/conversations/messages/message-store.test.ts`
Expected: FAIL (functions not defined).

- [ ] **Step 3: Implement the store**

```ts
// src/main/core/conversations/messages/message-store.ts
import { asc, eq } from 'drizzle-orm';
import type { ChatMessage } from '@shared/chat';
import { db } from '@main/db/client';
import { messages } from '@main/db/schema';

function firstText(message: ChatMessage): string {
  const block = message.blocks.find((b) => b.type === 'text');
  return block && block.type === 'text' ? block.text : '';
}

export async function insertChatMessage(message: ChatMessage): Promise<void> {
  await db
    .insert(messages)
    .values({
      id: message.id,
      conversationId: message.conversationId,
      content: firstText(message),
      sender: message.role,
      timestamp: message.createdAt,
      metadata: JSON.stringify(message),
    })
    .onConflictDoUpdate({
      target: messages.id,
      set: { content: firstText(message), metadata: JSON.stringify(message) },
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --project main-db src/main/core/conversations/messages/message-store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/core/conversations/messages/message-store.ts src/main/core/conversations/messages/message-store.test.ts
git commit -m "feat(chat): persist chat messages via existing messages table"
```

---

## Task 7: Headless turn runner (TDD)

A function that spawns the agent headless, parses NDJSON from stdout, calls the adapter per line, invokes `onMessage` for each produced `ChatMessage`, captures the provider session id, and resolves when the process closes. `spawn` is injected so it is unit-testable without a real CLI.

**Files:**
- Create: `src/main/core/conversations/impl/headless-runner.test.ts`
- Create: `src/main/core/conversations/impl/headless-runner.ts`

- [ ] **Step 1: Write the failing test** (fake spawn emits two NDJSON lines then closes)

```ts
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
    const spawn = vi.fn(() => fakeChild(['not json', JSON.stringify({ type: 'system', session_id: 'x' })]));
    const received: ChatMessage[] = [];
    const result = await runHeadlessTurn(
      { providerId: 'claude', conversationId: 'c1', command: 'claude', args: [], cwd: '/tmp', env: {} },
      { onMessage: (m) => received.push(m), spawn: spawn as never }
    );
    expect(received).toHaveLength(0);
    expect(result.sessionId).toBe('x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/main/core/conversations/impl/headless-runner.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the runner**

```ts
// src/main/core/conversations/impl/headless-runner.ts
import { spawn as nodeSpawn } from 'node:child_process';
import type { AgentProviderId } from '@shared/agent-provider-registry';
import type { ChatMessage } from '@shared/chat';
import { getChatAdapter } from '../adapters';

export type HeadlessTurnInput = {
  providerId: AgentProviderId;
  conversationId: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

export type HeadlessTurnOptions = {
  onMessage: (message: ChatMessage) => void;
  spawn?: typeof nodeSpawn;
};

export type HeadlessTurnResult = { sessionId: string | null };

export function runHeadlessTurn(
  input: HeadlessTurnInput,
  options: HeadlessTurnOptions
): Promise<HeadlessTurnResult> {
  const spawn = options.spawn ?? nodeSpawn;
  const adapter = getChatAdapter(input.providerId);

  return new Promise<HeadlessTurnResult>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: { ...process.env, ...input.env },
    });
    let buffer = '';
    let sessionId: string | null = null;

    const handleLine = (line: string): void => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return; // tolerate non-JSON noise
      }
      if (!adapter) return;
      sessionId ??= adapter.sessionId(parsed);
      const message = adapter.adapt(parsed, {
        conversationId: input.conversationId,
        providerId: input.providerId,
      });
      if (message) options.onMessage(message);
    };

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
    });
    child.on('error', reject);
    child.on('close', () => {
      if (buffer.trim()) handleLine(buffer);
      resolve({ sessionId });
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/main/core/conversations/impl/headless-runner.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/core/conversations/impl/headless-runner.ts src/main/core/conversations/impl/headless-runner.test.ts
git commit -m "feat(chat): add headless turn runner (NDJSON stream → chat messages)"
```

---

## Task 8: RPC — sendChatMessage & getChatMessages

Wire a turn: persist the user message, resolve the worktree cwd + command, run the turn (emitting + persisting assistant messages), and capture the provider session id.

**Files:**
- Create: `src/main/core/conversations/getChatMessages.ts`
- Create: `src/main/core/conversations/sendChatMessage.ts`
- Modify: `src/main/core/conversations/controller.ts`

- [ ] **Step 1: getChatMessages handler**

```ts
// src/main/core/conversations/getChatMessages.ts
import type { ChatMessage } from '@shared/chat';
import { getChatMessages as loadChatMessages } from './messages/message-store';

export async function getChatMessages(conversationId: string): Promise<ChatMessage[]> {
  return loadChatMessages(conversationId);
}
```

- [ ] **Step 2a: Pin the worktree-cwd resolver (read first, then write the helper)**

The turn must run in the task's worktree directory — the same `taskPath` the existing
`LocalConversationProvider` spawns in (`src/main/core/conversations/impl/local-conversation.ts:113`,
constructed with a `taskPath` passed in). Two confirmed facts to use:
- The worktree path is obtained via `project.worktreeService.getWorktree(task.taskBranch)`
  (see `src/main/core/tasks/operations/getDeletePreflight.ts:41`).
- `src/main/core/conversations/createConversation.ts` already obtains a `task` object whose
  provider holds `taskPath` and calls `task.conversations.startSession(...)`.

**Read `createConversation.ts` and follow how it gets the `task` (and thus the worktree path).**
Create a thin resolver that reuses that exact mechanism — do not invent a parallel one:

```ts
// src/main/core/conversations/impl/resolve-turn-cwd.ts
// Implement by mirroring how createConversation.ts obtains the task + its worktree path.
// Pseudostructure (replace the two lookups with the EXACT calls used in createConversation.ts):
import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { tasks } from '@main/db/schema';

export async function resolveTurnCwd(taskId: string): Promise<string> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new Error(`Task ${taskId} not found`);
  // Resolve via the SAME service createConversation.ts uses to reach a task's worktree path,
  // e.g. project.worktreeService.getWorktree(task.taskBranch). Return that absolute path.
  // If createConversation.ts resolves taskPath synchronously from an in-memory task store,
  // reuse that store instead of re-resolving here.
  throw new Error('Wire to the existing worktree resolution — see createConversation.ts');
}
```

Verify the actual column name for the task's branch (`taskBranch` vs `branch`) against
`src/main/db/schema.ts` before finishing.

- [ ] **Step 2b: sendChatMessage handler**

```ts
// src/main/core/conversations/sendChatMessage.ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getProvider, type AgentProviderId } from '@shared/agent-provider-registry';
import type { ChatMessage } from '@shared/chat';
import { parseConversationConfig } from '@shared/conversation-config';
import { chatMessageChannel } from '@shared/events/chatEvents';
import { db } from '@main/db/client';
import { conversations } from '@main/db/schema';
import { buildAgentEnv } from '@main/core/pty/pty-env';
import { events } from '@main/lib/events';
import { runHeadlessTurn } from './impl/headless-runner';
import { resolveTurnCwd } from './impl/resolve-turn-cwd';
import { insertChatMessage } from './messages/message-store';
import { saveProviderSessionId } from './save-provider-session-id';

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

  const providerId = (conv.provider ?? 'claude') as AgentProviderId;
  const providerDef = getProvider(providerId);
  if (!providerDef?.headlessArgs) throw new Error(`Provider ${providerId} has no headless mode`);

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

  // Resume support: reuse the existing per-conversation provider session id (stored in config).
  const priorSessionId = parseConversationConfig(conv.config).providerSessionId;
  const cwd = await resolveTurnCwd(params.taskId);

  const args = [...providerDef.headlessArgs];
  if (providerDef.autoApproveFlag) args.unshift(providerDef.autoApproveFlag);
  if (priorSessionId && providerDef.resumeFlag) args.push(providerDef.resumeFlag, priorSessionId);
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
        void insertChatMessage(message);
        events.emit(chatMessageChannel, {
          conversationId: params.conversationId,
          taskId: params.taskId,
          message,
        });
      },
    }
  );

  if (result.sessionId && result.sessionId !== priorSessionId) {
    await saveProviderSessionId(params.conversationId, result.sessionId).catch(() => {});
  }
}
```

NOTES:
- `events` from `@main/lib/events` — CONFIRMED (`src/main/lib/events.ts:23`; same emitter
  `save-provider-session-id.ts` uses).
- `parseConversationConfig` from `@shared/conversation-config` and `saveProviderSessionId`
  from `./save-provider-session-id` — CONFIRMED to exist and to hold/persist
  `providerSessionId` in `conversations.config`.
- `saveProviderSessionId` currently guards with `isDroidProviderSessionId(...)` and ignores
  non-Droid ids — **read it and relax/generalize that guard** so Claude session ids persist
  (or add a sibling writer for the chat path). This is required for multi-turn resume to work.

- [ ] **Step 3: Register both in the controller**

In `src/main/core/conversations/controller.ts`, add imports and entries:

```ts
import { getChatMessages } from './getChatMessages';
import { sendChatMessage } from './sendChatMessage';

export const conversationController = createRPCController({
  // ...existing entries...
  sendChatMessage,
  getChatMessages,
});
```

- [ ] **Step 4: Typecheck + run all main tests**

Run: `pnpm run typecheck && pnpm exec vitest run --project main-db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/core/conversations/getChatMessages.ts src/main/core/conversations/sendChatMessage.ts src/main/core/conversations/controller.ts src/main/core/conversations/impl/resolve-turn-cwd.ts src/main/core/conversations/save-provider-session-id.ts
git commit -m "feat(chat): add sendChatMessage/getChatMessages RPC with headless turns"
```

---

## Task 9: Renderer chat store (TDD)

Accumulates `ChatMessage`s per conversation from the `chat:message` event, upserting by id; loads history via RPC.

**Files:**
- Create: `src/renderer/features/tasks/conversations/chat/chat-store.test.ts`
- Create: `src/renderer/features/tasks/conversations/chat/chat-store.ts`

- [ ] **Step 1: Write the failing test** (node project; pure store, no IPC)

```ts
// src/renderer/features/tasks/conversations/chat/chat-store.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/renderer/features/tasks/conversations/chat/chat-store.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the store**

```ts
// src/renderer/features/tasks/conversations/chat/chat-store.ts
import { makeAutoObservable } from 'mobx';
import type { ChatMessage } from '@shared/chat';

export class ChatStore {
  readonly conversationId: string;
  messages: ChatMessage[] = [];

  constructor(conversationId: string) {
    this.conversationId = conversationId;
    makeAutoObservable(this);
  }

  upsert(message: ChatMessage): void {
    const idx = this.messages.findIndex((m) => m.id === message.id);
    if (idx >= 0) this.messages[idx] = message;
    else this.messages.push(message);
  }

  hydrate(messages: ChatMessage[]): void {
    this.messages = [...messages];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/renderer/features/tasks/conversations/chat/chat-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/tasks/conversations/chat/chat-store.ts src/renderer/features/tasks/conversations/chat/chat-store.test.ts
git commit -m "feat(chat): add renderer chat store"
```

---

## Task 10: CommandCard component (collapsible "Ran" card)

**Files:**
- Create: `src/renderer/features/tasks/conversations/chat/CommandCard.tsx`

- [ ] **Step 1: Implement** (uses existing `lib/ui` Collapsible + `cn`)

```tsx
// src/renderer/features/tasks/conversations/chat/CommandCard.tsx
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@renderer/utils/utils';

type Props = {
  command: string;
  output: string;
  exitCode?: number;
  running: boolean;
};

export function CommandCard({ command, output, exitCode, running }: Props) {
  const [open, setOpen] = useState(false);
  const failed = exitCode !== undefined && exitCode !== 0;

  return (
    <div className="my-1 rounded-md border border-foreground/10 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
      >
        <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
        <span className="text-muted-foreground">Ran</span>
        <code className="truncate font-mono">{command}</code>
        {running ? (
          <span className="ml-auto text-muted-foreground">…</span>
        ) : (
          <span className={cn('ml-auto', failed ? 'text-red-500' : 'text-green-500')}>
            {failed ? `exit ${exitCode}` : 'done'}
          </span>
        )}
      </button>
      {open && output ? (
        <pre className="max-h-64 overflow-auto border-t border-foreground/10 px-2 py-1.5 font-mono whitespace-pre-wrap">
          {output}
        </pre>
      ) : null}
    </div>
  );
}
```

Note: verify `cn` is exported from `@renderer/utils/utils` (it is used in `modal-renderer.tsx`). Confirm `lucide-react` `ChevronRight` import matches repo usage.

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/tasks/conversations/chat/CommandCard.tsx
git commit -m "feat(chat): add collapsible CommandCard"
```

---

## Task 11: ChatMessageList + ChatComposer + ChatPanel

**Files:**
- Create: `src/renderer/features/tasks/conversations/chat/ChatMessageList.tsx`
- Create: `src/renderer/features/tasks/conversations/chat/ChatComposer.tsx`
- Create: `src/renderer/features/tasks/conversations/chat/ChatPanel.tsx`

- [ ] **Step 1: ChatMessageList** (renders blocks; reuse existing `MarkdownRenderer` from `lib/ui` for text)

```tsx
// src/renderer/features/tasks/conversations/chat/ChatMessageList.tsx
import { observer } from 'mobx-react-lite';
import type { ChatBlock, ChatMessage } from '@shared/chat';
import { MarkdownRenderer } from '@renderer/lib/ui/markdown-renderer';
import { cn } from '@renderer/utils/utils';
import { CommandCard } from './CommandCard';

function Block({ block }: { block: ChatBlock }) {
  switch (block.type) {
    case 'text':
      return <MarkdownRenderer content={block.text} />;
    case 'command':
      return (
        <CommandCard
          command={block.command}
          output={block.output}
          exitCode={block.exitCode}
          running={block.running}
        />
      );
    case 'activity':
      return <div className="my-1 text-xs text-muted-foreground">{block.label}</div>;
    case 'tool_result':
      return null; // folded into the command card output in a later phase
    case 'diff':
      return <div className="my-1 text-xs text-muted-foreground">Edited {block.file}</div>;
    case 'plan':
      return (
        <ul className="my-1 text-sm">
          {block.steps.map((s, i) => (
            <li key={i} className={cn(s.done && 'text-muted-foreground line-through')}>
              {s.text}
            </li>
          ))}
        </ul>
      );
    case 'error':
      return <div className="my-1 text-sm text-red-500">{block.message}</div>;
    case 'tool_call':
      return <div className="my-1 text-xs text-muted-foreground">{block.name}</div>;
  }
}

export const ChatMessageList = observer(function ChatMessageList({
  messages,
}: {
  messages: ChatMessage[];
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {messages.map((m) => (
        <div
          key={m.id}
          className={cn(
            'rounded-lg px-3 py-2 text-sm',
            m.role === 'user' ? 'self-end bg-background-tertiary' : 'self-start'
          )}
        >
          {m.blocks.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </div>
      ))}
    </div>
  );
});
```

Verify the exact export name/props of `MarkdownRenderer` in `src/renderer/lib/ui/markdown-renderer.tsx` and adjust the prop name if it differs (e.g. `children` vs `content`).

- [ ] **Step 2: ChatComposer** (textarea + send + agent picker from installed providers)

```tsx
// src/renderer/features/tasks/conversations/chat/ChatComposer.tsx
import { useState } from 'react';
import { Button } from '@renderer/lib/ui/button';
import { Textarea } from '@renderer/lib/ui/textarea';

type Props = {
  disabled?: boolean;
  onSend: (text: string) => void;
};

export function ChatComposer({ disabled, onSend }: Props) {
  const [text, setText] = useState('');
  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };
  return (
    <div className="border-t border-foreground/10 p-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask the agent to build, fix bugs, explore"
        rows={3}
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" disabled={disabled} onClick={submit}>
          Send
        </Button>
      </div>
    </div>
  );
}
```

Verify `Button` and `Textarea` export names/props in `src/renderer/lib/ui/`. The agent/model picker is added in a follow-up step once this renders; for v1 the conversation's existing provider is used.

- [ ] **Step 3: ChatPanel** (wires store, event subscription, history hydration, RPC send)

```tsx
// src/renderer/features/tasks/conversations/chat/ChatPanel.tsx
import { observer } from 'mobx-react-lite';
import { useEffect, useMemo } from 'react';
import { chatMessageChannel } from '@shared/events/chatEvents';
import { events, rpc } from '@renderer/lib/ipc';
import { ChatComposer } from './ChatComposer';
import { ChatMessageList } from './ChatMessageList';
import { ChatStore } from './chat-store';

type Props = {
  conversationId: string;
  taskId: string;
};

export const ChatPanel = observer(function ChatPanel({ conversationId, taskId }: Props) {
  const store = useMemo(() => new ChatStore(conversationId), [conversationId]);

  useEffect(() => {
    let active = true;
    void rpc.conversations.getChatMessages(conversationId).then((msgs) => {
      if (active) store.hydrate(msgs);
    });
    const off = events.on(chatMessageChannel, ({ conversationId: id, message }) => {
      if (id === conversationId) store.upsert(message);
    });
    return () => {
      active = false;
      off();
    };
  }, [conversationId, store]);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <ChatMessageList messages={store.messages} />
      </div>
      <ChatComposer
        onSend={(text) => {
          void rpc.conversations.sendChatMessage({ conversationId, taskId, text });
        }}
      />
    </div>
  );
});
```

- [ ] **Step 4: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/tasks/conversations/chat/ChatMessageList.tsx src/renderer/features/tasks/conversations/chat/ChatComposer.tsx src/renderer/features/tasks/conversations/chat/ChatPanel.tsx
git commit -m "feat(chat): add ChatPanel, message list, composer"
```

---

## Task 12: Wire the feature-flag seam in conversations-panel

Render `<ChatPanel>` instead of `<PtyPane>` when `chat-ui` is on. The terminal path stays exactly as-is when off.

**Files:**
- Modify: `src/renderer/features/tasks/conversations/conversations-panel.tsx`

- [ ] **Step 1: Add the flag + ChatPanel branch**

At the top of `ConversationsPanel`, add:

```tsx
import { useFeatureFlag } from '@renderer/lib/hooks/useFeatureFlag';
import { ChatPanel } from './chat/ChatPanel';
```

Inside the component (after `taskId` is available), add:

```tsx
const chatUiEnabled = useFeatureFlag('chat-ui');
```

Then wrap the existing terminal render. Replace the existing seam (the block currently rendering `<PtyPane>` — around lines 102-124) so that when the flag is on and there is an active conversation, the chat panel renders instead:

```tsx
{chatUiEnabled && activeConversation ? (
  <ChatPanel conversationId={activeConversation.data.id} taskId={taskId} />
) : activeSessionId && activeSession?.status === 'ready' && activeSession.pty ? (
  <div ref={terminalContainerRef} className="relative flex h-full min-h-0 flex-1">
    <TerminalSearchOverlay /* keep existing props */ />
    <PtyPane
      ref={terminalRef}
      sessionId={activeSessionId}
      pty={activeSession.pty}
      className="h-full w-full"
      onInterruptPress={onInterruptPress}
      mapShiftEnterToCtrlJ
      remoteConnectionId={remoteConnectionId}
    />
  </div>
) : null}
```

Keep the existing `<PaneSizingProvider>` / `<ContextBar>` wrappers unchanged. Match the surrounding JSX exactly (copy the real `TerminalSearchOverlay` props from the current file — do not drop any).

- [ ] **Step 2: Typecheck + lint + format**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/tasks/conversations/conversations-panel.tsx
git commit -m "feat(chat): render ChatPanel behind chat-ui flag"
```

---

## Task 13: Manual + Playwright end-to-end verification

This is the development-time verification (the "tester" from the brainstorm). Requires Claude Code (`claude`) installed and authenticated on the machine.

- [ ] **Step 1: Run the app with the flag on**

```bash
FLAG_CHAT_UI=true pnpm run dev
```

- [ ] **Step 2: Manual smoke**

Open a project → open a task → start/open a conversation with provider **Claude Code**. Confirm:
- The pane shows the chat UI (composer + empty list), NOT a terminal.
- Typing a prompt ("list the files in this repo") and pressing Enter shows a user bubble, then assistant text, and any `Bash`/tool runs appear as collapsible "Ran …" cards.
- With `FLAG_CHAT_UI` unset, the same conversation still shows the terminal (regression check).

- [ ] **Step 3: Playwright assertion (drive the real Electron renderer)**

Use the Playwright MCP browser tools to load the running renderer, locate the composer (`placeholder="Ask the agent to build, fix bugs, explore"`), type a prompt, send, and assert a user bubble + an assistant message appear. Capture a screenshot for the record. (If driving Electron directly is not possible, assert against the renderer dev URL.)

- [ ] **Step 4: Full merge gate**

```bash
pnpm run format && pnpm run lint && pnpm run typecheck && pnpm run test
```
Expected: all PASS.

- [ ] **Step 5: Dispatch a code-review subagent (the "verifier")**

Request a review of the full diff against the spec (`docs/superpowers/specs/2026-06-01-unified-chat-interface-design.md`), focusing on: no weakening of PTY/env-allowlist/shell-escaping, correct MobX selector usage, no `any` leaks, RPC registration correctness, and that the terminal path is untouched when the flag is off. Address findings before merge.

- [ ] **Step 6: Commit any review fixes**

```bash
git add -A && git commit -m "fix(chat): address review findings"
```

---

## Notes carried forward to later phases (NOT in this plan)
- **Raw fallback adapter** for non-structured agents (Phase 2).
- **Codex / cursor-agent / Gemini / opencode adapters** (Phase 3).
- **In-chat agent/model picker**, token-level streaming, plan/diff cards, inline approve/reject, hiding standalone terminal tabs app-wide, checkpoint/rollback (Phase 4).
- **Token-by-token streaming**: Claude `stream-json` here emits whole messages per event; partial streaming uses `--include-partial-messages` and `text-delta` blocks — deferred.
