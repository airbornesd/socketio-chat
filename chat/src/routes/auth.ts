import { Router } from 'express';
import { validate } from 'shared';
import * as validation from '../validations/auth.js';
import * as controller from '../controllers/auth.js';

const router = Router();

router.post('/login', validate(validation.login), controller.login);

export default router;
