import { observer } from 'mobx-react-lite';
import { useEffect, useMemo } from 'react';
import { events, rpc } from '@renderer/lib/ipc';
import { chatMessageChannel } from '@shared/events/chatEvents';
import { ChatStore } from './chat-store';
import { ChatComposer } from './ChatComposer';
import { ChatMessageList } from './ChatMessageList';

type Props = {
  conversationId: string;
  taskId: string;
};

export const ChatPanel = observer(function ChatPanel({ conversationId, taskId }: Props) {
  const store = useMemo(() => new ChatStore(conversationId), [conversationId]);

  useEffect(() => {
    let active = true;
    void rpc.conversations.getChatMessages(conversationId).then((msgs) => {
      if (active) store.hydrate(msgs);
    });
    const off = events.on(chatMessageChannel, ({ conversationId: id, message }) => {
      if (id === conversationId) store.upsert(message);
    });
    return () => {
      active = false;
      off();
    };
  }, [conversationId, store]);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <ChatMessageList messages={store.messages} />
      </div>
      <ChatComposer
        onSend={(text) => {
          void rpc.conversations.sendChatMessage({ conversationId, taskId, text });
        }}
      />
    </div>
  );
});
