import { ChevronRight, SquareChevronRight } from 'lucide-react';
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
    <div className="py-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <SquareChevronRight className="size-3.5 shrink-0 text-foreground-muted" />
        <span className="text-xs text-foreground-muted">Ran</span>
        <code className="truncate font-mono text-xs text-foreground-muted">{command}</code>
        {running ? (
          <span className="ml-auto text-xs text-foreground-muted">…</span>
        ) : (
          <span
            className={cn(
              'ml-auto text-xs',
              failed ? 'text-destructive' : 'text-foreground-muted/70'
            )}
          >
            {failed ? `exit ${exitCode}` : ''}
          </span>
        )}
        <ChevronRight
          className={cn(
            'size-3 shrink-0 text-foreground-muted/50 transition-transform',
            open && 'rotate-90'
          )}
        />
      </button>
      {open && output ? (
        <pre className="mt-1 max-h-64 overflow-auto rounded-md border border-foreground/10 bg-background-tertiary px-2 py-1.5 font-mono text-xs whitespace-pre-wrap">
          {output}
        </pre>
      ) : null}
    </div>
  );
}
