import { ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@renderer/utils/utils';

type Props = {
  disabled?: boolean;
  onSend: (text: string) => void;
};

export function FollowUpComposer({ disabled, onSend }: Props) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div className="absolute bottom-4 left-1/2 w-[min(640px,90%)] -translate-x-1/2">
      <div className="flex items-end gap-2 rounded-xl border border-foreground/10 bg-background-tertiary/95 px-3 py-2.5 shadow-lg backdrop-blur">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Give Rocky a follow-up instruction…"
          rows={1}
          className={cn(
            'min-h-[1.5rem] flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-foreground-muted/60',
            'focus:outline-none',
            'leading-relaxed'
          )}
          style={{ fieldSizing: 'content' } as React.CSSProperties}
        />
        <button
          type="button"
          disabled={!text.trim() || disabled}
          onClick={submit}
          aria-label="Send follow-up"
          className={cn(
            'mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-full transition-colors',
            text.trim() && !disabled
              ? 'bg-foreground text-background hover:bg-foreground/80'
              : 'bg-foreground/10 text-foreground-muted cursor-not-allowed'
          )}
        >
          <ArrowUp className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
