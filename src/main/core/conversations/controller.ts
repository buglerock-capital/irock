import { createRPCController } from '@shared/ipc/rpc';
import { createConversation } from './createConversation';
import { dehydrateConversation } from './dehydrateConversation';
import { deleteConversation } from './deleteConversation';
import { getChatMessages } from './getChatMessages';
import { getConversations } from './getConversations';
import { getConversationsForTask } from './getConversationsForTask';
import { hydrateConversation } from './hydrateConversation';
import { renameConversation } from './renameConversation';
import { sendChatMessage } from './sendChatMessage';

export const conversationController = createRPCController({
  getConversations,
  createConversation,
  deleteConversation,
  hydrateConversation,
  dehydrateConversation,
  renameConversation,
  getConversationsForTask,
  getChatMessages,
  sendChatMessage,
});
