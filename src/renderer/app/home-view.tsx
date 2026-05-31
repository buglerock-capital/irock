import { ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { EmdashShimmerLogo } from '@renderer/lib/emdash-shimmer-logo';
import { useTheme } from '@renderer/lib/hooks/useTheme';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import { Textarea } from '@renderer/lib/ui/textarea';

const CHIPS = [
  'Summarize a document',
  'Help me write something',
  'Plan a project',
  'Explore an idea',
] as const;

export function HomeTitlebar() {
  return <Titlebar />;
}

export function HomeMainPanel() {
  const showAddProjectModal = useShowModal('addProjectModal');
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'emdark';

  const [text, setText] = useState('');

  const submit = () => {
    // Open the Add Workspace modal so the user picks a folder to start working.
    // Forwarding the typed prompt into an actual agent run is a follow-up (R5+).
    showAddProjectModal({});
  };

  const fillChip = (chip: string) => {
    setText(chip);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background text-foreground">
      <div className="container mx-auto flex min-h-full max-w-2xl flex-1 flex-col items-center justify-center px-8 py-12">
        {/* Logo mark */}
        <div className="mb-6 flex items-center justify-center">
          <EmdashShimmerLogo
            height={24}
            color={isDark ? 'var(--color-background-2)' : 'var(--color-foreground)'}
            shimmerColor={isDark ? 'white' : 'var(--color-foreground-passive)'}
          />
        </div>

        {/* Heading */}
        <h1 className="mb-1 text-center text-2xl font-medium tracking-tight text-foreground">
          What can I do today?
        </h1>
        <p className="mb-8 text-center text-sm text-foreground-muted">
          Ask Rocky to build, write, research, or explore.
        </p>

        {/* Composer */}
        <div className="w-full rounded-xl border border-border bg-background shadow-sm transition-shadow focus-within:shadow-md">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask Rocky anything…"
            rows={3}
            className="resize-none rounded-xl border-0 bg-transparent px-4 pt-4 pb-2 shadow-none focus-visible:border-0 focus-visible:ring-0"
          />
          <div className="flex items-center justify-end px-3 pb-3">
            <Button size="icon-sm" onClick={submit} disabled={!text.trim()} aria-label="Send">
              <ArrowUp />
            </Button>
          </div>
        </div>

        {/* Example chips */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => fillChip(chip)}
              className="rounded-full border border-border bg-background-1 px-3 py-1.5 text-xs text-foreground-muted transition-colors hover:border-border-1 hover:text-foreground"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Subtle secondary link */}
        <button
          type="button"
          onClick={() => showAddProjectModal({})}
          className="mt-8 text-xs text-foreground-tertiary-passive underline-offset-2 hover:text-foreground-muted hover:underline"
        >
          Open a folder as a workspace
        </button>
      </div>
    </div>
  );
}

export const homeView = {
  TitlebarSlot: HomeTitlebar,
  MainPanel: HomeMainPanel,
};
