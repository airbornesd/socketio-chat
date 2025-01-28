import { Request, Response } from 'express';
import { sendResponse, User } from 'shared';
import { generateToken } from '../utils/helpers.js';
import { SiweMessage } from 'siwe';

export const login = async (req: Request, res: Response) => {
  switch (req.body.from) {
    case 'postman': {
      const { address } = req.body;

      let user = await User.findOne({ address: address.toLowerCase() });

      if (!user) {
        user = new User({ address, role: 'member' });
        await user.save();
      }

      const payload = { _id: user._id.toString(), role: user.role };

      const response = {
        token: generateToken(payload),
        _id: user._id,
        username: user.username,
        role: user.role,
        from: user.from || 'postman',
        address: user.address,
      };

      sendResponse(res, 200, 'success', response);
      break;
    }

    case 'mobile': {
      const { message, signature, from, fcmToken } = req.body;

      const siwe = new SiweMessage(message);

      const { success, data } = await siwe.verify({ signature });

      if (!success) return sendResponse(res, 400, 'invalid signature');

      const address = data.address.toLowerCase();

      let user = await User.findOne({ loginAddress: address });

      if (!user) {
        user = new User({
          address,
          from: from,
        });
      }

      if (from === 'mobile' && fcmToken) user.fcmToken = fcmToken;

      await user.save();

      const payload = { _id: user._id.toString(), role: user.role };

      const response = {
        token: generateToken(payload),
        user: {
          _id: user._id,
          username: user.username,
          role: user.role,
          address: user.address,
          from: user.from,
        },
      };

      sendResponse(res, 200, 'success', response);
      break;
    }

    default:
      sendResponse(res, 400, 'use correct login flow');
  }
};
