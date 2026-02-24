import { Resonate } from "@resonatehq/sdk";
import { AesGcmEncryptor, inspectEncryption } from "./encryptor";
import { processPayment } from "./workflow";

// ---------------------------------------------------------------------------
// Encryption key — in production, load from KMS / environment
// ---------------------------------------------------------------------------
// 32 bytes (256 bits) represented as 64 hex characters

const ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const encryptor = new AesGcmEncryptor(ENCRYPTION_KEY, "demo-key-v1");

// Show what encryption looks like on raw data
inspectEncryption(encryptor);

// ---------------------------------------------------------------------------
// Resonate setup — plug in the encryptor
// ---------------------------------------------------------------------------

const resonate = new Resonate({ encryptor });
resonate.register(processPayment);

// ---------------------------------------------------------------------------
// Run the encrypted workflow
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const shouldCrash = args.includes("--crash");

const orderId = `order-${Date.now()}`;
const card = "4111-1111-1111-1111";
const amount = 299.99;

const modeDescriptions = {
  normal: "HAPPY PATH (all PII encrypted at rest throughout)",
  crash: "CRASH DEMO  (payment gateway fails, retries with encrypted state)",
};

console.log("=== Encrypted Payment Workflow ===");
console.log(`Mode: ${modeDescriptions[shouldCrash ? "crash" : "normal"]}`);
console.log(`Order: ${orderId}`);
console.log(`Card: ${card.slice(-4).padStart(card.length, "*")} (encrypted in promise store)\n`);

const wallStart = Date.now();

const result = await resonate.run(
  `payment/${orderId}`,
  processPayment,
  orderId,
  card,
  amount,
  shouldCrash,
);

const wallMs = Date.now() - wallStart;

console.log("\n=== Result ===");
console.log(JSON.stringify({ ...result, wallTimeMs: wallMs }, null, 2));

if (shouldCrash) {
  console.log(
    "\nNotice: validate and fraud check logged once (cached before crash).",
    "\nCharge failed → retried → succeeded. PII never stored in plaintext.",
  );
}
