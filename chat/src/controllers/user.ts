import { Response } from 'express';
import { AnyDict, IRequest } from '../types/interfaces.js';
import { sendResponse, User } from 'shared';

export const getUserProfile = async (req: IRequest, res: Response) => {
  const id = req.user?._id;

  const user = await User.findById(id).select('-password -blockedBy').lean();

  if (!user) return sendResponse(res, 500, 'user not found');

  sendResponse(res, 200, 'success', user);
};

export const updateProfile = async (req: IRequest, res: Response) => {
  const { username, email, bio } = req.body;

  const user = await User.findById(req.user?._id);

  if (!user) return sendResponse(res, 500, 'user not found');

  const filter: AnyDict = {};

  if (username) filter['username'] = username;

  if (bio) filter['bio'] = bio;

  if (email) filter['email'] = email;

  Object.assign(user, filter);

  await user.save();

  sendResponse(res, 200, 'success', user);
};
