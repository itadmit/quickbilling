import { Receiver } from "@upstash/qstash";

let _receiver: Receiver | undefined;

function getReceiver(): Receiver {
  if (_receiver) return _receiver;
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) {
    throw new Error("QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY not set");
  }
  _receiver = new Receiver({
    currentSigningKey: current,
    nextSigningKey: next,
  });
  return _receiver;
}

/**
 * Verify a QStash-signed request. Returns true if valid; in dev (no keys
 * configured) returns true to allow local testing.
 */
export async function verifyQStash(request: Request, body: string): Promise<boolean> {
  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[qstash] no signature in dev mode — accepting");
      return true;
    }
    return false;
  }
  try {
    const receiver = getReceiver();
    return await receiver.verify({ signature, body });
  } catch (err) {
    console.error("[qstash] verify failed:", err);
    return false;
  }
}
