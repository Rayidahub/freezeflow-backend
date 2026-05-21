// src/routes/customer.routes.ts
// Customer auth + profile: /api/customers/*

import { Router } from 'express';
import { body } from 'express-validator';
import {
  registerCustomer,
  loginCustomer,
  getCustomerProfile,
  updateCustomerProfile,
} from '../controllers/customer.auth.controller';
import { requireCustomer } from '../middleware/customerAuth';
import { validate } from '../middleware/validate';

const router = Router();

// ─── Validation ───────────────────────────────────────────────────────────────

const registerValidation = [
  body('fullName').trim().notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters'),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('phone').trim().notEmpty().withMessage('Phone number is required')
    .isLength({ min: 7, max: 20 }).withMessage('Enter a valid phone number'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('deliveryAddress').optional().trim().isLength({ max: 300 }),
];

const loginValidation = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const updateValidation = [
  body('fullName').optional().trim().isLength({ min: 2, max: 100 }),
  body('phone').optional().trim().isLength({ min: 7, max: 20 }),
  body('deliveryAddress').optional().trim().isLength({ max: 300 }),
];

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post('/register', registerValidation, validate, registerCustomer);
router.post('/login',    loginValidation,    validate, loginCustomer);
router.get('/me',        requireCustomer, getCustomerProfile);
router.put('/me',        requireCustomer, updateValidation, validate, updateCustomerProfile);

export default router;
