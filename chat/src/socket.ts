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

let io: Server;
const onlineUsers = new Map<string, Set<string>>();

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
    logger.error('Error connecting to Redis:', err);
  }

  io.engine.on('connection_error', (err) => {
    console.log('Connection Error:', err);
  });

  instrument(io, {
    auth: false,
    mode: 'development',
  });

  io.use(checkSocketAuth);

  io.on('connection', (socket: ISocket) => {
    const user = socket.user;
    if (!user) return socket.disconnect();

    socket.join(user);
    if (!onlineUsers.has(user)) onlineUsers.set(user, new Set());

    onlineUsers.get(user)?.add(socket.id);
    io.emit('user_status', { userId: user, isOnline: true });

    socket.on('user_connected', async (data) => {
      if (!user) return { success: false, message: 'unauthorized' };

      try {
        const cacheKey = `user:${user}:chats`;
        const cachedChats = await redis.get(cacheKey);

        let chats;
        if (cachedChats) {
          chats = JSON.parse(cachedChats);
        } else {
          chats = await Chat.find({ members: user })
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

          chats = chats.map((chat, index) => ({
            ...chat,
            lastMessage: lastMessages[index],
          }));

          await redis.setEx(cacheKey, 300, JSON.stringify(chats));
        }

        const onlineStatus = Array.from(onlineUsers.keys());

        io.to(user).emit('login', {
          chats,
          onlineUsers: onlineStatus,
        });
      } catch (error) {
        logger.error('error fetching user chats:', error);
        socket.emit('error', {
          message: 'failed to fetch user chats',
        });
      }
    });

    socket.on('send_message', async (data) => {
      if (!user) return { success: false, message: 'unauthorized' };

      try {
        const { chatId, text } = data;

        const chat = await Chat.findOne({
          _id: chatId,
          members: { $in: user },
        });

        if (!chat) return { success: false, message: 'chat not found' };

        const message = await Message.create({
          content: text.trim(),
          userId: user,
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
          ...chat.members.map((memberId) =>
            redis.del(`user:${memberId}:chats`)
          ),
        ]);

        const populate = await Message.findById(message._id)
          .populate('userId', 'username')
          .lean();

        chat.members.forEach((memberId) => {
          io.to(memberId.toString()).emit('receive_message', {
            chatId,
            data: populate,
            userId: memberId.toString(),
            recipients: chat.members,
          });
        });

        ({ success: false, data: populate });
      } catch (error) {
        logger.error('error in sendMessage:', error);
        ({
          success: false,
          message: error instanceof Error ? error.message : 'error occurred',
        });
      }
    });

    socket.on('read_message', async (data) => {
      if (!user) return { success: false, message: 'unauthorized' };

      try {
        const { chatId, messageIds } = data;

        const chat = await Chat.findOne({
          _id: chatId,
          members: user,
        }).lean();

        if (!chat) return { success: false, message: 'chat not found' };

        await Message.updateMany(
          { _id: { $in: messageIds } },
          { $addToSet: { readBy: user } }
        );

        const messages = await Message.find({ _id: { $in: messageIds } })
          .populate('userId', 'username')
          .lean();

        chat.members.forEach((memberId) => {
          io.to(memberId.toString()).emit('message_read', {
            chatId,
            data: messages,
            userId: memberId.toString(),
            recipients: chat.members,
          });
        });

        ({ success: true, data: messages });
      } catch (error) {
        logger.error('error in readMessage:', error);
        ({
          success: false,
          message: error instanceof Error ? error.message : 'error occurred',
        });
      }
    });

    socket.on('typing_status', (data) => {
      const { chatId, isTyping } = data;
      console.log('🚀 ~ socket.on ~ data:', socket);

      socket.to(chatId).emit('user_typing', {
        userId: user,
        chatId,
        isTyping,
      });
    });

    socket.on('disconnect', () => {
      const userSockets = onlineUsers.get(user);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(user);
          io.emit('user_status', { userId: user, isOnline: false });
        }
      }
    });
  });

  return io;
};
