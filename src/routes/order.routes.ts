// src/routes/order.routes.ts
// /api/orders — customer routes + staff routes

import { Router } from 'express';
import { body, query } from 'express-validator';
import {
  placeOrder, getMyOrders, getMyOrderById, cancelMyOrder,
  getAllOrders, getOrderById, getOrderSummary, updateOrderStatus,
} from '../controllers/order.controller';
import { requireAuth, requireRoles } from '../middleware/auth';
import { requireCustomer } from '../middleware/customerAuth';
import { validate } from '../middleware/validate';

const router = Router();

const ORDER_STATUSES = ['pending','confirmed','processing','out_for_delivery','delivered','cancelled'];

// ─── Customer routes (/api/orders/my*) ───────────────────────────────────────

router.get('/my',           requireCustomer, getMyOrders);
router.get('/my/:id',       requireCustomer, getMyOrderById);
router.patch('/my/:id/cancel', requireCustomer, cancelMyOrder);

router.post('/',
  requireCustomer,
  [
    body('productId').notEmpty().withMessage('Product is required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('deliveryMethod').isIn(['delivery','pickup']).withMessage('Delivery method must be delivery or pickup'),
    body('deliveryAddress').optional().trim(),
    body('specialInstructions').optional().trim().isLength({ max: 500 }),
  ],
  validate,
  placeOrder
);

// ─── Staff routes ─────────────────────────────────────────────────────────────

// Summary must come before /:id
router.get('/summary', requireAuth, getOrderSummary);

router.get('/',
  requireAuth,
  requireRoles('super_admin', 'operations', 'delivery'),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(ORDER_STATUSES),
  ],
  validate,
  getAllOrders
);

router.get('/:id',
  requireAuth,
  requireRoles('super_admin', 'operations', 'delivery'),
  getOrderById
);

router.patch('/:id/status',
  requireAuth,
  requireRoles('super_admin', 'operations', 'delivery'),
  [
    body('status').isIn(ORDER_STATUSES).withMessage(`Status must be one of: ${ORDER_STATUSES.join(', ')}`),
  ],
  validate,
  updateOrderStatus
);

export default router;
