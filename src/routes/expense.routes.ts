// src/routes/expense.routes.ts
// All routes under /api/expenses

import { Router } from 'express';
import { body, query } from 'express-validator';
import {
  getAll,
  getSummary,
  getOne,
  create,
  update,
  remove,
} from '../controllers/expense.controller';
import { requireAuth, requireRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// All expense routes require authentication
router.use(requireAuth);

// ─── Valid expense types ──────────────────────────────────────────────────────

const EXPENSE_TYPES = [
  'fuel', 'electricity', 'water', 'nylon',
  'transportation', 'labor', 'maintenance', 'miscellaneous',
];

// ─── Validation chains ────────────────────────────────────────────────────────

const createValidation = [
  body('date')
    .notEmpty().withMessage('Date is required')
    .isISO8601().withMessage('Date must be a valid date (YYYY-MM-DD)'),

  body('expenseType')
    .notEmpty().withMessage('Expense type is required')
    .isIn(EXPENSE_TYPES).withMessage(`Expense type must be one of: ${EXPENSE_TYPES.join(', ')}`),

  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),

  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters')
    .trim(),
];

const updateValidation = [
  body('date')
    .optional()
    .isISO8601().withMessage('Date must be a valid date (YYYY-MM-DD)'),

  body('expenseType')
    .optional()
    .isIn(EXPENSE_TYPES).withMessage(`Expense type must be one of: ${EXPENSE_TYPES.join(', ')}`),

  body('amount')
    .optional()
    .isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),

  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters')
    .trim(),
];

const listQueryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('from').optional().isISO8601().withMessage('from must be YYYY-MM-DD'),
  query('to').optional().isISO8601().withMessage('to must be YYYY-MM-DD'),
  query('type').optional().isIn(EXPENSE_TYPES).withMessage('Invalid expense type filter'),
];

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/expenses/summary
 * Aggregated totals + category breakdown — must be BEFORE /:id
 */
router.get('/summary', getSummary);

/**
 * GET /api/expenses
 * Paginated list with optional date / type filters
 */
router.get('/', listQueryValidation, validate, getAll);

/**
 * GET /api/expenses/:id
 */
router.get('/:id', getOne);

/**
 * POST /api/expenses
 * Create — operations + super_admin only
 */
router.post(
  '/',
  requireRoles('super_admin', 'operations'),
  createValidation,
  validate,
  create
);

/**
 * PUT /api/expenses/:id
 * Update — creator or super_admin
 */
router.put(
  '/:id',
  requireRoles('super_admin', 'operations'),
  updateValidation,
  validate,
  update
);

/**
 * DELETE /api/expenses/:id
 * Delete — super_admin only
 */
router.delete('/:id', requireRoles('super_admin'), remove);

export default router;
