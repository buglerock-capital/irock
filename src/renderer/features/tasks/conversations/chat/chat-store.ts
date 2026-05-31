import { makeAutoObservable } from 'mobx';
import type { ChatMessage } from '@shared/chat';

export class ChatStore {
  readonly conversationId: string;
  messages: ChatMessage[] = [];

  constructor(conversationId: string) {
    this.conversationId = conversationId;
    makeAutoObservable(this);
  }

  upsert(message: ChatMessage): void {
    const idx = this.messages.findIndex((m) => m.id === message.id);
    if (idx >= 0) this.messages[idx] = message;
    else this.messages.push(message);
  }

  hydrate(messages: ChatMessage[]): void {
    this.messages = [...messages];
  }
}
