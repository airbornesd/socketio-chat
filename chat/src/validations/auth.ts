import joi from 'joi';

export const login = joi.object({
  from: joi.string().valid('postman', 'mobile').required(),
  address: joi.when('from', {
    is: 'postman',
    then: joi.string().required(),
    otherwise: joi.string().optional(),
  }),
  message: joi.when('from', {
    is: 'mobile',
    then: joi.string().required(),
  }),
  signature: joi.when('from', {
    is: 'mobile',
    then: joi.string().required(),
  }),
  fcmToken: joi.string().allow(''),
});
