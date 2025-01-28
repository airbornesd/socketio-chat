import joi from 'joi';

export const createChat = joi.object({
  userIds: joi.array().items(joi.string()).min(1).required(),
  name: joi.string(),
});

export const addMember = joi.object({
  userIds: joi.array().items(joi.string()).min(1).max(5).required(),
  chatId: joi.string().required(),
});

export const removeMember = joi.object({
  userId: joi.string().required(),
  chatId: joi.string().required(),
});

export const leaveChat = joi.object({
  chatId: joi.string().required(),
});

export const deleteChat = joi.object({
  chatId: joi.string().required(),
});
