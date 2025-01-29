import { createAdapter } from '@socket.io/redis-adapter';
import { Server as IServer } from 'http';
import {
  redis,
  redisSubClient,
  logger,
  Message,
  Chat,
  redisPubClient,
  connectRedis,
} from 'shared';
import { Server } from 'socket.io';
import { checkSocketAuth } from './middleware/socket.js';
import { ISocket } from './types/interfaces.js';
import { instrument } from '@socket.io/admin-ui';
import { retry } from './utils/socket.js';
import { Types } from 'mongoose';

let io: Server;
const onlineUsers = new Map();

export const getIo = () => {
  if (!io) {
    throw new Error('socket.io not initialized');
  }
  return io;
};

export const initSocket = (server: IServer) => {
  io = new Server(server, {
    cors: {
      origin: [
        'http://127.0.0.1:5501',
        'http://localhost:5501',
        'https://admin.socket.io/',
      ],
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  try {
    connectRedis();
    io.adapter(createAdapter(redisPubClient, redisSubClient));
  } catch (err) {
    logger.error('error connecting to Redis:', err);
  }

  io.engine.on('connection_error', (err) => {
    logger.error('connection error:', err);
  });

  instrument(io, {
    auth: false,
    mode: 'development',
  });

  io.use(checkSocketAuth);

  io.on('connection', (socket: ISocket) => {
    const user = socket.user;
    if (!user) return socket.disconnect();

    logger.info(`new socket connection: ${socket.id}`);
    socket.join(user);

    if (!onlineUsers.has(user)) onlineUsers.set(user, new Set());
    onlineUsers.get(user)?.add(socket.id);

    socket.on('user_connected', async () => {
      try {
        io.emit('user_status', { userId: user, isOnline: true });
      } catch (error) {
        logger.error('Error in user_connected:', error);
      }
    });

    socket.on('send_message', async (data) => {
      if (!user) return { success: false, message: 'unauthorized' };

      try {
        const { chatId, text } = data;
        const chat = await retry(() =>
          Chat.findOne({ _id: chatId, members: { $in: user } })
        );
        if (!chat) return { success: false, message: 'chat not found' };

        const message = await Message.create({
          content: text.trim(),
          userId: user,
          chatId: chat._id,
        });

        await redis.xAdd(`chat:${chatId}:stream`, '*', {
          message: JSON.stringify(message),
        });

        await Promise.all([
          Chat.updateOne(
            { _id: chatId },
            { $set: { updatedAt: new Date(), lastMessage: message._id } }
          ),
          ...chat.members.map((memberId: string | Types.ObjectId) =>
            redis.del(`user:${memberId}:chats`)
          ),
        ]);

        const populatedMessage = await Message.findById(message._id)
          .populate('userId', 'username')
          .lean();

        for (const memberId of chat.members) {
          const memberIdStr = memberId.toString();
          if (onlineUsers.has(memberIdStr)) {
            io.to(memberIdStr).emit('receive_message', {
              chatId,
              data: populatedMessage,
            });
          } else {
            await redis.xAdd(`offline_messages:${memberIdStr}`, '*', {
              message: JSON.stringify({
                chatId,
                data: populatedMessage,
                timestamp: Date.now(),
              }),
            });
          }
        }

        return { success: true, data: populatedMessage };
      } catch (error) {
        logger.error('Error in sendMessage:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'error occurred',
        };
      }
    });

    socket.on('read_message', async ({ chatId }) => {
      try {
        const chat = await Chat.findOne({ _id: chatId, members: user }).lean();
        if (!chat) return { success: false, message: 'chat not found' };

        await Message.updateMany(
          { chatId, readBy: { $ne: user } },
          { $addToSet: { readBy: user } }
        );

        io.to(chat.members.map((m) => m.toString())).emit('message_read', {
          chatId,
          userId: user,
        });
      } catch (error) {
        logger.error('Error in readMessage:', error);
      }
    });

    socket.on('typing_status', async ({ chatId, isTyping }) => {
      const chat = await Chat.findOne({ _id: chatId, members: user }).lean();
      if (!chat) return;

      chat.members.forEach((memberId: string | Types.ObjectId) => {
        if (memberId.toString() !== user) {
          io.to(memberId.toString()).emit('user_typing', {
            userId: user,
            chatId,
            isTyping,
          });
        }
      });
    });

    socket.on('disconnect', () => {
      try {
        const userSockets = onlineUsers.get(user);
        if (userSockets) {
          userSockets.delete(socket.id);
          logger.info(`socket ${socket.id} disconnected for user ${user}`);
          if (userSockets.size === 0) {
            onlineUsers.delete(user);
            io.emit('user_status', { userId: user, isOnline: false });
          }
        }
      } catch (error) {
        logger.error('error in disconnect handler:', error);
      }
    });
  });

  return io;
};
