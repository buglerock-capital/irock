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
        <span className="text-foreground-muted">Ran</span>
        <code className="truncate font-mono">{command}</code>
        {running ? (
          <span className="ml-auto text-foreground-muted">…</span>
        ) : (
          <span className={cn('ml-auto', failed ? 'text-destructive' : 'text-green-500')}>
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
