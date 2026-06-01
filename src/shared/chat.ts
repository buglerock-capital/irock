// src/shared/chat.ts
import type { AgentProviderId } from '@shared/agent-provider-registry';

export type ChatRole = 'user' | 'assistant' | 'tool';

export type ChatMessageStatus = 'streaming' | 'complete' | 'error';

export type ChatBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; ok: boolean; output: string }
  | { type: 'command'; command: string; output: string; exitCode?: number; running: boolean }
  | { type: 'activity'; label: string }
  | { type: 'plan'; steps: { text: string; done: boolean }[] }
  | { type: 'diff'; file: string; patch: string }
  | { type: 'error'; message: string };

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: ChatRole;
  providerId: AgentProviderId;
  blocks: ChatBlock[];
  status: ChatMessageStatus;
  createdAt: string;
};
