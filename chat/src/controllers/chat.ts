import { Request, Response } from 'express';
import { AnyDict, IRequest } from '../types/interfaces';
import { Chat, Message, redis, sendResponse, User } from 'shared';
import { Types } from 'mongoose';

export const createChat = async (req: IRequest, res: Response) => {
  const { userIds, name } = req.body;
  const creatorId = req.user?._id as Types.ObjectId;

  const creator = await User.findById(creatorId);
  if (!creator) return sendResponse(res, 400, 'user not found');

  const users = await User.find({ _id: { $in: userIds } });

  const ids = users.filter((user) => user).map((user) => user._id);

  if (ids.length < 1)
    return sendResponse(res, 400, 'no valid user to create chat');

  const members = [creatorId, ...ids].sort();
  let chat = await Chat.findOne({
    members: { $all: members },
    $expr: { $eq: [{ $size: '$members' }, members.length] },
  });

  if (chat) return sendResponse(res, 200, 'chat already exist', chat);

  const type = ids.length > 1 ? 'group' : 'chat';
  const chatName = type === 'group' ? name : '';

  chat = new Chat({
    members,
    type,
    creator: creatorId,
    name: chatName,
  });

  await chat.save();

  sendResponse(res, 200, 'success', chat);
};

export const addMember = async (req: IRequest, res: Response) => {
  const { chatId, userIds } = req.body;
  const creatorId = req.user?._id as Types.ObjectId;

  const creator = await User.findById(creatorId);
  if (!creator) return sendResponse(res, 400, 'user not found');

  const chat = await Chat.findById(chatId);
  if (!chat) return sendResponse(res, 404, 'chat not found');

  const users = await User.find({ _id: { $in: userIds } });

  const ids = users
    .filter((user) => user && !chat.members.includes(user._id))
    .map((user) => user._id);

  if (ids.length === 0) return sendResponse(res, 200, 'success', chat);

  const list = [...new Set([...chat.members, ...ids])];
  chat.members = list;

  await chat.save();

  sendResponse(res, 200, 'success', chat);
};

export const removeMember = async (req: IRequest, res: Response) => {
  const { chatId, userId } = req.body;

  const creatorId = req.user?._id as Types.ObjectId;

  const chat = await Chat.findById(chatId);
  if (!chat) return sendResponse(res, 404, 'chat not found');

  if (!chat.members.includes(userId))
    return sendResponse(res, 400, 'user is not a member of this chat');

  if (chat.creator.equals(creatorId))
    return sendResponse(res, 400, 'user not allowed to remove');

  if (chat.creator.equals(userId)) {
    const admin = chat.members.find(
      (id) => !id.equals(userId)
    ) as Types.ObjectId;

    if (admin) chat.creator = admin;
  }

  chat.members = chat.members.filter((id) => !id.equals(userId));
  await chat.save();

  sendResponse(res, 200, 'success', chat);
};

export const leaveChat = async (req: IRequest, res: Response) => {
  const { chatId } = req.body;
  const userId = req.user?._id as Types.ObjectId;

  const chat = await Chat.findById(chatId);
  if (!chat) return sendResponse(res, 400, 'chat not found.');

  if (!chat.members.includes(userId))
    return sendResponse(res, 404, 'user not found as member');

  const id = chat.members.find(
    (member) => !member.equals(userId)
  ) as Types.ObjectId;

  if (chat.creator.equals(userId)) chat.creator = id;

  chat.members = chat.members.filter((id) => !id.equals(userId));

  await chat.save();

  sendResponse(res, 200, 'success', chat);
};

export const deleteChat = async (req: IRequest, res: Response) => {
  const { chatId } = req.body;
  const userId = req.user?._id as Types.ObjectId;

  const chat = await Chat.findById(chatId);
  if (!chat) return sendResponse(res, 400, 'chat not found');

  if (chat.members.length === 2)
    return sendResponse(res, 404, 'only a group can be delete');

  if (!chat.creator.equals(userId))
    return sendResponse(res, 404, 'user not authorized to delete');

  await chat.save();

  sendResponse(res, 200, 'success', chat);
};

export const getChats = async (req: IRequest, res: Response) => {
  const user = req.user?._id as Types.ObjectId;

  const filter: AnyDict = { members: { $in: user } };

  if (!(await User.findById(user)))
    return sendResponse(res, 400, 'user not found');

  const [count, data] = await Promise.all([
    Chat.countDocuments(filter),
    Chat.find(filter).sort({ updatedAt: -1 }).limit(100),
  ]);

  sendResponse(res, 200, 'success', { count, data });
};

export const getChatById = async (req: IRequest, res: Response) => {
  const chatId = req.params.id;

  const messages = await Message.find({ chatId })
    .sort({ sentAt: -1 })
    .populate('userId', 'username')
    .lean();

  sendResponse(res, 200, 'success', messages);
};

export const clearAllCache = async (req: Request, res: Response) => {
  const answer = await redis.flushAll();
  sendResponse(res, 200, 'success', answer);
};
