import { ArrowUp } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getProjectSshConnectionId } from '@renderer/features/projects/stores/project-selectors';
import { useEffectiveProvider } from '@renderer/features/tasks/conversations/use-effective-provider';
import { useTaskViewContext } from '@renderer/features/tasks/task-view-context';
import { AgentSelector } from '@renderer/lib/components/agent-selector/agent-selector';
import { events, rpc } from '@renderer/lib/ipc';
import { Button } from '@renderer/lib/ui/button';
import { Textarea } from '@renderer/lib/ui/textarea';
import type { AgentProviderId } from '@shared/agent-provider-registry';
import { chatMessageChannel } from '@shared/events/chatEvents';
import { ChatStore } from './chat-store';
import { ChatComposer } from './ChatComposer';
import { ChatMessageList } from './ChatMessageList';

type Props = {
  conversationId: string;
  taskId: string;
};

const EXAMPLE_CHIPS = ['Write documentation', 'Optimize performance', 'Find and fix bugs'];

type LauncherProps = {
  conversationId: string;
  taskId: string;
  selectedProvider: AgentProviderId | null;
  onProviderChange: (id: AgentProviderId) => void;
  connectionId: string | undefined;
};

function ChatEmptyLauncher({
  conversationId,
  taskId,
  selectedProvider,
  onProviderChange,
  connectionId,
}: LauncherProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = (overrideText?: string) => {
    const trimmed = (overrideText ?? text).trim();
    if (!trimmed) return;
    void rpc.conversations.sendChatMessage({
      conversationId,
      taskId,
      text: trimmed,
      provider: selectedProvider ?? undefined,
    });
    setText('');
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-[640px]">
        {/* Greeting */}
        <p className="mb-4 text-center text-sm text-foreground-muted">Welcome back</p>

        {/* Main box */}
        <div className="rounded-xl border border-foreground/10 bg-background-tertiary p-3">
          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask Rocky to build, fix bugs, explore"
            rows={3}
            className="border-none bg-transparent px-1 shadow-none focus-visible:border-none focus-visible:ring-0"
          />

          {/* Bottom row: agent picker (left) + send button (right) */}
          <div className="mt-2 flex items-center justify-between">
            <div className="w-44 min-w-0">
              <AgentSelector
                value={selectedProvider}
                onChange={onProviderChange}
                connectionId={connectionId}
                className="h-8 text-xs"
              />
            </div>
            <Button
              size="icon"
              disabled={!text.trim()}
              onClick={() => submit()}
              className="rounded-full"
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>

        {/* Example chips */}
        <div className="mt-4 flex flex-col items-center gap-3">
          <p className="text-xs text-foreground-muted">Try these examples to get started</p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => submit(chip)}
                className="rounded-full border border-foreground/10 bg-background-tertiary px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:border-foreground/20 hover:bg-background-2 hover:text-foreground"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export const ChatPanel = observer(function ChatPanel({ conversationId, taskId }: Props) {
  // Resolve connection ID for the current project (undefined for local workspaces).
  const { projectId } = useTaskViewContext();
  const connectionId = getProjectSshConnectionId(projectId);

  // Effective provider selection — lifted so both the empty launcher and the
  // bottom composer share the same model choice.
  const { providerId, setProviderOverride } = useEffectiveProvider(connectionId);

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

  const isEmpty = store.messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        {isEmpty ? (
          <ChatEmptyLauncher
            conversationId={conversationId}
            taskId={taskId}
            selectedProvider={providerId}
            onProviderChange={setProviderOverride}
            connectionId={connectionId}
          />
        ) : (
          <ChatMessageList messages={store.messages} />
        )}
      </div>
      {!isEmpty && (
        <ChatComposer
          onSend={(text) => {
            void rpc.conversations.sendChatMessage({
              conversationId,
              taskId,
              text,
              provider: providerId ?? undefined,
            });
          }}
        />
      )}
    </div>
  );
});
