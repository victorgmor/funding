import type { Fund } from "@/lib/funds/types";

export type LifecycleStage = "deposit" | "trading" | "closed";
export type StageState = "past" | "current" | "future";

export type LifecycleStageView = {
  id: LifecycleStage;
  label: string;
  state: StageState;
  line1: string;
  line2?: string;
};

const DAY_MS = 86_400_000;

export function formatFundDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function daysUntil(iso: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / DAY_MS));
}

export function daysSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / DAY_MS));
}

export function effectiveClosedAt(fund: Fund, now = Date.now()): string | null {
  if (fund.closedAt) return fund.closedAt;
  if (fund.status === "closed" && fund.tradingEndsAt) return fund.tradingEndsAt;
  if (fund.tradingEndsAt && Date.parse(fund.tradingEndsAt) < now) {
    return fund.tradingEndsAt;
  }
  return null;
}

export function resolveLifecycleStage(
  fund: Fund,
  now = Date.now(),
): LifecycleStage {
  if (fund.status === "closed" || fund.closedAt) return "closed";
  if (fund.tradingEndsAt && Date.parse(fund.tradingEndsAt) < now) {
    return "closed";
  }
  if (fund.raiseEndsAt && Date.parse(fund.raiseEndsAt) >= now) {
    return "deposit";
  }
  return "trading";
}

export function buildLifecycleStages(
  fund: Fund,
  now = Date.now(),
): LifecycleStageView[] {
  const current = resolveLifecycleStage(fund, now);
  const closedAt = effectiveClosedAt(fund, now);

  const deposit: LifecycleStageView = {
    id: "deposit",
    label: "Deposit Stage",
    state:
      current === "deposit"
        ? "current"
        : current === "trading" || current === "closed"
          ? "past"
          : "future",
    line1: "",
  };

  if (fund.raiseEndsAt) {
    const date = formatFundDate(fund.raiseEndsAt);
    if (current === "deposit") {
      const days = daysUntil(fund.raiseEndsAt, now);
      deposit.line1 =
        days > 0 ? `Ends ${date} · ${days} ${days === 1 ? "day" : "days"}` : `Ends ${date}`;
    } else {
      deposit.line1 = `Closed ${date}`;
    }
  } else {
    deposit.line1 = current === "deposit" ? "Accepting commitments" : "—";
  }

  const trading: LifecycleStageView = {
    id: "trading",
    label: "Trading Stage",
    state:
      current === "trading"
        ? "current"
        : current === "closed"
          ? "past"
          : "future",
    line1: "",
  };

  if (fund.tradingEndsAt) {
    const date = formatFundDate(fund.tradingEndsAt);
    if (current === "trading") {
      const days = daysUntil(fund.tradingEndsAt, now);
      trading.line1 =
        days > 0 ? `Ends ${date} · ${days} ${days === 1 ? "day" : "days"}` : `Ends ${date}`;
    } else if (current === "closed") {
      trading.line1 = `Ends ${date}`;
    } else {
      trading.line1 = `Opens after deposit · ends ${date}`;
    }
  } else {
    trading.line1 =
      current === "trading" ? "Manager may open risk" : current === "closed" ? "Ended" : "—";
  }

  const closed: LifecycleStageView = {
    id: "closed",
    label: "Closed Stage",
    state: current === "closed" ? "current" : "future",
    line1: "",
  };

  if (current === "closed" && closedAt) {
    const date = formatFundDate(closedAt);
    const ago = daysSince(closedAt, now);
    closed.line1 = date;
    closed.line2 =
      ago === 0
        ? "Fund closed today"
        : `Fund closed ${ago} ${ago === 1 ? "day" : "days"} ago`;
  } else if (fund.tradingEndsAt) {
    closed.line1 = formatFundDate(fund.tradingEndsAt);
    closed.line2 = "Planned close";
  } else {
    closed.line1 = "—";
  }

  return [deposit, trading, closed];
}

export function parseFundDateInput(value: string): string {
  const text = value.trim();
  if (!text) throw new Error("Date required");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T23:59:59.999Z`).toISOString();
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw new Error("Invalid date");
  return new Date(ms).toISOString();
}

export function validateLifecycleDates(
  raiseEndsAt: string | null | undefined,
  tradingEndsAt: string | null | undefined,
): string | null {
  if (!raiseEndsAt || !tradingEndsAt) {
    return "Deposit and trading end dates are required";
  }

  const raiseMs = Date.parse(raiseEndsAt);
  const tradingMs = Date.parse(tradingEndsAt);
  if (!Number.isFinite(raiseMs) || !Number.isFinite(tradingMs)) {
    return "Invalid lifecycle dates";
  }

  const now = Date.now();
  if (raiseMs <= now) return "Deposit end date must be in the future";
  if (tradingMs <= raiseMs) {
    return "Trading must end after the deposit window";
  }

  return null;
}

export function defaultLifecycleDate(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/** Shift dates/status so resolveLifecycleStage returns the requested stage (testing only). */
export function fundPatchForTestStage(
  stage: LifecycleStage,
  now = Date.now(),
): Pick<Fund, "status" | "closedAt" | "raiseEndsAt" | "tradingEndsAt"> {
  if (stage === "deposit") {
    return {
      status: "trading",
      closedAt: null,
      raiseEndsAt: new Date(now + 30 * DAY_MS).toISOString(),
      tradingEndsAt: new Date(now + 60 * DAY_MS).toISOString(),
    };
  }

  if (stage === "trading") {
    return {
      status: "trading",
      closedAt: null,
      raiseEndsAt: new Date(now - DAY_MS).toISOString(),
      tradingEndsAt: new Date(now + 30 * DAY_MS).toISOString(),
    };
  }

  return {
    status: "closed",
    closedAt: new Date(now).toISOString(),
    raiseEndsAt: new Date(now - 60 * DAY_MS).toISOString(),
    tradingEndsAt: new Date(now - DAY_MS).toISOString(),
  };
}
