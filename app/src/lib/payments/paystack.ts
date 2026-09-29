import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The slice of Paystack's API we use. Amounts cross this boundary in KES and
 * are converted to subunits (cents) here, so the rest of the code never
 * multiplies by 100.
 */

const API = "https://api.paystack.co";
const TIMEOUT_MS = 10_000;

export interface PaystackTransaction {
  id: number;
  reference: string;
  /** success | failed | abandoned | ongoing | pending | processing | queued | reversed */
  status: string;
  /** Subunits (cents). */
  amount: number;
  currency: string;
  channel: string | null;
  gateway_response: string | null;
  message?: string | null;
  paid_at: string | null;
  metadata?: Record<string, unknown> | string | null;
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

export function paystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_PUBLIC_KEY);
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${secretKey()}`, "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!response.ok || body.status !== true) {
    const error = new Error(`Paystack ${init.method ?? "GET"} ${path}: ${response.status} ${body.message ?? ""}`.trim());
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body.data as T;
}

/** Paystack wants a real-looking email. Test accounts (.test, .local…) get a stand-in keyed by user id. */
export function paystackEmail(email: string | null | undefined, userId: string): string {
  const valid = email && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) && !/\.(test|local|localhost|invalid|example)$/i.test(email);
  return valid ? email : `viewer-${userId.toLowerCase().replace(/[^a-z0-9]/g, "")}@yakwetu.africa`;
}

export async function initializeTransaction(input: {
  reference: string;
  email: string;
  amountKes: number;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}): Promise<{ authorization_url: string; access_code: string; reference: string }> {
  return call("/transaction/initialize", {
    method: "POST",
    body: {
      reference: input.reference,
      email: input.email,
      amount: Math.round(input.amountKes * 100),
      currency: "KES",
      // M-Pesa (mobile money) first: it's how most Kenyan viewers pay.
      channels: ["mobile_money", "card"],
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    },
  });
}

/** The authoritative answer for a reference. 404 (never initialised) surfaces as an error with status 404. */
export async function verifyTransaction(reference: string): Promise<PaystackTransaction> {
  return call(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/** x-paystack-signature is HMAC-SHA512 of the raw body with the secret key. Constant-time compare. */
export function validSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Why a payment failed, in a few classes the rescue workflow can act on.
 * Based on the storefront team's mapFailureReason (yakwetu services/paystack-api).
 */
export function classifyFailure(gatewayResponse: string | null | undefined, status?: string): string {
  const text = `${gatewayResponse ?? ""} ${status ?? ""}`.toLowerCase();
  if (/insufficient|balance|fund/.test(text)) return "insufficient_funds";
  if (/pin|otp|authoris|authoriz/.test(text)) return "wrong_pin";
  if (/timeout|timed out|cancel|abandon|expired|not completed/.test(text)) return "timeout_or_cancel";
  if (/limit/.test(text)) return "limit_exceeded";
  return "declined";
}
