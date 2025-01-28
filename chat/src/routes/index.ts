import { Router } from 'express';
import { checkAuth } from '../middleware/auth.js';
import authRoutes from './auth.js';
import userRoutes from './user.js';
import chatRoutes from './chat.js';

const router = Router();

router.use('/auth', authRoutes);

router.use(checkAuth);

router.use('/user', userRoutes);
router.use('/chat', chatRoutes);

export default router;
