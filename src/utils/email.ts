// src/utils/email.ts
// Nodemailer email sender with branded HTML templates for FreezeFlow.
// Supports Gmail (App Password) and any SMTP provider.

import nodemailer from 'nodemailer';

// ─── Transporter ─────────────────────────────────────────────────────────────

function createTransporter() {
  const host = process.env.SMTP_HOST;

  // If SMTP_HOST is set, use generic SMTP (e.g. Mailgun, SendGrid, Brevo)
  if (host) {
    return nodemailer.createTransport({
      host,
      port:   parseInt(process.env.SMTP_PORT  || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Default: Gmail with App Password
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_FROM,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });
}

// ─── Send helper ─────────────────────────────────────────────────────────────

interface SendEmailOptions {
  to:      string;
  subject: string;
  html:    string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  // Skip silently in test environment
  if (process.env.NODE_ENV === 'test') return;

  // Skip if email is not configured
  if (!process.env.EMAIL_FROM) {
    console.log(`[email] Skipped (EMAIL_FROM not set): ${subject} → ${to}`);
    return;
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"FreezeFlow" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
    });
    console.log(`[email] Sent: "${subject}" → ${to}`);
  } catch (error) {
    // Log but don't crash — email failure should never break the API response
    console.error('[email] Failed to send:', error);
  }
}

// ─── Base template wrapper ────────────────────────────────────────────────────

function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FreezeFlow</title>
</head>
<body style="margin:0;padding:0;background:#f0f9ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0d8bf5,#29a9ff);padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                ❄️ FreezeFlow
              </p>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">
                Ice Block Production & Delivery
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                © ${new Date().getFullYear()} FreezeFlow. All rights reserved.<br/>
                This is an automated message, please do not reply directly.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Reusable blocks ──────────────────────────────────────────────────────────

function statusBadge(label: string, color: string): string {
  return `<span style="display:inline-block;background:${color}20;color:${color};border:1px solid ${color}40;border-radius:999px;padding:4px 14px;font-size:13px;font-weight:600;">${label}</span>`;
}

function orderSummaryBlock(order: {
  id: string;
  productName: string;
  quantity: number;
  totalAmount: number;
  deliveryMethod: string;
  deliveryAddress?: string | null;
}): string {
  const formattedAmount = new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', minimumFractionDigits: 0,
  }).format(order.totalAmount);

  return `
<table width="100%" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:20px 0;border-collapse:collapse;">
  <tr>
    <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;">
      <span style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Order Reference</span><br/>
      <span style="font-weight:600;font-size:14px;color:#1e293b;">#${order.id.slice(-8).toUpperCase()}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;">
      <span style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Product</span><br/>
      <span style="font-weight:600;font-size:14px;color:#1e293b;">${order.productName} × ${order.quantity}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;">
      <span style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Total</span><br/>
      <span style="font-weight:700;font-size:18px;color:#0d8bf5;">${formattedAmount}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 18px;">
      <span style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Method</span><br/>
      <span style="font-weight:600;font-size:14px;color:#1e293b;">
        ${order.deliveryMethod === 'delivery' ? '🚚 Delivery' : '🏪 Pickup'}
        ${order.deliveryAddress ? `<br/><span style="font-weight:400;color:#64748b;font-size:13px;">📍 ${order.deliveryAddress}</span>` : ''}
      </span>
    </td>
  </tr>
</table>`;
}

// ─── Email templates ──────────────────────────────────────────────────────────

interface OrderEmailData {
  id:              string;
  productName:     string;
  quantity:        number;
  totalAmount:     number;
  deliveryMethod:  string;
  deliveryAddress?: string | null;
  customerName:    string;
  customerEmail:   string;
}

/** Sent to customer when order is placed */
export function orderConfirmedEmail(order: OrderEmailData): { subject: string; html: string } {
  return {
    subject: `Order Received – FreezeFlow #${order.id.slice(-8).toUpperCase()}`,
    html: baseTemplate(`
<h2 style="margin:0 0 8px;font-size:22px;color:#1e293b;">Order Received! 🎉</h2>
<p style="margin:0 0 20px;color:#64748b;font-size:15px;">
  Hi <strong>${order.customerName}</strong>, we've received your order and it's being processed.
</p>
${orderSummaryBlock(order)}
<p style="color:#64748b;font-size:14px;margin:0;">
  We'll send you another email when your order is confirmed and ready.
  You can track your order status in your account at any time.
</p>
    `),
  };
}

/** Sent to customer when order is confirmed by staff */
export function orderStatusUpdateEmail(
  order: OrderEmailData,
  newStatus: string,
  deliveryStaffName?: string
): { subject: string; html: string } {
  const statusLabels: Record<string, { label: string; color: string; message: string }> = {
    confirmed: {
      label:   'Confirmed',
      color:   '#0d8bf5',
      message: 'Great news! Your order has been confirmed and is being prepared.',
    },
    processing: {
      label:   'Processing',
      color:   '#6366f1',
      message: 'Your ice blocks are currently being prepared for you.',
    },
    out_for_delivery: {
      label:   'Out for Delivery',
      color:   '#8b5cf6',
      message: deliveryStaffName
        ? `Your order is on its way! <strong>${deliveryStaffName}</strong> is delivering your ice blocks.`
        : 'Your order is on its way to you right now!',
    },
    delivered: {
      label:   'Delivered ✓',
      color:   '#10b981',
      message: 'Your order has been delivered successfully. Enjoy your fresh ice blocks!',
    },
    cancelled: {
      label:   'Cancelled',
      color:   '#ef4444',
      message: 'Your order has been cancelled. Please contact us if you have any questions.',
    },
  };

  const cfg = statusLabels[newStatus] ?? {
    label: newStatus, color: '#64748b', message: `Your order status has been updated to ${newStatus}.`,
  };

  return {
    subject: `Order Update: ${cfg.label} – FreezeFlow #${order.id.slice(-8).toUpperCase()}`,
    html: baseTemplate(`
<h2 style="margin:0 0 8px;font-size:22px;color:#1e293b;">Order ${cfg.label}</h2>
<p style="margin:0 0 16px;color:#64748b;font-size:15px;">
  Hi <strong>${order.customerName}</strong>,
</p>
<div style="margin:0 0 20px;">
  ${statusBadge(cfg.label, cfg.color)}
</div>
<p style="color:#475569;font-size:15px;margin:0 0 20px;">${cfg.message}</p>
${orderSummaryBlock(order)}
<p style="color:#94a3b8;font-size:13px;margin:0;">
  Thank you for choosing FreezeFlow.
</p>
    `),
  };
}

/** Sent to staff/admin when a new order is placed */
export function newOrderStaffEmail(order: OrderEmailData): { subject: string; html: string } {
  return {
    subject: `New Order #${order.id.slice(-8).toUpperCase()} – ${order.customerName}`,
    html: baseTemplate(`
<h2 style="margin:0 0 8px;font-size:22px;color:#1e293b;">New Order Received 📦</h2>
<p style="margin:0 0 20px;color:#64748b;font-size:15px;">
  A new order has been placed and requires confirmation.
</p>
${orderSummaryBlock(order)}
<table width="100%" style="background:#fef3c7;border-radius:8px;border:1px solid #fbbf24;margin:0 0 20px;border-collapse:collapse;">
  <tr>
    <td style="padding:14px 18px;">
      <p style="margin:0;font-size:14px;color:#92400e;">
        <strong>Customer:</strong> ${order.customerName}<br/>
        <strong>Email:</strong> ${order.customerEmail}
      </p>
    </td>
  </tr>
</table>
<p style="color:#64748b;font-size:14px;margin:0;">
  Log in to the staff portal to confirm and process this order.
</p>
    `),
  };
}

/** Sent to delivery staff when assigned to an order */
export function deliveryAssignmentEmail(
  staffName: string,
  staffEmail: string,
  order: OrderEmailData
): { subject: string; html: string } {
  return {
    subject: `Delivery Assignment – Order #${order.id.slice(-8).toUpperCase()}`,
    html: baseTemplate(`
<h2 style="margin:0 0 8px;font-size:22px;color:#1e293b;">You have a delivery 🚚</h2>
<p style="margin:0 0 20px;color:#64748b;font-size:15px;">
  Hi <strong>${staffName}</strong>, you've been assigned a delivery.
</p>
${orderSummaryBlock(order)}
<p style="color:#64748b;font-size:14px;margin:0;">
  Please ensure you deliver this order promptly and mark it as delivered
  once completed in the staff portal.
</p>
    `),
  };
}
