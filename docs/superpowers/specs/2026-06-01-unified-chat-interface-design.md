# Design: Unified Chat Interface (replace agent terminal with Cursor-style chat)

- **Date:** 2026-06-01
- **Status:** Approved (pending spec review)
- **Author:** brainstorming session

## 1. Goal & Scope

Replace the agent **terminal/TUI rendering** in Emdash with a single **Cursor-style chat
interface** that becomes the universal surface for every agent conversation. The
agent/model picker moves *into* the chat. This is framed as an upgrade: **there is no
terminal anywhere in the user-facing UI** — not the agent TUI, and not the standalone
terminal tabs. All agent interaction, including the commands the agent runs, is abstracted
into chat. Command and tool executions surface as compact, collapsible **activity cards**
(Cursor / Replit style: *"Ran `npm test`"*, *"Edited `db/schema.ts`"*) with their output
hidden by default and expandable on click.

To work across Emdash's existing agent fleet, the feature is **hybrid**:

- **Structured chat** for agents with a usable headless/JSON output mode (start: Claude
  Code; then Codex, cursor-agent, Gemini, opencode). Messages, tool calls, plans, file
  edits, and approval prompts render as native chat elements.
- **Raw fallback** for TUI-only agents: their output is ANSI-stripped and folded into
  assistant text bubbles, so every installed agent works in chat from day one.

Everything ships behind a `chatUi` feature flag so the existing terminal path stays
intact until the chat path is proven.

### Reference

UI inspiration is Cursor's "Agents" web experience (captured via Mobbin): a centered
prompt composer, inline model picker, repository/branch context, example prompt chips, a
left rail of agent sessions, and a structured plan/checklist output view with a pinned
follow-up input and PR actions.

### Non-goals (v1)

- **Verifier/tester agents are out of product scope.** They refer to the *development-time*
  validation of this feature (reviewer subagent + Playwright driving the real app), not a
  product capability.
- Not all 32 providers get bespoke structured adapters in v1 — uncovered agents use the
  raw fallback.

Note: **standalone terminal tabs are removed from the user-facing UI** (see §7). PTY
processes still run under the hood — the agent must execute commands — but the user never
sees a raw terminal; command runs appear only as collapsible activity cards in chat.

## 2. Background: current architecture (confirmed in code)

- Every agent (Claude Code, Codex, cursor-agent, all 32) is defined in
  `src/shared/agent-provider-registry.ts` and currently carries `terminalOnly: true`.
- Agents are spawned as **interactive TUIs inside a PTY**
  (`src/main/core/conversations/impl/local-conversation.ts`,
  `agent-command.ts`, `keystroke-injection.ts`). The initial prompt is delivered via a CLI
  flag, keystroke injection, or stdin pipe depending on the provider.
- The renderer renders the session as a **raw xterm terminal**:
  `ConversationsPanel` → `PtyPane`. There is **no structured chat UI anywhere**, and **no
  use of any agent's structured/JSON output mode**.
- Agent output is parsed into coarse events by classifiers
  (`src/main/core/agent-hooks/classifiers/`, e.g. `cursor.ts`) — notifications like
  `permission_prompt`, `idle_prompt`, `auth_success` — but not into a full transcript.
- Conversations are persisted per `src/shared/conversations.ts`; the renderer manages
  session lifecycle/hydration via the conversation stores
  (`conversation-registry`, `conversation-hydration-reconciler`,
  `conversation-manager`).

The requirement ("no terminal; everything is chat") therefore forces a change to the
**spawn model**, not just the renderer. This is a substantial change to the agent core,
not a UI-only skin.

## 3. Architecture

```
                        ┌─ structured adapter (claude/codex/cursor/gemini/opencode) ─┐
spawn agent headless ──▶│  parse native JSON  → common ChatEvent stream             │──▶ events bus ──▶ Chat UI
  (new spawn path)      └─ raw adapter (TUI agents): ANSI-strip → assistant bubble  ─┘     (typed)      (renderer)
```

**Reused unchanged:** typed RPC + event bus (`shared/ipc/`), conversation
lifecycle/hydration stores, dependency store (installed agents → picker), markdown/diff
renderers (`lib/ui/markdown-renderer`, Monaco diff), modal/command infrastructure, PTY
spawn primitives (env allowlist in `pty-env.ts`, shell escaping — not weakened).

**New:** headless spawn path, common chat-event model, per-provider adapters, the Chat UI
panel, follow-up/turn handling, a `messages` persistence table.

## 4. Components

### 4a. Provider metadata extension

File: `src/shared/agent-provider-registry.ts`. Add per-provider fields:

- `chatAdapter?: 'claude-json' | 'codex-json' | 'cursor-json' | 'gemini-json' | 'raw'`
  (unset → `'raw'`).
- `headlessArgs?: string[]` — args to run the agent non-interactively in structured mode
  (e.g. Claude Code: `['-p', '--output-format', 'stream-json', '--verbose']`). Exact flags
  per agent verified during implementation.
- `supportsFollowup?: boolean` — true if the agent accepts further turns on stdin in the
  same process; false means each follow-up is a resumed run.

No provider is removed; agents without a structured adapter keep working via raw fallback
and (when the flag is off) the existing terminal path.

### 4b. Common chat-event model

File: `src/shared/chat.ts` (new). Canonical types every adapter emits and the UI renders:

```
type ChatBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; ok: boolean; output: string }
  | { type: 'command'; command: string; output: string; exitCode?: number; running: boolean }
  | { type: 'activity'; label: string }            // e.g. "Took a screenshot", "Presented results"
  | { type: 'plan'; steps: { text: string; done: boolean }[] }
  | { type: 'diff'; file: string; patch: string }
  | { type: 'error'; message: string };

type ChatMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'tool';
  blocks: ChatBlock[];
  status: 'streaming' | 'complete' | 'error';
  createdAt: string;
};
```

Adapters emit incremental updates (append text, add block, mark complete) over the typed
event bus keyed by conversation id.

### 4c. Headless spawn + adapters

Files: `src/main/core/conversations/impl/headless-conversation.ts` (new),
`src/main/core/conversations/adapters/` (new):

- **Structured path:** spawn the agent with `headlessArgs`, read NDJSON from stdout, run
  the provider's adapter to translate native JSON → `ChatMessage` events, emit on the bus.
- **Raw path:** spawn as today (PTY), capture output chunks, ANSI-strip, stream as
  assistant `text` blocks. This is the fallback adapter (`raw-passthrough.ts`).
- **Approvals:** a permission/approval request (a structured event, or a classifier
  `permission_prompt`) surfaces as an inline **Approve / Reject** affordance in the UI. The
  response is written back to the agent (stdin / keystroke); the existing auto-approve
  flags remain the fallback behavior.
- Adapters registered in a map keyed by provider id; unknown → raw.

PTY/spawn safety: this path uses the existing spawn primitives and the `pty-env.ts`
allowlist. Shell escaping and env passthrough are not weakened. Treated as high-risk per
`AGENTS.md`; the matching `agents/risky-areas/pty.md` is read before editing.

### 4d. Messages persistence

A new `messages` table keyed by conversation id, created via `pnpm run db:generate`
(no hand-editing of numbered migrations or `drizzle/meta/`). Messages hydrate on
conversation open, mirroring today's session rehydration. Fixtures and migration tests
updated (`pnpm run db:fixtures`, `pnpm run test:migrations`).

### 4e. Chat UI (renderer)

Files: `src/renderer/features/tasks/conversations/chat/` (new). Replaces `PtyPane` inside
`ConversationsPanel` when `chatUi` is on:

- **Message list:** user/assistant bubbles; **collapsible command/activity cards** (a
  one-line summary like *"Ran `npm test`"* or *"Edited `db/schema.ts`"*, output hidden by
  default, expand-on-click, with a running/exit-code indicator); plan checklist; file-edit /
  diff cards (reuse Monaco diff); inline approve/reject; error states. This is the
  mechanism that replaces the terminal: the user never sees raw PTY output, only these
  abstracted cards.
- **Composer:** prompt textarea + send; **agent/model picker** populated from the
  dependency store (installed agents only); example prompt chips.
- **Status indicator:** reuse existing `AgentStatus`
  (`idle | working | awaiting-input | error | completed`).

Follows renderer conventions: MobX selectors for store access, typed RPC for calls, typed
events for streaming updates, new components in `features/`, registry-driven where
relevant.

### 4f. Follow-ups / multi-turn

- `supportsFollowup` agents: the composer's new prompt is written to the live session's
  stdin via an RPC (`conversations.sendMessage`).
- Otherwise: each follow-up is a **resumed run** using the registry's existing
  `resumeFlag` + `sessionIdFlag`. This is the trickiest area and is spiked on Claude Code
  first.

## 5. Data flow (one turn)

User types in composer → RPC `conversations.sendMessage` → main writes the prompt to the
agent (initial spawn, or stdin/resume) → agent emits JSON/output → adapter normalizes to
`ChatMessage` events → events stream on the bus → renderer appends/updates bubbles live →
messages persisted to the `messages` table.

## 6. Error handling

- Adapter parse failure → degrade that turn to a raw `text` bubble; never crash the chat.
- Agent process crash → existing respawn logic; surfaced as an `error` block with a retry
  affordance.
- CLI not installed → the in-chat picker shows it as unavailable (dependency store already
  tracks install status).

## 7. Feature flag & rollout

- Everything gated by a `chatUi` feature flag (telemetry-backed feature flag helpers).
- Flag off → current terminal path (unchanged).
- Flag on → chat replaces the agent conversation pane everywhere, **and the standalone
  terminal tabs are hidden** from the workspace UI. The user has no raw-terminal surface;
  commands appear only as collapsible activity cards in chat. PTY processes still run under
  the hood. (The `terminals/` infrastructure is retained but not surfaced when the flag is
  on, so it can be re-enabled or folded in cleanly later.)

## 8. Implementation phasing

1. **Vertical slice — Claude Code structured chat:** chat-event model, headless spawn
   path, `claude-json` adapter, `messages` table, Chat UI panel, single-turn then
   multi-turn. Prove end-to-end behind the flag.
2. **Raw fallback adapter:** every other installed agent works in chat (ANSI-stripped
   bubbles).
3. **Additional structured adapters:** Codex, cursor-agent, Gemini, opencode.
4. **Polish:** approvals UX, example chips, plan/diff cards, status, error/retry.

## 9. Verification strategy (development-time, not a product feature)

- Adapter unit tests: feed recorded sample JSON streams, assert expected `ChatMessage`
  events.
- Renderer browser tests for the Chat UI panel.
- Reviewer subagent over the diff before merge.
- **Playwright driving the real app** to confirm a live agent run renders end-to-end as
  chat.
- Local merge gate: `pnpm run format && pnpm run lint && pnpm run typecheck && pnpm run test`.

## 10. Risks & open questions

- **Headless modes differ per agent** (no slash commands, different turn semantics);
  multi-turn/resume is the highest-risk area. Mitigation: spike Claude Code first.
- **Raw fallback is a transitional bridge**, not visually polished; acceptable for
  uncovered agents until they get structured adapters.
- **PTY/spawn is high-risk** (`AGENTS.md`); no weakening of shell escaping or the env
  allowlist.
- **Removing the terminal surface** means any workflow that relied on a raw terminal (ad
  hoc user commands, watching live TUI output) now has to go through chat activity cards.
  Mitigation: the `terminals/` infra is retained behind the flag so it can be re-surfaced
  if a gap appears; activity cards expand to full output on demand.
- **Open:** exact headless flags per agent (verified during implementation); how approval
  round-trips map for each structured agent; whether any power-user "raw terminal" escape
  hatch is needed before defaulting the flag on.
