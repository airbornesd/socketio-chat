import { Router } from 'express';
import * as controller from '../controllers/user.js';
import * as validation from '../validations/user.js';
import { validate } from 'shared';

const router = Router();

router
  .route('/')
  .get(controller.getUserProfile)
  .patch(validate(validation.updateProfile), controller.updateProfile);

export default router;
