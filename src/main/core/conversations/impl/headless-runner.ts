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

    if (child.stdout && 'setEncoding' in child.stdout) {
      (child.stdout as { setEncoding: (enc: string) => void }).setEncoding('utf8');
    }
    child.stdout?.on('data', (chunk: Buffer | string) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
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
