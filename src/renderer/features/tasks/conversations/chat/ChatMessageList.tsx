import { FileText, Pencil, SquareChevronRight } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { MarkdownRenderer } from '@renderer/lib/ui/markdown-renderer';
import { cn } from '@renderer/utils/utils';
import { getProvider, type AgentProviderId } from '@shared/agent-provider-registry';
import type { ChatBlock, ChatMessage } from '@shared/chat';
import { CommandCard } from './CommandCard';

// ── Activity line ──────────────────────────────────────────────────────────────

function ActivityLine({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Icon className="size-3.5 shrink-0 text-foreground-muted" />
      <span className="text-xs text-foreground-muted">{children}</span>
    </div>
  );
}

// ── Block renderer ─────────────────────────────────────────────────────────────

function Block({ block }: { block: ChatBlock }): React.ReactNode {
  switch (block.type) {
    case 'text':
      return (
        <div className="text-sm leading-relaxed text-foreground">
          <MarkdownRenderer content={block.text} />
        </div>
      );
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
      return <ActivityLine icon={FileText}>{block.label}</ActivityLine>;
    case 'tool_result':
      return null;
    case 'diff':
      return (
        <ActivityLine icon={Pencil}>
          Edited <span className="font-mono">{block.file}</span>
        </ActivityLine>
      );
    case 'plan':
      return (
        <ul className="my-1 space-y-0.5">
          {block.steps.map((s, i) => (
            <li
              key={i}
              className={cn(
                'flex items-start gap-1.5 text-xs text-foreground-muted',
                s.done && 'line-through'
              )}
            >
              <span className="mt-px shrink-0">{s.done ? '☑' : '☐'}</span>
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      );
    case 'error':
      return <div className="text-destructive my-1 text-sm">{block.message}</div>;
    case 'tool_call':
      return <ActivityLine icon={SquareChevronRight}>{block.name}</ActivityLine>;
  }
}

// ── Model chip ─────────────────────────────────────────────────────────────────

function ModelChip({ providerId }: { providerId: AgentProviderId | null }) {
  const provider = providerId ? getProvider(providerId) : null;
  const name = provider?.name ?? 'Claude';

  return (
    <div className="flex items-center justify-center py-2">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-foreground/10 px-2 py-1 text-xs text-foreground-muted">
        {name}
      </span>
    </div>
  );
}

// ── Message row ────────────────────────────────────────────────────────────────

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="rounded-lg bg-background-tertiary px-4 py-3 text-sm text-foreground">
      {message.blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="space-y-1">
      {message.blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

// ── Main list ──────────────────────────────────────────────────────────────────

export const ChatMessageList = observer(function ChatMessageList({
  messages,
  providerId,
}: {
  messages: ChatMessage[];
  providerId: AgentProviderId | null;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-24">
      <ModelChip providerId={providerId} />
      <div className="space-y-4">
        {messages.map((m) =>
          m.role === 'user' ? (
            <UserMessage key={m.id} message={m} />
          ) : (
            <AssistantMessage key={m.id} message={m} />
          )
        )}
      </div>
    </div>
  );
});
