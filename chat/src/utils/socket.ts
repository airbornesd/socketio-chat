import { createAdapter } from '@socket.io/redis-adapter';
import { Server as IServer } from 'http';
import { redis, redisSubClient } from 'shared';
import { Server } from 'socket.io';
import { checkSocketAuth, validateSocket } from '../middleware/socket.js';
import { ISocket } from '../types/interfaces.js';
import * as service from '../services/socket.js';

let io: Server;
const onlineUsers = new Map<string, Set<string>>();

export const getIo = () => {
  if (!io) {
    throw new Error('socket.io not initialized');
  }
  return io;
};

export const initSocket = (server: IServer) => {
  // if (io) {
  //   return io;
  // }

  io = new Server(server, {
    adapter: createAdapter(redis, redisSubClient),
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use(checkSocketAuth);

  io.on('connection', (socket: ISocket) => {
    const user = socket.user;

    if (!user) return socket.disconnect();

    socket.join(user);

    if (!onlineUsers.has(user)) onlineUsers.set(user, new Set());

    onlineUsers.get(user)?.add(socket.id);

    // Emit online status to relevant users
    emitUserStatus(user, true);

    socket.on('user_connected', (data, callback) => {
      validateSocket(user, callback, async () => {
        try {
          const response = await service.getUserChats(user);
          const onlineStatus = getOnlineUsers();

          io.to(user).emit('login', {
            ...response.data,
            onlineUsers: onlineStatus,
          });
        } catch (error) {
          socket.emit('error', {
            message: 'failed to fetch user chats',
          });
        }
      });
    });

    socket.on('send_message', (data, callback) => {
      console.log('🚀 ~ socket.on ~ send_message:', data);
      validateSocket(user, callback, () => {
        const next = service.socketResponse(callback, 'receive_message');
        return service.sendMessage(data, user, next);
      });
    });

    socket.on('read_message', (data, callback) => {
      console.log('🚀 ~ socket.on ~ read_message:', data);
      validateSocket(user, callback, () => {
        const next = service.socketResponse(callback, 'message_read');
        return service.readMessage(data, user, next);
      });
    });

    socket.on('typing_status', (data) => {
      const { chatId, isTyping } = data;
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
          emitUserStatus(user, false);
        }
      }
    });
  });

  return io;
};

const emitUserStatus = (userId: string, isOnline: boolean) => {
  io.emit('user_status', { userId, isOnline });
};

const getOnlineUsers = () => {
  return Array.from(onlineUsers.keys());
};
