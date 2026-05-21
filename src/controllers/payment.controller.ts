// src/controllers/payment.controller.ts
// Handles all payment operations:
//   - Customer: initialize payment, verify after redirect
//   - Paystack: webhook for server-to-server confirmation
//   - Staff: manually mark cash orders as paid

import { Request, Response } from 'express';
import { prisma }  from '../utils/prisma';
import { sendSuccess, sendError } from '../utils/response';
import {
  initializePayment,
  verifyPayment,
  generateReference,
  verifyWebhookSignature,
} from '../utils/paystack';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Maps Paystack channel strings to our PaymentMethod enum values.
 */
function mapChannel(channel: string): string {
  const map: Record<string, string> = {
    card:          'card',
    bank:          'bank_transfer',
    bank_transfer: 'bank_transfer',
    ussd:          'ussd',
    mobile_money:  'card',
  };
  return map[channel] ?? 'card';
}

// ─── POST /api/payments/initialize ───────────────────────────────────────────
// Customer: initializes a Paystack transaction for an unpaid order.

export async function initializeOrderPayment(req: Request, res: Response): Promise<void> {
  try {
    const customerId = req.customer!.customerId;
    const { orderId } = req.body;

    if (!orderId) {
      sendError(res, 'orderId is required', 422);
      return;
    }

    // Fetch order and validate ownership
    const order = await prisma.order.findFirst({
      where:   { id: orderId, customerId },
      include: { customer: true },
    });

    if (!order) {
      sendError(res, 'Order not found', 404);
      return;
    }

    if (order.paymentStatus === 'paid') {
      sendError(res, 'This order has already been paid', 400);
      return;
    }

    if (order.orderStatus === 'cancelled') {
      sendError(res, 'Cannot pay for a cancelled order', 400);
      return;
    }

    // Check if there's already a pending payment for this order
    const existingPayment = await prisma.payment.findFirst({
      where: { orderId, paymentStatus: 'unpaid' },
    });

    // Generate a fresh reference (or reuse pending one)
    const reference = existingPayment?.transactionReference
      ?? generateReference(orderId);

    const callbackUrl = `${process.env.PAYSTACK_CALLBACK_URL}?reference=${reference}`;

    // Call Paystack
    const result = await initializePayment({
      email:       order.customer.email,
      amount:      order.totalAmount,
      reference,
      callbackUrl,
      metadata: {
        orderId,
        customerId,
        orderTotal: order.totalAmount,
      },
    });

    // Upsert a Payment record (pending)
    if (!existingPayment) {
      await prisma.payment.create({
        data: {
          orderId,
          customerId,
          amount:               order.totalAmount,
          paymentMethod:        'card',
          transactionReference: reference,
          paymentStatus:        'unpaid',
        },
      });
    }

    sendSuccess(res, {
      authorizationUrl: result.authorizationUrl,
      accessCode:       result.accessCode,
      reference:        result.reference,
      amount:           order.totalAmount,
    }, 'Payment initialized');
  } catch (error) {
    console.error('[payment/initialize]', error);
    sendError(res, 'Failed to initialize payment. Check your Paystack configuration.', 500);
  }
}

// ─── GET /api/payments/verify?reference=FF-xxxx ───────────────────────────────
// Customer: called after Paystack redirects back to our app.

export async function verifyOrderPayment(req: Request, res: Response): Promise<void> {
  try {
    const { reference } = req.query as { reference: string };

    if (!reference) {
      sendError(res, 'Transaction reference is required', 422);
      return;
    }

    // Find our payment record
    const payment = await prisma.payment.findUnique({
      where:   { transactionReference: reference },
      include: { order: true },
    });

    if (!payment) {
      sendError(res, 'Payment record not found', 404);
      return;
    }

    // If already marked paid, just return success
    if (payment.paymentStatus === 'paid') {
      sendSuccess(res, { status: 'success', orderId: payment.orderId });
      return;
    }

    // Verify with Paystack
    const result = await verifyPayment(reference);

    if (result.status === 'success') {
      await markPaymentSuccess(payment.id, payment.orderId, result.paidAt, mapChannel(result.channel));
      sendSuccess(res, { status: 'success', orderId: payment.orderId });
    } else {
      // Update payment status to failed
      await prisma.payment.update({
        where: { id: payment.id },
        data:  { paymentStatus: 'failed' },
      });
      sendSuccess(res, { status: result.status, orderId: payment.orderId });
    }
  } catch (error) {
    console.error('[payment/verify]', error);
    sendError(res, 'Payment verification failed', 500);
  }
}

// ─── POST /api/payments/webhook ───────────────────────────────────────────────
// Paystack: server-to-server webhook — the most reliable confirmation method.
// This fires even if the customer closes the browser before the redirect.

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  try {
    // Always respond 200 immediately so Paystack stops retrying
    res.status(200).json({ received: true });

    const signature = req.headers['x-paystack-signature'] as string;

    // Verify the request actually came from Paystack
    const rawBody = JSON.stringify(req.body);
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn('[webhook] Invalid signature — ignored');
      return;
    }

    const event = req.body;

    if (event.event === 'charge.success') {
      const data      = event.data;
      const reference = data.reference as string;

      const payment = await prisma.payment.findUnique({
        where: { transactionReference: reference },
      });

      if (!payment || payment.paymentStatus === 'paid') return;

      await markPaymentSuccess(
        payment.id,
        payment.orderId,
        data.paid_at ?? new Date().toISOString(),
        mapChannel(data.channel ?? 'card')
      );

      console.log(`[webhook] Payment confirmed: ${reference}, order: ${payment.orderId}`);
    }
  } catch (error) {
    console.error('[webhook] Error processing:', error);
    // Don't send error response — Paystack already got 200
  }
}

// ─── POST /api/payments/cash/:orderId ─────────────────────────────────────────
// Staff: manually mark a cash order as paid (super_admin or operations only).

export async function markCashPayment(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      sendError(res, 'Order not found', 404);
      return;
    }

    if (order.paymentStatus === 'paid') {
      sendError(res, 'Order is already marked as paid', 400);
      return;
    }

    const reference = `CASH-${generateReference(orderId)}`;

    // Create payment record for cash
    await prisma.payment.create({
      data: {
        orderId,
        customerId:           order.customerId,
        amount:               order.totalAmount,
        paymentMethod:        'cash',
        transactionReference: reference,
        paymentStatus:        'paid',
        paidAt:               new Date(),
      },
    });

    // Update order payment status
    await prisma.order.update({
      where: { id: orderId },
      data:  { paymentStatus: 'paid' },
    });

    sendSuccess(res, { orderId, reference }, 'Order marked as paid (cash)');
  } catch (error) {
    console.error('[payment/cash]', error);
    sendError(res, 'Failed to mark order as paid', 500);
  }
}

// ─── GET /api/payments/order/:orderId ─────────────────────────────────────────
// Staff or customer: get payment details for a specific order.

export async function getPaymentByOrder(req: Request, res: Response): Promise<void> {
  try {
    const payment = await prisma.payment.findFirst({
      where:   { orderId: req.params.orderId },
      orderBy: { createdAt: 'desc' },
    });

    if (!payment) {
      sendSuccess(res, null, 'No payment record found');
      return;
    }

    sendSuccess(res, payment);
  } catch (error) {
    console.error('[payment/getByOrder]', error);
    sendError(res, 'Failed to fetch payment', 500);
  }
}

// ─── Shared helper ────────────────────────────────────────────────────────────

async function markPaymentSuccess(
  paymentId: string,
  orderId:   string,
  paidAt:    string | null,
  channel:   string
): Promise<void> {
  await prisma.$transaction([
    // Update payment record
    prisma.payment.update({
      where: { id: paymentId },
      data: {
        paymentStatus: 'paid',
        paymentMethod: channel as 'card' | 'bank_transfer' | 'ussd' | 'cash',
        paidAt:        paidAt ? new Date(paidAt) : new Date(),
      },
    }),
    // Update order payment status
    prisma.order.update({
      where: { id: orderId },
      data:  { paymentStatus: 'paid' },
    }),
  ]);
}
