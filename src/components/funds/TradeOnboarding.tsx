import { useEffect, useMemo, useState } from "react";
import {
  isTradeOnboardingDone,
  markTradeOnboardingDone,
} from "@/lib/trade/onboarding-storage";

type Context = {
  isConnected: boolean;
  onPolygon: boolean;
  restoring: boolean;
  canEnter: boolean;
  usdcBalance: number | null;
  usdcLoading: boolean;
};

type Step = {
  id: string;
  title: string;
  body: React.ReactNode;
  show: (ctx: Context) => boolean;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Enter a bundle in one click",
    show: () => true,
    body: (
      <>
        <p>
          A bundle is a basket of Polymarket markets. Entering buys every leg
          in the thesis — weighted by the creator — in a single flow.
        </p>
        <p className="mt-2">
          Non-custodial: orders go straight to Polymarket on Polygon. You can
          exit anytime to sell all positions.
        </p>
      </>
    ),
  },
  {
    id: "wallet",
    title: "Connect your wallet",
    show: (ctx) => !ctx.isConnected && !ctx.restoring,
    body: (
      <>
        <p>
          Use MetaMask or any browser wallet. Carriera runs on{" "}
          <strong className="text-primary font-medium">Polygon</strong> — the
          same network Polymarket uses.
        </p>
        <p className="mt-2">
          Click{" "}
          <strong className="text-primary font-medium">Connect wallet</strong>{" "}
          below, then approve the connection in your wallet popup.
        </p>
      </>
    ),
  },
  {
    id: "polygon",
    title: "Switch to Polygon",
    show: (ctx) => ctx.isConnected && !ctx.onPolygon && !ctx.restoring,
    body: (
      <p>
        Your wallet needs to be on Polygon. We&apos;ll prompt a network switch
        automatically — approve it in your wallet if asked.
      </p>
    ),
  },
  {
    id: "usdc",
    title: "pUSD on Polygon",
    show: (ctx) => ctx.isConnected && ctx.onPolygon && ctx.canEnter,
    body: null,
  },
  {
    id: "amount",
    title: "Choose an amount",
    show: (ctx) => ctx.isConnected && ctx.onPolygon && ctx.canEnter,
    body: (
      <>
        <p>
          Enter how much pUSD to invest (minimum ~$5). Your total is split
          across markets by each leg&apos;s weight.
        </p>
        <p className="mt-2">
          Tap{" "}
          <strong className="text-primary font-medium">Preview orders</strong>{" "}
          to see the breakdown before you commit.
        </p>
      </>
    ),
  },
  {
    id: "confirm",
    title: "Sign to confirm",
    show: (ctx) => ctx.isConnected && ctx.onPolygon && ctx.canEnter,
    body: (
      <>
        <p>
          On your first trade, Polymarket may ask for a few wallet signatures
          to set up your trading account and deposit wallet. This is normal.
        </p>
        <p className="mt-2">
          After preview, hit{" "}
          <strong className="text-primary font-medium">Buy</strong> and approve
          each prompt. Your position will show here once filled.
        </p>
      </>
    ),
  },
];

type Props = {
  isConnected: boolean;
  onPolygon: boolean;
  restoring: boolean;
  canEnter: boolean;
  usdcBalance: number | null;
  usdcLoading: boolean;
  restartKey?: number;
};

function UsdcStepBody({
  balance,
  loading,
}: {
  balance: number | null;
  loading: boolean;
}) {
  const low = balance != null && balance < 5;

  return (
    <>
      <p>
        You need pUSD on Polygon to enter a bundle. Carriera checks both native
        and bridged pUSD in your wallet.
      </p>
      <p className="border-primary/10 bg-primary/5 mt-3 rounded border px-3 py-2 font-mono text-sm tabular-nums">
        {loading ? (
          <span className="text-primary/50">Loading balance…</span>
        ) : balance != null ? (
          <>
            <span className="text-primary/50 text-xs uppercase">Your balance</span>
            <span className="text-primary mt-0.5 block text-lg">
              ${balance.toFixed(2)}
            </span>
          </>
        ) : (
          <span className="text-primary/50">Could not load balance</span>
        )}
      </p>
      {low && (
        <p className="text-accent mt-2 text-sm">
          Add at least $5 pUSD on Polygon before entering. Bridge or swap on{" "}
          <a
            href="https://wallet.polygon.technology/polygon-bridge"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            Polygon Portal
          </a>{" "}
          or buy on an exchange and withdraw to Polygon.
        </p>
      )}
    </>
  );
}

export default function TradeOnboarding({
  isConnected,
  onPolygon,
  restoring,
  canEnter,
  usdcBalance,
  usdcLoading,
  restartKey = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const ctx: Context = {
    isConnected,
    onPolygon,
    restoring,
    canEnter,
    usdcBalance,
    usdcLoading,
  };

  const visibleSteps = useMemo(
    () => STEPS.filter((step) => step.show(ctx)),
    [isConnected, onPolygon, restoring, canEnter, usdcBalance, usdcLoading],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !canEnter) {
      setOpen(false);
      return;
    }
    if (isTradeOnboardingDone()) return;
    setOpen(true);
  }, [canEnter]);

  useEffect(() => {
    if (!restartKey) return;
    setStepIndex(0);
    setOpen(true);
  }, [restartKey]);

  useEffect(() => {
    if (stepIndex >= visibleSteps.length && visibleSteps.length > 0) {
      setStepIndex(visibleSteps.length - 1);
    }
  }, [visibleSteps, stepIndex]);

  useEffect(() => {
    const currentId = visibleSteps[stepIndex]?.id;
    if (!currentId) return;
    if (!visibleSteps.some((s) => s.id === currentId)) {
      setStepIndex((i) => Math.min(i, Math.max(0, visibleSteps.length - 1)));
    }
  }, [visibleSteps, stepIndex]);

  function finish() {
    markTradeOnboardingDone();
    setOpen(false);
  }

  if (!open || visibleSteps.length === 0) return null;

  const step = visibleSteps[stepIndex] ?? visibleSteps[0]!;
  const isLast = stepIndex >= visibleSteps.length - 1;
  const body =
    step.id === "usdc" ? (
      <UsdcStepBody balance={usdcBalance} loading={usdcLoading} />
    ) : (
      step.body
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-onboarding-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Dismiss tour"
        onClick={finish}
      />

      <div className="border-primary/10 bg-secondary relative w-full max-w-md rounded-xl border p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-primary/50 text-[0.65rem] font-medium uppercase tracking-wide">
            First time here · {stepIndex + 1}/{visibleSteps.length}
          </p>
          <button
            type="button"
            onClick={finish}
            className="text-primary/50 hover:text-primary text-xs"
          >
            Skip tour
          </button>
        </div>

        <h3
          id="trade-onboarding-title"
          className="text-primary text-lg font-semibold"
        >
          {step.title}
        </h3>

        <div className="text-primary/70 mt-3 space-y-0 text-sm leading-relaxed">
          {body}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {visibleSteps.map((s, i) => (
              <span
                key={s.id}
                className={
                  i === stepIndex
                    ? "bg-accent size-1.5 rounded-full"
                    : "bg-primary/20 size-1.5 rounded-full"
                }
              />
            ))}
          </div>

          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                className="text-primary/60 hover:text-primary px-3 py-1.5 text-sm"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isLast) finish();
                else setStepIndex((i) => Math.min(visibleSteps.length - 1, i + 1));
              }}
              className="bg-accent hover:opacity-90 rounded-full px-4 py-1.5 text-sm font-medium text-white"
            >
              {isLast ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function completeTradeOnboardingOnSuccess() {
  markTradeOnboardingDone();
}
