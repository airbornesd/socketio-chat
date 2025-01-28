import { Server } from 'socket.io';
import {
  ISocketCallback,
  IMessageData,
  ISocketNext,
  IReadMessageData,
} from '../types/interfaces.js';
import { logger, Message } from 'shared';
import { Chat, redis } from 'shared';
import { getIO } from '../utils/socket.js';

// ---- SERVICES ---- //

// let messageRateLimit = new Map();
// let rateLimitWindow: NodeJS.Timeout;

// const startRateLimitCleaner = () => {
//   rateLimitWindow = setInterval(() => {
//     messageRateLimit.clear();
//   }, 60000);
// };

// // startRateLimitCleaner();

// export const cleanup = () => {
//   clearInterval(rateLimitWindow);
//   messageRateLimit.clear();
// };

// const messageLimit = (user: string) => {
//   const count = messageRateLimit.get(user) || 0;
//   if (count >= 50) {
//     return false;
//   }
//   messageRateLimit.set(user, count + 1);
//   return true;
// };

// ---- SERVICES ---- //

export const socketResponse = (callback: ISocketCallback, event: string) => {
  const io = getIO();

  return (response: { data: any; err?: Error }) => {
    if (response.err) {
      return callback({
        success: false,
        message: response.err.message || 'an error occurred',
      });
    }

    const { data } = response;
    if (data?.recipients?.length) {
      data.recipients.forEach((recipientId: string) => {
        io.to(recipientId).emit(event, data);
      });
    }

    callback({ success: true, data });
  };
};

export const getUserChats = async (userId: string) => {
  try {
    const cacheKey = `user:${userId}:chats`;
    const cachedChats = await redis.get(cacheKey);

    if (cachedChats) {
      return {
        success: true,
        data: { chats: JSON.parse(cachedChats) },
      };
    }

    const chats = await Chat.find({ members: userId })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    await redis.setEx(cacheKey, 300, JSON.stringify(chats));

    return { success: true, data: { chats } };
  } catch (error) {
    logger.error('error fetching user chats:', error);

    return {
      success: false,
      error: 'failed to fetch user chats',
    };
  }
};

export const sendMessage = async (
  data: IMessageData,
  senderId: string,
  next: ISocketNext
) => {
  try {
    const { chatId, text } = data;

    // if (messageLimit(senderId))
    //   return next({ data, err: new Error('message limit exceeded') });

    const chat = await Chat.findOne({
      _id: chatId,
      members: { $in: senderId },
    });

    if (!chat) return next({ data, err: new Error('chat not found') });

    const [message] = await Promise.all([
      Message.create({
        content: text.trim(),
        userId: senderId,
        chatId: chat._id,
      }),
      Chat.updateOne({ _id: chatId }, { $set: { updatedAt: new Date() } }),
    ]);

    await Promise.all(
      chat.members.map((memberId) => redis.del(`user:${memberId}:chats`))
    );

    chat.members.forEach((memberId) => {
      next({
        data: {
          chatId,
          data: message,
          userId: memberId.toString(),
          recipients: chat.members,
        },
      });
    });
  } catch (error) {
    logger.error('error in sendMessage:', error);

    next({
      data,
      err: error instanceof Error ? error : new Error('error occurred'),
    });
  }
};

export const readMessage = async (
  data: IReadMessageData,
  readerId: string,
  next: ISocketNext
) => {
  try {
    const { chatId, messageIds } = data;

    const chat = await Chat.findOne({
      _id: chatId,
      members: readerId,
    }).lean();

    if (!chat)
      return next({
        data,
        err: new Error('chat not found'),
      });

    const [_, messages] = await Promise.all([
      Message.updateMany(
        { _id: { $in: messageIds } },
        { $addToSet: { readBy: readerId } }
      ),
      Message.find({ _id: { $in: messageIds } }, {}, { lean: true }),
    ]);

    chat.members.forEach((memberId) => {
      next({
        data: {
          chatId,
          data: messages,
          userId: memberId.toString(),
          recipients: chat.members,
        },
      });
    });
  } catch (error) {
    logger.error('error in readMessage:', error);
    next({
      data,
      err: error instanceof Error ? error : new Error('error occurred'),
    });
  }
};
