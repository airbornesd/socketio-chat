import { Router } from 'express';
import { validate } from 'shared';
import * as controller from '../controllers/chat.js';
import * as validation from '../validations/chat.js';

const router = Router();

router.get('/', controller.getChats);
router.get('/:id', controller.getChatById);
router.post('/', validate(validation.createChat), controller.createChat);
router.post('/add', validate(validation.addMember), controller.addMember);
router.post('/leave', validate(validation.leaveChat), controller.leaveChat);
router.post('/delete', validate(validation.deleteChat), controller.deleteChat);
router.post(
  '/remove',
  validate(validation.removeMember),
  controller.removeMember
);
router.post('/redis', controller.clearAllCache);

export default router;
