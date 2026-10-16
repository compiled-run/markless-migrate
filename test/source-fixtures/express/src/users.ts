import { Router } from 'express';
import { requireRole } from './auth';

const router = Router();

router.get('/:id', (req, res) => res.json({ id: req.params.id }));
router.patch('/:id', requireRole('admin'), (req, res) => res.json({}));

export default router;
