import type { APIRoute } from "astro";
import {
  canAccessFund,
  fundUnlockPrice,
  isPaidFund,
} from "@/lib/funds/access";
import { splitUnlockPayment } from "@/lib/funds/commission";
import { grantEntitlement } from "@/lib/funds/entitlements";
import { getPlatformFeeWallet } from "@/lib/funds/platform-fee-wallet";
import { getFund } from "@/lib/funds/store";
import { resolvePaymentRecipient } from "@/lib/polymarket/payment-recipient";
import { verifyUnlockPayment } from "@/lib/polymarket/verify-unlock-tx";
import type { Hash } from "viem";

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug!;
  const fund = await getFund(slug);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const price = fundUnlockPrice(fund);
  if (!isPaidFund(fund) || price == null) {
    return new Response(JSON.stringify({ error: "This fund is free" }), {
      status: 400,
    });
  }

  let body: { address?: string; txHash?: string };
  try {
    body = (await request.json()) as { address?: string; txHash?: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
    });
  }

  const address = body.address?.trim();
  const txHash = body.txHash?.trim();

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return new Response(JSON.stringify({ error: "Wallet required" }), {
      status: 400,
    });
  }

  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return new Response(JSON.stringify({ error: "Transaction hash required" }), {
      status: 400,
    });
  }

  if (await canAccessFund(fund, address)) {
    return new Response(JSON.stringify({ access: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const recipient = await resolvePaymentRecipient(fund.manager.id);
  if (!recipient) {
    return new Response(JSON.stringify({ error: "Creator wallet unavailable" }), {
      status: 400,
    });
  }

  const split = splitUnlockPayment(price);
  const platformWallet = getPlatformFeeWallet();
  const valid = await verifyUnlockPayment(txHash as Hash, {
    creator: recipient,
    creatorAmount: split.creatorUsdc,
    commission:
      platformWallet && split.commissionUsdc > 0
        ? { recipient: platformWallet, amount: split.commissionUsdc }
        : null,
  });
  if (!valid) {
    return new Response(
      JSON.stringify({ error: "Payment not verified — wrong amount or recipient" }),
      { status: 400 },
    );
  }

  await grantEntitlement(address, slug, txHash);

  return new Response(JSON.stringify({ access: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
