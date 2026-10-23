import { createHmac, timingSafeEqual } from "node:crypto";

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (typeof payload !== "string" || !signatureHeader || !secret || !Number.isSafeInteger(now)) {
    return false;
  }

  let timestamp: number | undefined;
  const signatures: string[] = [];

  for (const part of signatureHeader.split(",")) {
    const [key, value, ...extra] = part.trim().split("=");
    if (!key || !value || extra.length) {
      return false;
    }

    if (key === "t") {
      if (timestamp !== undefined || !/^\d+$/.test(value)) {
        return false;
      }
      timestamp = Number(value);
    } else if (key === "v1") {
      if (!/^[0-9a-f]{64}$/i.test(value)) {
        return false;
      }
      signatures.push(value);
    }
  }

  if (
    timestamp === undefined ||
    !Number.isSafeInteger(timestamp) ||
    signatures.length === 0 ||
    Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  return signatures.some((signature) => timingSafeEqual(Buffer.from(signature, "hex"), expected));
}
