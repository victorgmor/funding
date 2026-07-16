import type { APIRoute } from "astro";
import type { Address } from "viem";
import {
  investorLockedDepositUsdc,
  withdrawableDepositUsdc,
} from "@/lib/funds/investor-deposit";
import { readDepositWalletBalanceUsdc } from "@/lib/polymarket/deposit-balance";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const address = url.searchParams.get("address")?.trim();
  if (!address) {
    return new Response(JSON.stringify({ error: "Wallet required" }), {
      status: 400,
    });
  }

  try {
    const [depositCollateral, lockedUsdc] = await Promise.all([
      readDepositWalletBalanceUsdc(address as Address),
      investorLockedDepositUsdc(address),
    ]);

    return new Response(
      JSON.stringify({
        depositCollateral,
        lockedUsdc,
        withdrawableUsdc: withdrawableDepositUsdc(
          depositCollateral,
          lockedUsdc,
        ),
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Deposit info failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
