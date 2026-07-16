import { listMandatesForInvestor } from "@/lib/funds/mandates";
import { getFund } from "@/lib/funds/store";

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** pUSD in the deposit wallet reserved for open fund mandates. */
export async function investorLockedDepositUsdc(wallet: string): Promise<number> {
  const mandates = await listMandatesForInvestor(wallet);
  let locked = 0;

  for (const mandate of mandates) {
    if (mandate.status === "closed") continue;
    const fund = await getFund(mandate.fundSlug);
    if (!fund || fund.status === "closed") continue;
    locked += mandate.notionalUsdc;
  }

  return round(locked, 2);
}

export function withdrawableDepositUsdc(
  depositBalance: number,
  lockedUsdc: number,
): number {
  return round(Math.max(0, depositBalance - lockedUsdc), 2);
}
