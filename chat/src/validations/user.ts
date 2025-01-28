import joi from 'joi';

export const updateProfile = joi.object({
  username: joi.string().lowercase().trim(),
  email: joi.string().email(),
  bio: joi.string(),
});
