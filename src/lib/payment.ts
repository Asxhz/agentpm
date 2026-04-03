// ============================================================
// AgentPay Router - x402 Payment Protocol Layer
// Implements the x402 "HTTP 402 Payment Required" flow
// ============================================================

import { PaymentRequirements, PaymentPayload, PaymentResult } from "./types";

// USDC contract address on Base Sepolia testnet
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// Convert USD amount to USDC atomic units (6 decimals)
export function usdToAtomicUnits(usd: number): string {
  return Math.floor(usd * 1_000_000).toString();
}

// Convert atomic units back to USD
export function atomicUnitsToUsd(units: string): number {
  return parseInt(units) / 1_000_000;
}

// Create x402 Payment Requirements (what the provider sends back)
// This follows the exact x402 protocol spec from coinbase/x402
export function createPaymentRequirements(
  payTo: string,
  amountUsd: number,
  description: string,
  network: string = "base-sepolia"
): PaymentRequirements {
  return {
    scheme: "exact",
    network,
    asset: USDC_BASE_SEPOLIA,
    amount: usdToAtomicUnits(amountUsd),
    payTo,
    maxTimeoutSeconds: 600,
    description,
    extra: {
      name: "USDC",
      version: "2",
    },
  };
}

// Sign a payment (simulates EIP-712 signing via OWS wallet)
// In production: ows.signTypedData(wallet, "evm", typedDataJson)
export function signPayment(
  fromAddress: string,
  requirements: PaymentRequirements
): PaymentPayload {
  const now = Math.floor(Date.now() / 1000);

  // Generate random nonce (32 bytes)
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const nonce =
    "0x" +
    Array.from(nonceBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  // Simulate EIP-712 signature
  const sigBytes = new Uint8Array(65);
  crypto.getRandomValues(sigBytes);
  const signature =
    "0x" +
    Array.from(sigBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  return {
    x402Version: 1,
    scheme: requirements.scheme,
    network: requirements.network,
    payload: {
      signature,
      authorization: {
        from: fromAddress,
        to: requirements.payTo,
        value: requirements.amount,
        validAfter: 0,
        validBefore: now + requirements.maxTimeoutSeconds,
        nonce,
      },
    },
  };
}

// Verify payment with facilitator
// In production: POST https://facilitator.x402.org/verify
export function verifyPayment(
  payload: PaymentPayload,
  requirements: PaymentRequirements
): { isValid: boolean; payer: string; invalidReason?: string } {
  // Verify amount matches
  if (payload.payload.authorization.value !== requirements.amount) {
    return {
      isValid: false,
      payer: payload.payload.authorization.from,
      invalidReason: "Amount mismatch",
    };
  }

  // Verify not expired
  const now = Math.floor(Date.now() / 1000);
  if (payload.payload.authorization.validBefore < now) {
    return {
      isValid: false,
      payer: payload.payload.authorization.from,
      invalidReason: "Payment expired",
    };
  }

  return {
    isValid: true,
    payer: payload.payload.authorization.from,
  };
}

// Settle payment on-chain
// In production: POST https://facilitator.x402.org/settle
export function settlePayment(
  payload: PaymentPayload,
  requirements: PaymentRequirements
): PaymentResult {
  const txHashBytes = new Uint8Array(32);
  crypto.getRandomValues(txHashBytes);
  const txHash =
    "0x" +
    Array.from(txHashBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  return {
    success: true,
    txHash,
    amount: atomicUnitsToUsd(requirements.amount),
    from: payload.payload.authorization.from,
    to: requirements.payTo,
    network: requirements.network,
    settledAt: new Date().toISOString(),
  };
}

// Full x402 payment flow: require → sign → verify → settle
export function executeX402Payment(
  fromAddress: string,
  toAddress: string,
  amountUsd: number,
  description: string,
  network: string = "base-sepolia"
): {
  requirements: PaymentRequirements;
  payload: PaymentPayload;
  verification: { isValid: boolean; payer: string };
  settlement: PaymentResult;
} {
  // Step 1: Provider creates payment requirements (HTTP 402 response)
  const requirements = createPaymentRequirements(
    toAddress,
    amountUsd,
    description,
    network
  );

  // Step 2: Agent signs payment (EIP-712 via OWS wallet)
  const payload = signPayment(fromAddress, requirements);

  // Step 3: Facilitator verifies signature
  const verification = verifyPayment(payload, requirements);

  // Step 4: Facilitator settles on-chain
  const settlement = settlePayment(payload, requirements);

  return { requirements, payload, verification, settlement };
}
