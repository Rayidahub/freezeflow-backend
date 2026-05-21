// src/routes/product.routes.ts
// /api/products — public reads, staff writes

import { Router } from 'express';
import { body } from 'express-validator';
import { getAll, getOne, create, update, remove } from '../controllers/product.controller';
import { requireAuth, requireRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const productValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('sizeKg').isFloat({ min: 0.1 }).withMessage('Size must be > 0 kg'),
  body('price').isFloat({ min: 1 }).withMessage('Price must be > 0'),
];

// Public
router.get('/',    getAll);
router.get('/:id', getOne);

// Staff only
router.post('/',    requireAuth, requireRoles('super_admin'), productValidation, validate, create);
router.put('/:id',  requireAuth, requireRoles('super_admin'), validate, update);
router.delete('/:id', requireAuth, requireRoles('super_admin'), remove);

export default router;
