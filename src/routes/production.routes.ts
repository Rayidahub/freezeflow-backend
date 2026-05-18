// src/routes/production.routes.ts
// All routes under /api/production

import { Router } from 'express';
import { body, query } from 'express-validator';
import {
  getAll,
  getSummary,
  getOne,
  create,
  update,
  remove,
} from '../controllers/production.controller';
import { requireAuth, requireRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// All production routes require authentication
router.use(requireAuth);

// ─── Validation chains ────────────────────────────────────────────────────────

const createValidation = [
  body('date')
    .notEmpty().withMessage('Date is required')
    .isISO8601().withMessage('Date must be a valid date (YYYY-MM-DD)'),

  body('bagsProduced')
    .notEmpty().withMessage('Bags produced is required')
    .isInt({ min: 0 }).withMessage('Bags produced must be a non-negative integer'),

  body('bagsSold')
    .notEmpty().withMessage('Bags sold is required')
    .isInt({ min: 0 }).withMessage('Bags sold must be a non-negative integer'),

  body('damagedBags')
    .optional()
    .isInt({ min: 0 }).withMessage('Damaged bags must be a non-negative integer'),

  body('remainingStock')
    .notEmpty().withMessage('Remaining stock is required')
    .isInt({ min: 0 }).withMessage('Remaining stock must be a non-negative integer'),

  body('sellingPrice')
    .notEmpty().withMessage('Selling price is required')
    .isFloat({ min: 0 }).withMessage('Selling price must be a positive number'),
];

const updateValidation = [
  body('date').optional().isISO8601().withMessage('Date must be valid (YYYY-MM-DD)'),
  body('bagsProduced').optional().isInt({ min: 0 }),
  body('bagsSold').optional().isInt({ min: 0 }),
  body('damagedBags').optional().isInt({ min: 0 }),
  body('remainingStock').optional().isInt({ min: 0 }),
  body('sellingPrice').optional().isFloat({ min: 0 }),
];

const listQueryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('from').optional().isISO8601().withMessage('from must be YYYY-MM-DD'),
  query('to').optional().isISO8601().withMessage('to must be YYYY-MM-DD'),
];

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/production/summary
 * Aggregated stats for the dashboard — must be BEFORE /:id
 */
router.get('/summary', getSummary);

/**
 * GET /api/production
 * List all logs, paginated, with optional date filter
 */
router.get('/', listQueryValidation, validate, getAll);

/**
 * GET /api/production/:id
 * Single log by ID
 */
router.get('/:id', getOne);

/**
 * POST /api/production
 * Create a new log — operations + super_admin only
 */
router.post(
  '/',
  requireRoles('super_admin', 'operations'),
  createValidation,
  validate,
  create
);

/**
 * PUT /api/production/:id
 * Update a log — creator or super_admin
 */
router.put(
  '/:id',
  requireRoles('super_admin', 'operations'),
  updateValidation,
  validate,
  update
);

/**
 * DELETE /api/production/:id
 * Delete a log — super_admin only
 */
router.delete('/:id', requireRoles('super_admin'), remove);

export default router;
