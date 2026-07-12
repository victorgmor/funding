import { useCallback, useEffect, useState } from "react";
import { getWalletClient } from "@wagmi/core";
import { polygon } from "wagmi/chains";
import ConnectWallet from "@/components/app/ConnectWallet";
import FundTradeAutopilot from "@/components/funds/FundTradeAutopilot";
import type {
  Fund,
  Mandate,
  MandatePosition,
  MandateTrade,
  LegResult,
  TradingSession,
} from "@/lib/funds/types";
import type { MandateSettlement } from "@/lib/funds/settlement";
import {
  createTradingClient,
  executeMandateTrade,
} from "@/lib/polymarket/trade";
import {
  clearLocalTradingCreds,
  readLocalTradingCreds,
  saveLocalTradingCreds,
} from "@/lib/funds/trading-session-client";
import { wagmiConfig } from "@/lib/wagmi/config";
import { useEnsurePolygon } from "@/lib/wagmi/useEnsurePolygon";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";
import { signWalletMessage } from "@/lib/wagmi/signMessage";

type Props = { fund: Fund };

type MandateSummary = {
  mandate: Mandate | null;
  totalNotional: number;
  capRemaining: number | null;
  raiseOpen: boolean;
  depositBalanceUsdc: number | null;
  positions: MandatePosition[];
  session: TradingSession | null;
  mandateSettlement: MandateSettlement | null;
};

const headerClass =
  "text-primary/50 text-[0.65rem] font-medium leading-none tracking-wide uppercase";

export default function MandatePanel({ fund }: Props) {
  const { address, isConnected, restoring } = useWalletSession();
  const { onPolygon, switching } = useEnsurePolygon();
  const [summary, setSummary] = useState<MandateSummary | null>(null);
  const [pendingTrades, setPendingTrades] = useState<MandateTrade[]>([]);
  const [amount, setAmount] = useState("50");
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradingId, setTradingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [results, setResults] = useState<LegResult[] | null>(null);

  const closed = fund.status === "closed";
  const hasMandate = (summary?.mandate?.notionalUsdc ?? 0) > 0;
  const sessionActive = summary?.session?.authorized === true;

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const [mandateRes, tradesRes] = await Promise.all([
        fetch(
          `/api/funds/${fund.slug}/mandates?address=${encodeURIComponent(address)}`,
        ),
        fetch(
          `/api/funds/${fund.slug}/trades?address=${encodeURIComponent(address)}&pending=1`,
        ),
      ]);
      const mandateData = await mandateRes.json();
      const tradesData = await tradesRes.json();
      if (!mandateRes.ok) throw new Error(mandateData.error ?? "Load failed");
      setSummary(mandateData);
      setPendingTrades(tradesRes.ok ? (tradesData.trades ?? []) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [address, fund.slug]);

  useEffect(() => {
    if (!address) return;
    refresh();
  }, [address, refresh]);

  async function requestChallenge(action: "commit" | "authorize") {
    if (!address) throw new Error("Connect wallet first");
    const params = new URLSearchParams({
      address,
      action,
      slug: fund.slug,
    });
    const res = await fetch(`/api/auth/bundle-challenge?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not start signing");
    return data.message as string;
  }

  async function commit() {
    if (!address || committing || closed) return;
    const amountUsdc = Number(amount);
    if (!amountUsdc || amountUsdc < 5) {
      setError("Minimum $5 commitment");
      return;
    }

    setCommitting(true);
    setError(null);

    try {
      const message = await requestChallenge("commit");
      setSigning(true);
      const signature = await signWalletMessage(message).finally(() =>
        setSigning(false),
      );

      const res = await fetch(`/api/funds/${fund.slug}/mandates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          amountUsdc,
          message,
          signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Commit failed");

      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  }

  async function authorizeTrading() {
    if (!address || authorizing || !onPolygon) return;

    setAuthorizing(true);
    setError(null);

    try {
      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: polygon.id,
        account: address,
      });
      if (!walletClient) throw new Error("Wallet not ready");

      const { trading, creds } = await createTradingClient(
        walletClient,
        setStatus,
      );

      const message = await requestChallenge("authorize");
      setSigning(true);
      const signature = await signWalletMessage(message).finally(() =>
        setSigning(false),
      );

      const res = await fetch(`/api/funds/${fund.slug}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          message,
          signature,
          depositAddress: trading.depositAddress,
          signatureType: trading.signatureType,
          creds,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Authorization failed");

      saveLocalTradingCreds(fund.slug, address, creds);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authorization failed");
    } finally {
      setAuthorizing(false);
      setStatus(null);
    }
  }

  async function revokeTrading() {
    if (!address) return;
    await fetch(
      `/api/funds/${fund.slug}/session?address=${encodeURIComponent(address)}`,
      { method: "DELETE" },
    );
    clearLocalTradingCreds(fund.slug, address);
    await refresh();
  }

  async function executePendingTrade(trade: MandateTrade) {
    if (!address || !onPolygon || tradingId) return;

    setTradingId(trade.id);
    setError(null);
    setStatus(null);
    setResults(null);

    try {
      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: polygon.id,
        account: address,
      });
      if (!walletClient) throw new Error("Wallet not ready");

      const creds = readLocalTradingCreds(fund.slug, address);
      const result = await executeMandateTrade(
        walletClient,
        trade,
        setStatus,
        creds,
      );
      setResults([result]);

      const res = await fetch(`/api/funds/${fund.slug}/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          tradeId: trade.id,
          status: result.status === "filled" ? "filled" : "failed",
          detail: result.detail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update trade");

      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trade failed");
    } finally {
      setTradingId(null);
      setStatus(null);
    }
  }

  const depositBalance = summary?.depositBalanceUsdc;

  return (
    <div className="bg-primary/5 border-primary/10 rounded-lg border p-5 lg:sticky lg:top-24">
      {address && onPolygon && sessionActive && (
        <FundTradeAutopilot
          fundSlug={fund.slug}
          address={address}
          enabled={sessionActive}
          onTradeSettled={refresh}
        />
      )}

      <h2 className={`${headerClass} mb-4`}>
        {hasMandate ? "Your mandate" : "Join fund"}
      </h2>

      {restoring ? (
        <p className="text-primary/50 text-sm">Loading wallet…</p>
      ) : !isConnected ? (
        <div className="space-y-3">
          <p className="text-primary/60 text-sm">
            Connect to commit capital to this managed pool.
          </p>
          <ConnectWallet variant="panel" />
        </div>
      ) : !onPolygon ? (
        <p className="text-primary/60 text-sm">
          {switching ? "Switching to Polygon…" : "Connecting to Polygon…"}
        </p>
      ) : loading && !summary ? (
        <p className="text-primary/50 text-sm">Loading…</p>
      ) : (
        <>
          {hasMandate && summary?.mandate && (
            <>
              <p className="text-primary font-mono text-3xl font-semibold tabular-nums">
                ${summary.mandate.notionalUsdc.toFixed(2)}
              </p>
              <p className="text-primary/50 mt-1 text-xs">
                Deployable{" "}
                <span className="text-primary/70 font-mono tabular-nums">
                  ${summary.mandate.cashUsdc.toFixed(2)}
                </span>
                {" · "}
                Pool{" "}
                <span className="text-primary/70 font-mono tabular-nums">
                  ${summary.totalNotional.toFixed(2)}
                </span>
              </p>
            </>
          )}

          {hasMandate && (
            <div className="border-primary/10 mt-4 rounded-lg border px-3 py-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className={headerClass}>Auto-trading</p>
                {sessionActive ? (
                  <span className="text-emerald-400">Active</span>
                ) : (
                  <span className="text-primary/40">Off</span>
                )}
              </div>
              <p className="text-primary/50 mt-2">
                Authorize once — manager fan-out trades execute automatically
                while this tab is open.
              </p>
              {sessionActive ? (
                <button
                  type="button"
                  onClick={revokeTrading}
                  className="text-primary/50 hover:text-primary mt-2 text-[0.65rem] uppercase"
                >
                  Revoke
                </button>
              ) : (
                <button
                  type="button"
                  disabled={authorizing || signing}
                  onClick={authorizeTrading}
                  className="border-primary/10 text-primary hover:bg-primary/10 mt-2 rounded-full border px-3 py-1.5 text-[0.65rem] font-medium uppercase"
                >
                  {authorizing ? status ?? "Authorizing…" : "Authorize trading"}
                </button>
              )}
            </div>
          )}

          {!closed && summary?.raiseOpen !== false && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className={headerClass} htmlFor="mandate-amount">
                  {hasMandate ? "Add capital" : "Commit"}
                </label>
                {depositBalance != null && (
                  <span className="text-primary/50 text-[0.65rem] tabular-nums">
                    ${depositBalance.toFixed(2)} deposit wallet
                  </span>
                )}
              </div>
              <div className="border-primary/10 flex items-center gap-2 rounded-full border py-1 pl-3 pr-1">
                <span className="text-primary/40 text-sm">$</span>
                <input
                  id="mandate-amount"
                  type="number"
                  min={5}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-primary w-full border-0 bg-transparent py-1.5 text-sm font-medium tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-primary/40 pr-2 text-xs">pUSD</span>
              </div>
              <p className="text-primary/40 mt-2 text-xs">
                Commitment is backed by pUSD in your Polymarket deposit wallet.
              </p>
              <button
                type="button"
                disabled={committing || signing}
                onClick={commit}
                className="bg-accent hover:opacity-90 mt-3 w-full rounded-full py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {signing
                  ? "Sign in wallet…"
                  : committing
                    ? "Committing…"
                    : hasMandate
                      ? "Add to mandate"
                      : "Commit to fund"}
              </button>
            </div>
          )}

          {closed && !hasMandate && (
            <p className="text-primary/60 text-sm">This pool is closed.</p>
          )}

          {closed && summary?.mandateSettlement && (
            <div className="border-primary/10 mt-5 rounded-lg border px-3 py-3 text-xs">
              <p className={headerClass}>Your close settlement</p>
              <p className="text-primary mt-2 font-mono tabular-nums">
                Final value ${summary.mandateSettlement.finalValueUsdc.toFixed(2)}
              </p>
              <p className="text-primary/60 mt-1">
                Profit{" "}
                <span className="text-primary font-mono tabular-nums">
                  ${summary.mandateSettlement.profitUsdc.toFixed(2)}
                </span>
                {" · "}
                Manager share{" "}
                <span className="text-primary font-mono tabular-nums">
                  ${summary.mandateSettlement.managerShareUsdc.toFixed(2)}
                </span>
              </p>
              <p className="text-emerald-400 mt-1 font-mono tabular-nums">
                Your profit ${summary.mandateSettlement.investorProfitUsdc.toFixed(2)}
              </p>
            </div>
          )}

          {(summary?.positions?.length ?? 0) > 0 && (
            <div className="border-primary/10 mt-5 rounded-lg border">
              <p className={`${headerClass} border-primary/10 border-b px-3 py-2`}>
                Positions
              </p>
              <ul className="divide-primary/10 divide-y text-xs">
                {summary!.positions.map((pos) => (
                  <li key={pos.id} className="space-y-1 px-3 py-3">
                    <p className="text-primary/80 line-clamp-2">{pos.question}</p>
                    <p className="text-primary font-mono tabular-nums">
                      {pos.shares.toFixed(2)} shares · ${pos.costUsdc.toFixed(2)}
                      <span className="text-primary/50 ml-1 uppercase">
                        {pos.side}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendingTrades.length > 0 && (
            <div className="border-primary/10 mt-5 rounded-lg border">
              <p className={`${headerClass} border-primary/10 border-b px-3 py-2`}>
                Pending fan-out ({pendingTrades.length})
                {sessionActive && (
                  <span className="text-primary/40 ml-2 normal-case">
                    autopilot on
                  </span>
                )}
              </p>
              <ul className="divide-primary/10 divide-y text-xs">
                {pendingTrades.map((trade) => (
                  <li key={trade.id} className="space-y-2 px-3 py-3">
                    <p className="text-primary/80 line-clamp-2">{trade.question}</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-primary font-mono tabular-nums">
                        ${trade.usdcAmount.toFixed(2)}{" "}
                        <span className="text-primary/50 uppercase">
                          {trade.side}
                        </span>
                      </span>
                      {!sessionActive && (
                        <button
                          type="button"
                          disabled={!!tradingId}
                          onClick={() => executePendingTrade(trade)}
                          className="border-primary/10 text-primary hover:bg-primary/10 rounded-full border px-3 py-1 text-[0.65rem] font-medium uppercase"
                        >
                          {tradingId === trade.id
                            ? status ?? "Trading…"
                            : "Execute"}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {results && (
            <ul className="border-primary/10 mt-4 space-y-1.5 border-t pt-3 text-xs">
              {results.map((r) => (
                <li
                  key={r.question}
                  className={
                    r.status === "filled" ? "text-emerald-400" : "text-red-400"
                  }
                >
                  {r.status === "filled" ? "✓" : "✗"} {r.question}
                  {r.detail ? ` — ${r.detail}` : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {error && <p className="text-red-400 mt-3 text-xs">{error}</p>}
    </div>
  );
}
