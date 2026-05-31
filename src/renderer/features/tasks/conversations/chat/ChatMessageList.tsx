import { observer } from 'mobx-react-lite';
import React from 'react';
import { MarkdownRenderer } from '@renderer/lib/ui/markdown-renderer';
import { cn } from '@renderer/utils/utils';
import type { ChatBlock, ChatMessage } from '@shared/chat';
import { CommandCard } from './CommandCard';

function Block({ block }: { block: ChatBlock }): React.ReactNode {
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
      return <div className="my-1 text-xs text-foreground-muted">{block.label}</div>;
    case 'tool_result':
      return null;
    case 'diff':
      return <div className="my-1 text-xs text-foreground-muted">Edited {block.file}</div>;
    case 'plan':
      return (
        <ul className="my-1 text-sm">
          {block.steps.map((s, i) => (
            <li key={i} className={cn(s.done && 'text-foreground-muted line-through')}>
              {s.text}
            </li>
          ))}
        </ul>
      );
    case 'error':
      return <div className="text-destructive my-1 text-sm">{block.message}</div>;
    case 'tool_call':
      return <div className="my-1 text-xs text-foreground-muted">{block.name}</div>;
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
