// src/utils/paystack.ts
// Thin wrapper around the Paystack REST API.
// All calls go through here so the key is never scattered across controllers.

import axios from 'axios';
import crypto from 'crypto';

const PAYSTACK_BASE = 'https://api.paystack.co';

function getHeaders() {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not set in environment variables');
  return {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InitializePaymentParams {
  email:      string;
  amount:     number;      // in NAIRA — this function converts to kobo internally
  reference:  string;      // your unique transaction reference
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface InitializePaymentResult {
  authorizationUrl: string;
  accessCode:       string;
  reference:        string;
}

export interface VerifyPaymentResult {
  status:           'success' | 'failed' | 'abandoned' | 'pending';
  reference:        string;
  amount:           number;   // in Naira (converted from kobo)
  paidAt:           string | null;
  channel:          string;
  customerEmail:    string;
}

// ─── Initialize transaction ───────────────────────────────────────────────────

export async function initializePayment(
  params: InitializePaymentParams
): Promise<InitializePaymentResult> {
  const { data } = await axios.post(
    `${PAYSTACK_BASE}/transaction/initialize`,
    {
      email:        params.email,
      amount:       Math.round(params.amount * 100), // convert Naira → kobo
      reference:    params.reference,
      callback_url: params.callbackUrl,
      metadata:     params.metadata ?? {},
    },
    { headers: getHeaders() }
  );

  if (!data.status) {
    throw new Error(data.message || 'Paystack initialization failed');
  }

  return {
    authorizationUrl: data.data.authorization_url,
    accessCode:       data.data.access_code,
    reference:        data.data.reference,
  };
}

// ─── Verify transaction ───────────────────────────────────────────────────────

export async function verifyPayment(reference: string): Promise<VerifyPaymentResult> {
  const { data } = await axios.get(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: getHeaders() }
  );

  if (!data.status) {
    throw new Error(data.message || 'Paystack verification failed');
  }

  const tx = data.data;

  return {
    status:        tx.status,          // 'success' | 'failed' | 'abandoned'
    reference:     tx.reference,
    amount:        tx.amount / 100,    // convert kobo → Naira
    paidAt:        tx.paid_at ?? null,
    channel:       tx.channel,         // 'card' | 'bank_transfer' | 'ussd' etc.
    customerEmail: tx.customer?.email ?? '',
  };
}

// ─── Generate unique reference ────────────────────────────────────────────────

export function generateReference(orderId: string): string {
  const timestamp = Date.now();
  const random    = crypto.randomBytes(4).toString('hex');
  return `FF-${orderId.slice(0, 8).toUpperCase()}-${timestamp}-${random}`;
}

// ─── Verify webhook signature ─────────────────────────────────────────────────
// Paystack signs every webhook with HMAC-SHA512.
// Always verify before trusting the payload.

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return false;

  const hash = crypto
    .createHmac('sha512', secret)
    .update(body)
    .digest('hex');

  return hash === signature;
}
