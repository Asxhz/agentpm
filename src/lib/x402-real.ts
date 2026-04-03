// ============================================================
// Real x402 Payment Layer - Base Sepolia Testnet
// EIP-712 signing, real USDC contract, real facilitator
// ============================================================

import { ethers } from "ethers";

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_RPC = "https://sepolia.base.org";
const FACILITATOR_URL = "https://x402.org/facilitator";

// Agent wallet - generated once, stored in env or generated fresh
let agentWallet: ethers.Wallet | ethers.HDNodeWallet | null = null;
let provider: ethers.JsonRpcProvider | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
  }
  return provider;
}

// Initialize or load the agent wallet
export function getAgentWallet(): { address: string; privateKey: string } {
  if (!agentWallet) {
    const pk = process.env.AGENT_PRIVATE_KEY;
    if (pk) {
      agentWallet = new ethers.Wallet(pk, getProvider());
    } else {
      // Generate a new wallet for this session
      agentWallet = ethers.Wallet.createRandom().connect(getProvider());
    }
  }
  return { address: agentWallet!.address, privateKey: agentWallet!.privateKey };
}

// Get real ETH balance on Base Sepolia
export async function getETHBalance(): Promise<string> {
  const w = getAgentWallet();
  const p = getProvider();
  const balance = await p.getBalance(w.address);
  return ethers.formatEther(balance);
}

// Get real USDC balance on Base Sepolia
export async function getUSDCBalance(): Promise<string> {
  const w = getAgentWallet();
  const p = getProvider();
  const usdc = new ethers.Contract(
    USDC_BASE_SEPOLIA,
    ["function balanceOf(address) view returns (uint256)"],
    p
  );
  const balance = await usdc.balanceOf(w.address);
  return ethers.formatUnits(balance, 6);
}

// EIP-712 domain for USDC on Base Sepolia
const EIP712_DOMAIN: ethers.TypedDataDomain = {
  name: "USD Coin",
  version: "2",
  chainId: BASE_SEPOLIA_CHAIN_ID,
  verifyingContract: USDC_BASE_SEPOLIA,
};

const EIP712_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

// Sign a real EIP-712 TransferWithAuthorization for x402
export async function signPaymentAuthorization(
  toAddress: string,
  amountUSD: number,
  validForSeconds: number = 600
): Promise<{
  signature: string;
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: number;
    validBefore: number;
    nonce: string;
  };
  domain: ethers.TypedDataDomain;
}> {
  if (!agentWallet) getAgentWallet();

  const value = ethers.parseUnits(amountUSD.toFixed(6), 6);
  const now = Math.floor(Date.now() / 1000);
  const nonce = ethers.hexlify(ethers.randomBytes(32));

  const authorization = {
    from: agentWallet!.address,
    to: toAddress,
    value: value.toString(),
    validAfter: 0,
    validBefore: now + validForSeconds,
    nonce,
  };

  const signature = await agentWallet!.signTypedData(
    EIP712_DOMAIN,
    EIP712_TYPES,
    authorization
  );

  return { signature, authorization, domain: EIP712_DOMAIN };
}

// Build a full x402 payment payload
export async function buildX402Payment(
  toAddress: string,
  amountUSD: number
): Promise<{
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: number;
      validBefore: number;
      nonce: string;
    };
  };
}> {
  const { signature, authorization } = await signPaymentAuthorization(toAddress, amountUSD);

  return {
    x402Version: 1,
    scheme: "exact",
    network: "base-sepolia",
    payload: { signature, authorization },
  };
}

// Verify a payment with the x402 facilitator
export async function verifyWithFacilitator(
  paymentPayload: unknown,
  paymentRequirements: unknown
): Promise<{ isValid: boolean; payer?: string; invalidReason?: string }> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload,
        paymentRequirements,
      }),
    });
    if (!res.ok) {
      return { isValid: false, invalidReason: `Facilitator returned ${res.status}` };
    }
    return await res.json();
  } catch (err) {
    return { isValid: false, invalidReason: err instanceof Error ? err.message : "Facilitator unreachable" };
  }
}

// Settle a payment with the x402 facilitator
export async function settleWithFacilitator(
  paymentPayload: unknown,
  paymentRequirements: unknown
): Promise<{ success: boolean; transaction?: string; network?: string; error?: string }> {
  try {
    const res = await fetch(`${FACILITATOR_URL}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload,
        paymentRequirements,
      }),
    });
    if (!res.ok) {
      return { success: false, error: `Facilitator returned ${res.status}` };
    }
    return await res.json();
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Settlement failed" };
  }
}

// Full real x402 payment flow
export async function executeRealX402Payment(
  toAddress: string,
  amountUSD: number,
  description: string
): Promise<{
  success: boolean;
  signed: boolean;
  verified: boolean;
  settled: boolean;
  paymentPayload?: unknown;
  verification?: { isValid: boolean; payer?: string; invalidReason?: string };
  settlement?: { success: boolean; transaction?: string; network?: string; error?: string };
  signerAddress: string;
  recipientAddress: string;
  amount: number;
  network: string;
  description: string;
  error?: string;
}> {
  const wallet = getAgentWallet();

  try {
    // Step 1: Sign EIP-712 authorization
    const paymentPayload = await buildX402Payment(toAddress, amountUSD);

    // Step 2: Build payment requirements (what the server would send in 402 response)
    const paymentRequirements = {
      scheme: "exact",
      network: "base-sepolia",
      maxAmountRequired: ethers.parseUnits(amountUSD.toFixed(6), 6).toString(),
      asset: USDC_BASE_SEPOLIA,
      payTo: toAddress,
      maxTimeoutSeconds: 600,
      description,
      extra: { name: "USD Coin", version: "2" },
    };

    // Step 3: Verify with facilitator
    const verification = await verifyWithFacilitator(paymentPayload, paymentRequirements);

    // Step 4: Settle (only if verified)
    let settlement = undefined;
    if (verification.isValid) {
      settlement = await settleWithFacilitator(paymentPayload, paymentRequirements);
    }

    return {
      success: verification.isValid && (settlement?.success ?? false),
      signed: true,
      verified: verification.isValid,
      settled: settlement?.success ?? false,
      paymentPayload,
      verification,
      settlement,
      signerAddress: wallet.address,
      recipientAddress: toAddress,
      amount: amountUSD,
      network: "base-sepolia",
      description,
    };
  } catch (err) {
    return {
      success: false,
      signed: false,
      verified: false,
      settled: false,
      signerAddress: wallet.address,
      recipientAddress: toAddress,
      amount: amountUSD,
      network: "base-sepolia",
      description,
      error: err instanceof Error ? err.message : "Payment failed",
    };
  }
}

// Get wallet info for display
export async function getWalletInfo(): Promise<{
  address: string;
  ethBalance: string;
  usdcBalance: string;
  network: string;
  chainId: number;
  rpc: string;
  usdcContract: string;
}> {
  const wallet = getAgentWallet();
  let ethBalance = "0.0";
  let usdcBalance = "0.0";

  try { ethBalance = await getETHBalance(); } catch { /* rpc may be down */ }
  try { usdcBalance = await getUSDCBalance(); } catch { /* rpc may be down */ }

  return {
    address: wallet.address,
    ethBalance,
    usdcBalance,
    network: "base-sepolia",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpc: BASE_SEPOLIA_RPC,
    usdcContract: USDC_BASE_SEPOLIA,
  };
}
