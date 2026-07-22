import type { FanoutSlice, Mandate } from "@/lib/funds/types";

export function activeMandates(mandates: Mandate[]): Mandate[] {
  return mandates.filter(
    (m) => m.status === "active" && m.notionalUsdc > 0 && m.cashUsdc > 0,
  );
}

export function totalPoolNotional(mandates: Mandate[]): number {
  return round(
    mandates
      .filter((m) => m.status === "active")
      .reduce((sum, m) => sum + m.notionalUsdc, 0),
    2,
  );
}

/** External deposits only — use for raise/cap bars, not compounded notional. */
export function totalPoolDeposited(mandates: Mandate[]): number {
  return round(
    mandates
      .filter((m) => m.status === "active")
      .reduce((sum, m) => sum + (m.depositedUsdc ?? m.notionalUsdc), 0),
    2,
  );
}

export function totalPoolCash(mandates: Mandate[]): number {
  return round(
    mandates
      .filter((m) => m.status === "active")
      .reduce((sum, m) => sum + m.cashUsdc, 0),
    2,
  );
}

export function poolShare(mandate: Mandate, mandates: Mandate[]): number {
  const total = totalPoolNotional(mandates);
  if (total <= 0) return 0;
  return mandate.notionalUsdc / total;
}

/** Split a manager trade across active mandates by pool share. */
export function fanoutTrade(
  totalUsdc: number,
  price: number,
  mandates: Mandate[],
): FanoutSlice[] {
  if (totalUsdc <= 0) throw new Error("Trade amount must be positive");
  if (price <= 0) throw new Error("Price must be positive");

  const eligible = activeMandates(mandates);
  const totalNotional = eligible.reduce((sum, m) => sum + m.notionalUsdc, 0);
  if (eligible.length === 0 || totalNotional <= 0) {
    throw new Error("No active mandates with capital");
  }

  const deployable = round(
    eligible.reduce((sum, m) => sum + m.cashUsdc, 0),
    2,
  );
  if (deployable <= 0) throw new Error("No deployable cash in pool");
  if (totalUsdc > deployable) {
    throw new Error(
      `Pool has $${deployable.toFixed(2)} deployable — cannot trade $${totalUsdc.toFixed(2)}`,
    );
  }

  let allocated = 0;
  const slices: FanoutSlice[] = [];

  for (let i = 0; i < eligible.length; i++) {
    const mandate = eligible[i]!;
    const share = mandate.notionalUsdc / totalNotional;
    let usdcAmount =
      i === eligible.length - 1
        ? round(totalUsdc - allocated, 2)
        : round(totalUsdc * share, 2);

    usdcAmount = Math.min(usdcAmount, mandate.cashUsdc);
    allocated = round(allocated + usdcAmount, 2);

    if (usdcAmount <= 0) continue;

    slices.push({
      mandateId: mandate.id,
      investorWallet: mandate.investorWallet,
      usdcAmount,
      price: round(price, 4),
      shares: round(usdcAmount / price, 4),
      poolShare: round(share, 4),
    });
  }

  return slices;
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
