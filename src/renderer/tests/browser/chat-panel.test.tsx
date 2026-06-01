/**
 * Browser-mode test for ChatPanel.
 *
 * Runs in real Chromium via Playwright so React rendering, MobX reactivity,
 * and DOM interactions work as in production. The Electron IPC layer is mocked
 * so no backend is required.
 */
import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react/pure';
import { ChatPanel } from '@renderer/features/tasks/conversations/chat/ChatPanel';
import type { ChatMessage } from '@shared/chat';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// vi.hoisted runs before vi.mock factories so the spies are in scope for both.

const mocks = vi.hoisted(() => {
  // Holds the callback passed to events.on so tests can fire synthetic events.
  let capturedChatCb:
    | ((payload: { conversationId: string; taskId: string; message: ChatMessage }) => void)
    | null = null;

  const getChatMessages = vi.fn().mockResolvedValue([]);
  const sendChatMessage = vi.fn().mockResolvedValue(undefined);
  const eventsOn = vi
    .fn()
    .mockImplementation((_channel: unknown, cb: (payload: unknown) => void) => {
      capturedChatCb = cb as typeof capturedChatCb;
      return vi.fn(); // unsubscribe stub
    });

  return {
    getChatMessages,
    sendChatMessage,
    eventsOn,
    getCapturedChatCb: () => capturedChatCb,
    resetCapturedChatCb: () => {
      capturedChatCb = null;
    },
  };
});

// ── Mock @renderer/lib/ipc ────────────────────────────────────────────────────

vi.mock('@renderer/lib/ipc', () => ({
  rpc: {
    conversations: {
      getChatMessages: mocks.getChatMessages,
      sendChatMessage: mocks.sendChatMessage,
    },
  },
  events: {
    on: mocks.eventsOn,
  },
}));

// ── Mock MarkdownRenderer to avoid ThemeProvider dependency ───────────────────
// ChatMessageList renders MarkdownRenderer which requires ThemeContext. We
// replace it with a plain <span> so the test doesn't need the full provider tree.

vi.mock('@renderer/lib/ui/markdown-renderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) =>
    React.createElement('span', null, content),
}));

// ── Mock task-view-context to avoid TaskViewContext provider requirement ───────

vi.mock('@renderer/features/tasks/task-view-context', () => ({
  useTaskViewContext: () => ({ projectId: 'p1', taskId: 't1', workspaceId: null }),
}));

// ── Mock project-selectors to return no SSH connection (local workspace) ──────

vi.mock('@renderer/features/projects/stores/project-selectors', () => ({
  getProjectSshConnectionId: () => undefined,
}));

// ── Mock useEffectiveProvider to return a stable provider ────────────────────

vi.mock('@renderer/features/tasks/conversations/use-effective-provider', () => ({
  useEffectiveProvider: () => ({
    providerId: 'claude' as const,
    setProviderOverride: vi.fn(),
    createDisabled: false,
  }),
}));

// ── Mock AgentSelector to a simple label (avoids combobox/dependency chain) ──

vi.mock('@renderer/lib/components/agent-selector/agent-selector', () => ({
  AgentSelector: ({ value }: { value: string | null }) =>
    React.createElement('div', { 'data-testid': 'agent-selector' }, value ?? 'No agent'),
}));

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ChatPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.resetCapturedChatCb();
  });

  it('sends a user message via RPC from the empty launcher and renders the echoed user bubble', async () => {
    const screen = await render(<ChatPanel conversationId="c1" taskId="t1" />);

    // The empty launcher is shown when there are no messages.
    // Its textarea has a different placeholder than the bottom composer.
    const textarea = screen.getByPlaceholder('Ask Rocky to build, fix bugs, explore');
    await textarea.fill('hello');

    // Click the send button (ArrowUp icon, aria-label="Send").
    const sendButton = screen.getByRole('button', { name: 'Send' });
    await sendButton.click();

    // The RPC call should have been made with the chosen provider.
    expect(mocks.sendChatMessage).toHaveBeenCalledWith({
      conversationId: 'c1',
      taskId: 't1',
      text: 'hello',
      provider: 'claude',
    });

    // Simulate the backend echoing the user message via the chat event.
    const cb = mocks.getCapturedChatCb();
    expect(cb, 'events.on callback must have been captured on mount').not.toBeNull();

    await act(async () => {
      cb!({
        conversationId: 'c1',
        taskId: 't1',
        message: {
          id: 'm-user-1',
          conversationId: 'c1',
          role: 'user',
          providerId: 'claude',
          blocks: [{ type: 'text', text: 'hello' }],
          status: 'complete',
          createdAt: new Date().toISOString(),
        },
      });
    });

    // The user bubble should now be visible.
    await expect.element(screen.getByText('hello')).toBeVisible();
  });

  it('renders an assistant message pushed via the chat event', async () => {
    const screen = await render(<ChatPanel conversationId="c1" taskId="t1" />);

    const cb = mocks.getCapturedChatCb();
    expect(cb, 'events.on callback must have been captured on mount').not.toBeNull();

    // Simulate a streamed assistant message.
    await act(async () => {
      cb!({
        conversationId: 'c1',
        taskId: 't1',
        message: {
          id: 'm1',
          conversationId: 'c1',
          role: 'assistant',
          providerId: 'claude',
          blocks: [{ type: 'text', text: 'world' }],
          status: 'complete',
          createdAt: new Date().toISOString(),
        },
      });
    });

    await expect.element(screen.getByText('world')).toBeVisible();
  });
});
