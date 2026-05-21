// src/routes/payment.routes.ts
// /api/payments

import { Router } from 'express';
import { body }   from 'express-validator';
import {
  initializeOrderPayment,
  verifyOrderPayment,
  handleWebhook,
  markCashPayment,
  getPaymentByOrder,
} from '../controllers/payment.controller';
import { requireAuth, requireRoles }  from '../middleware/auth';
import { requireCustomer }            from '../middleware/customerAuth';
import { validate }                   from '../middleware/validate';

const router = Router();

// ─── Webhook — NO auth, raw body needed, respond immediately ──────────────────
// IMPORTANT: must be registered BEFORE express.json() parses the body.
// We handle this by keeping it first and using the pre-parsed req.body
// (express.json is already applied in server.ts but that's fine — Paystack
// sends JSON so req.body will be the parsed object; we re-stringify for HMAC).
router.post('/webhook', handleWebhook);

// ─── Customer routes ──────────────────────────────────────────────────────────

// Initialize: get Paystack payment URL for an order
router.post(
  '/initialize',
  requireCustomer,
  [body('orderId').notEmpty().withMessage('orderId is required')],
  validate,
  initializeOrderPayment
);

// Verify: called after Paystack redirect
router.get('/verify', requireCustomer, verifyOrderPayment);

// Get payment details for a specific order (customer sees own order)
router.get('/order/:orderId', requireCustomer, getPaymentByOrder);

// ─── Staff routes ─────────────────────────────────────────────────────────────

// Mark a cash order as paid (operations + super_admin)
router.post(
  '/cash/:orderId',
  requireAuth,
  requireRoles('super_admin', 'operations'),
  markCashPayment
);

export default router;
