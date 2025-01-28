import {
  ISocketCallback,
  IMessageData,
  ISocketNext,
  IReadMessageData,
} from '../types/interfaces.js';
import { logger, Message } from 'shared';
import { Chat, redis } from 'shared';
import { getIo } from '../utils/socket.js';

export const socketResponse = (callback: ISocketCallback, event: string) => {
  const io = getIo();

  return (response: { data: any; err?: Error }) => {
    if (response.err) {
      console.log('🚀 ~ return ~ response.err:', response.err);
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
      .populate('members', 'username')
      .lean()
      .exec();

    const lastMessages = await Promise.all(
      chats.map(async (chat) => {
        const message = await Message.findOne({ chatId: chat._id })
          .sort({ createdAt: -1 })
          .lean();
        return message;
      })
    );
    const enrichedChats = chats.map((chat, index) => ({
      ...chat,
      lastMessage: lastMessages[index],
    }));

    await redis.setEx(cacheKey, 300, JSON.stringify(enrichedChats));

    return { success: true, data: { chats: enrichedChats } };
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

    const chat = await Chat.findOne({
      _id: chatId,
      members: { $in: senderId },
    });

    if (!chat) return next({ data, err: new Error('chat not found') });

    const message = await Message.create({
      content: text.trim(),
      userId: senderId,
      chatId: chat._id,
    });

    await Promise.all([
      Chat.updateOne(
        { _id: chatId },
        {
          $set: {
            updatedAt: new Date(),
            lastMessage: message._id,
          },
        }
      ),
      ...chat.members.map((memberId) => redis.del(`user:${memberId}:chats`)),
    ]);

    const populatedMessage = await Message.findById(message._id)
      .populate('userId', 'username avatar')
      .lean();

    chat.members.forEach((memberId) => {
      next({
        data: {
          chatId,
          data: populatedMessage,
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

    await Message.updateMany(
      { _id: { $in: messageIds } },
      { $addToSet: { readBy: readerId } }
    );

    const messages = await Message.find({ _id: { $in: messageIds } })
      .populate('userId', 'username avatar')
      .lean();

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
