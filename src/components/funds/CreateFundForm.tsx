import { useState } from "react";
import { usePolymarketProfile } from "@/lib/polymarket/usePolymarketProfile";
import ConnectWallet from "@/components/app/ConnectWallet";
import UnlockPriceField from "@/components/funds/UnlockPriceField";
import { defaultLifecycleDate } from "@/lib/funds/lifecycle";
import { signWalletMessage } from "@/lib/wagmi/signMessage";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

export default function CreateFundForm() {
  return <CreateFundFormInner />;
}

function CreateFundFormInner() {
  const { address, isConnected } = useWalletSession();
  const [signing, setSigning] = useState(false);
  const [name, setName] = useState("");
  const [thesis, setThesis] = useState("");
  const [unlockPrice, setUnlockPrice] = useState("");
  const [capUsdc, setCapUsdc] = useState("");
  const [raiseEndsAt, setRaiseEndsAt] = useState(() => defaultLifecycleDate(30));
  const [tradingEndsAt, setTradingEndsAt] = useState(() =>
    defaultLifecycleDate(90),
  );
  const { name: managerName } = usePolymarketProfile(address);

  const canPublish =
    isConnected &&
    address &&
    name.trim() &&
    thesis.trim() &&
    raiseEndsAt &&
    tradingEndsAt;
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  async function publish() {
    if (!canPublish || publishing || !address) return;

    setPublishing(true);
    setPublishError(null);

    try {
      const challengeRes = await fetch(
        `/api/auth/publish-challenge?address=${encodeURIComponent(address)}`,
      );
      const challenge = await challengeRes.json();
      if (!challengeRes.ok) {
        throw new Error(challenge.error ?? "Could not start publish");
      }

      const signature = await (async () => {
        setSigning(true);
        try {
          return await signWalletMessage(challenge.message);
        } finally {
          setSigning(false);
        }
      })();

      const res = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          thesis: thesis.trim(),
          managerAddress: address,
          message: challenge.message,
          signature,
          unlockPriceUsdc: unlockPrice.trim() ? Number(unlockPrice) : null,
          capUsdc: capUsdc.trim() ? Number(capUsdc) : null,
          raiseEndsAt,
          tradingEndsAt,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not publish fund");

      window.location.href = `/funds/${data.slug}`;
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Could not publish fund");
      setPublishing(false);
    }
  }

  const inputClass =
    "border-primary/10 bg-primary/5 text-primary placeholder:text-primary/60 w-full rounded border px-3 py-2 text-sm focus:border-primary/30 focus:outline-none";

  return (
    <form className="mt-10 space-y-6" onSubmit={(e) => e.preventDefault()}>
      <div>
        <p className="text-primary mb-2 text-sm">Creator</p>
        <ConnectWallet variant="create" />
        {managerName && (
          <p className="text-primary/60 mt-2 text-xs">
            Publishing as <span className="text-primary">{managerName}</span>
          </p>
        )}
      </div>

      <div>
        <label className="text-primary mb-1 block text-sm" htmlFor="name">
          Fund name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="US Politics Active Fund"
          className={inputClass}
        />
      </div>

      <div>
        <label className="text-primary mb-1 block text-sm" htmlFor="thesis">
          Strategy
        </label>
        <textarea
          id="thesis"
          rows={3}
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          placeholder="Discretionary macro strategy for the next quarter. Investors commit capital; you trade with proportional fan-out."
          className={inputClass}
        />
      </div>

      <UnlockPriceField
        id="unlock-price"
        value={unlockPrice}
        onChange={setUnlockPrice}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-primary mb-1 block text-sm" htmlFor="raise-ends">
            Deposit stage ends
          </label>
          <input
            id="raise-ends"
            type="date"
            value={raiseEndsAt}
            onChange={(e) => setRaiseEndsAt(e.target.value)}
            className={inputClass}
            required
          />
          <p className="text-primary/50 mt-2 text-xs">
            Last day investors can commit capital.
          </p>
        </div>
        <div>
          <label
            className="text-primary mb-1 block text-sm"
            htmlFor="trading-ends"
          >
            Trading stage ends
          </label>
          <input
            id="trading-ends"
            type="date"
            value={tradingEndsAt}
            min={raiseEndsAt || undefined}
            onChange={(e) => setTradingEndsAt(e.target.value)}
            className={inputClass}
            required
          />
          <p className="text-primary/50 mt-2 text-xs">
            Last day the manager may open new risk.
          </p>
        </div>
      </div>

      <div>
        <label className="text-primary mb-1 block text-sm" htmlFor="cap-usdc">
          Pool cap (optional)
        </label>
        <input
          id="cap-usdc"
          type="number"
          min={0}
          value={capUsdc}
          onChange={(e) => setCapUsdc(e.target.value)}
          placeholder="e.g. 10000"
          className={inputClass}
        />
        <p className="text-primary/50 mt-2 text-xs">
          Managed pool — investors commit capital from their deposit wallets.
          Manager trades fan out proportionally.
        </p>
      </div>

      {publishError && <p className="text-red-400 text-sm">{publishError}</p>}

      <button
        type="button"
        onClick={publish}
        disabled={!canPublish || publishing || signing}
        className="bg-accent hover:bg-accent/80 disabled:bg-accent/40 flex h-11 items-center justify-center rounded-full px-5 text-base font-medium text-white transition-all disabled:cursor-not-allowed"
      >
        {signing
          ? "Sign in wallet…"
          : publishing
            ? "Publishing…"
            : "Publish fund"}
      </button>
    </form>
  );
}
