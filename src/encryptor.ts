import type { Encryptor } from "@resonatehq/sdk";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// AES-256-GCM Encryptor — implements Resonate's Encryptor interface
// ---------------------------------------------------------------------------
//
// Encrypts promise payloads at rest using AES-256-GCM.
// All data passing through Resonate's promise store is encrypted — function
// arguments, return values, and intermediate state.
//
// Temporal's equivalent requires 7 files (~249 LOC): a PayloadCodec,
// DataConverter, protobuf serialization, key management, and a separate
// Express "codec server" for the Web UI. Resonate: one class, one interface.

interface Value {
  headers?: Record<string, string>;
  data?: string;
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class AesGcmEncryptor implements Encryptor {
  private rawKey: Buffer;
  private keyId: string;

  constructor(keyHex: string, keyId = "default") {
    this.rawKey = Buffer.from(keyHex, "hex");
    this.keyId = keyId;

    if (this.rawKey.length !== 32) {
      throw new Error("Encryption key must be 32 bytes (64 hex characters)");
    }
  }

  encrypt(plaintext: Value): Value {
    if (!plaintext.data) return plaintext;

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.rawKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext.data, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Pack: [iv (12)] + [ciphertext] + [tag (16)]
    const packed = Buffer.concat([iv, encrypted, tag]);

    return {
      headers: {
        ...plaintext.headers,
        "x-encrypted": "true",
        "x-encryption-key-id": this.keyId,
      },
      data: packed.toString("base64"),
    };
  }

  decrypt(ciphertext: Value): Value {
    if (!ciphertext.data) return ciphertext;
    if (ciphertext.headers?.["x-encrypted"] !== "true") return ciphertext;

    const packed = Buffer.from(ciphertext.data, "base64");
    const iv = packed.subarray(0, IV_LENGTH);
    const tag = packed.subarray(packed.length - TAG_LENGTH);
    const encrypted = packed.subarray(IV_LENGTH, packed.length - TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.rawKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    const {
      "x-encrypted": _,
      "x-encryption-key-id": __,
      ...cleanHeaders
    } = ciphertext.headers ?? {};

    return {
      headers: cleanHeaders,
      data: decrypted.toString("utf8"),
    };
  }
}

// ---------------------------------------------------------------------------
// Demo helper — show what encrypted data looks like
// ---------------------------------------------------------------------------

export function inspectEncryption(encryptor: AesGcmEncryptor): void {
  const sample: Value = {
    headers: {},
    data: Buffer.from(JSON.stringify({
      creditCard: "4111-1111-1111-1111",
      ssn: "123-45-6789",
      amount: 499.99,
    })).toString("base64"),
  };

  console.log("=== Encryption Demo ===\n");
  console.log("Plaintext payload (base64-encoded JSON):");
  console.log(`  ${sample.data}`);
  console.log(`  Decoded: ${Buffer.from(sample.data!, "base64").toString("utf8")}\n`);

  const encrypted = encryptor.encrypt(sample);
  console.log("Encrypted payload (what's stored in the promise store):");
  console.log(`  ${encrypted.data?.substring(0, 60)}...`);
  console.log(`  Headers: ${JSON.stringify(encrypted.headers)}\n`);

  const decrypted = encryptor.decrypt(encrypted);
  console.log("Decrypted payload (what your code sees):");
  console.log(`  ${decrypted?.data}`);
  console.log(`  Decoded: ${Buffer.from(decrypted!.data!, "base64").toString("utf8")}\n`);

  console.log("PII is never visible in the promise store. Only encrypted blobs.\n");
}
