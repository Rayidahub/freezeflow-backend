// src/routes/analytics.routes.ts
// All analytics endpoints under /api/analytics
// All require staff authentication (super_admin or operations)

import { Router } from 'express';
import { query }  from 'express-validator';
import {
  getKpi,
  getRevenueTrend,
  getExpenseBreakdown,
  getOrderFunnel,
  getProductionEfficiency,
  getTopCustomers,
  getFullReport,
} from '../controllers/analytics.controller';
import { requireAuth, requireRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// All analytics routes require staff auth
router.use(requireAuth);
router.use(requireRoles('super_admin', 'operations'));

const periodValidation = [
  query('period')
    .optional()
    .isIn(['7d', '30d', '90d', 'year'])
    .withMessage('Period must be one of: 7d, 30d, 90d, year'),
];

/**
 * GET /api/analytics/kpi
 * KPI cards with period-over-period % change
 */
router.get('/kpi', periodValidation, validate, getKpi);

/**
 * GET /api/analytics/revenue-trend
 * Daily revenue + expenses for line chart
 */
router.get('/revenue-trend', periodValidation, validate, getRevenueTrend);

/**
 * GET /api/analytics/expense-breakdown
 * Expense totals by category for donut chart
 */
router.get('/expense-breakdown', periodValidation, validate, getExpenseBreakdown);

/**
 * GET /api/analytics/order-funnel
 * Orders by status, payment, delivery method
 */
router.get('/order-funnel', periodValidation, validate, getOrderFunnel);

/**
 * GET /api/analytics/production-efficiency
 * Yield rate, damage rate, sell-through, daily averages
 */
router.get('/production-efficiency', periodValidation, validate, getProductionEfficiency);

/**
 * GET /api/analytics/top-customers
 * Top customers by spend
 */
router.get(
  '/top-customers',
  [
    ...periodValidation,
    query('limit').optional().isInt({ min: 1, max: 10 }),
  ],
  validate,
  getTopCustomers
);

/**
 * GET /api/analytics/report
 * Full combined report — all sections in one request
 */
router.get('/report', periodValidation, validate, getFullReport);

export default router;
