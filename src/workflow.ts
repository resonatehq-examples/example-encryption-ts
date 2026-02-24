import type { Context } from "@resonatehq/sdk";

// ---------------------------------------------------------------------------
// Payment Processing Workflow — handles sensitive PII
// ---------------------------------------------------------------------------
//
// Every yield* ctx.run() checkpoints data through the promise store.
// With the AesGcmEncryptor, all of this data — credit card numbers,
// SSNs, amounts — is encrypted at rest using AES-256-GCM.
//
// The workflow code itself is unchanged. Encryption is transparent.

export interface PaymentResult {
  orderId: string;
  steps: string[];
  totalMs: number;
}

export function* processPayment(
  ctx: Context,
  orderId: string,
  card: string,
  amount: number,
  shouldCrash: boolean,
): Generator<any, PaymentResult, any> {
  const steps: string[] = [];
  const start = Date.now();

  // Step 1: Validate card (PII passes through encrypted promise store)
  steps.push(yield* ctx.run(validateCard, orderId, card));

  // Step 2: Fraud check (sensitive financial data, encrypted at rest)
  steps.push(yield* ctx.run(fraudCheck, orderId, card, amount));

  // Step 3: Charge payment (crash demo — retry without re-processing steps 1-2)
  steps.push(yield* ctx.run(chargeCard, orderId, card, amount, shouldCrash));

  // Step 4: Send receipt
  steps.push(yield* ctx.run(sendReceipt, orderId, amount));

  return { orderId, steps, totalMs: Date.now() - start };
}

// ---------------------------------------------------------------------------
// Individual steps — all handle sensitive data, all encrypted at rest
// ---------------------------------------------------------------------------

const attemptMap = new Map<string, number>();

async function validateCard(
  _ctx: Context,
  orderId: string,
  card: string,
): Promise<string> {
  await sleep(40);
  const masked = card.slice(-4).padStart(card.length, "*");
  console.log(`  [validate]  ${orderId} — card ${masked} validated`);
  return "validated";
}

async function fraudCheck(
  _ctx: Context,
  orderId: string,
  card: string,
  amount: number,
): Promise<string> {
  await sleep(60);
  console.log(`  [fraud]     ${orderId} — $${amount.toFixed(2)} cleared fraud check`);
  return "cleared";
}

async function chargeCard(
  _ctx: Context,
  orderId: string,
  card: string,
  amount: number,
  shouldCrash: boolean,
): Promise<string> {
  const key = `${orderId}:charge`;
  const attempt = (attemptMap.get(key) ?? 0) + 1;
  attemptMap.set(key, attempt);

  await sleep(50);

  if (shouldCrash && attempt === 1) {
    console.log(`  [charge]    ${orderId} — payment gateway timeout (retrying...)`);
    throw new Error("Payment gateway timeout");
  }

  const retryTag = attempt > 1 ? ` (retry ${attempt})` : "";
  const masked = card.slice(-4).padStart(card.length, "*");
  console.log(`  [charge]    ${orderId} — charged $${amount.toFixed(2)} to ${masked}${retryTag}`);
  return "charged";
}

async function sendReceipt(
  _ctx: Context,
  orderId: string,
  amount: number,
): Promise<string> {
  await sleep(30);
  console.log(`  [receipt]   ${orderId} — receipt sent for $${amount.toFixed(2)}`);
  return "receipt_sent";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
