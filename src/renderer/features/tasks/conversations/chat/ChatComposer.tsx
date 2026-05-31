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
