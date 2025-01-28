import { Request } from 'express';
import { IUser } from 'shared';
import { Socket } from 'socket.io';

export interface ITokenPayload {
  _id: string;
  role: string;
}

export interface IRequest extends Request {
  user?: IUser;
}

export interface ISocket extends Socket {
  user?: IUser;
}

export type AnyDict = Record<string, any>;

export interface ISocketCallback {
  (response: { success: boolean; message?: string; data?: any }): void;
}

export interface ValidationCallback {
  (): Promise<void> | void;
}

export interface OnlineUser {
  userId: string;
  socketId: string;
}

export interface IMessage {
  content: string;
  userId: string;
  chatId: string;
  readBy?: string[];
}

export interface IChat extends Document {
  _id: string;
  members: string[];
  updatedAt: Date;
}

export interface IMessageData {
  chatId: string;
  text: string;
}

export interface IReadMessageData {
  chatId: string;
  messageIds: string[];
}

export type ISocketNext = (data: any, err?: Error) => void;
