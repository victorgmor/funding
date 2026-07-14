import { useCallback, useEffect, useState } from "react";
import { useSigners, useUser } from "@privy-io/react-auth";
import { getWalletClient } from "@wagmi/core";
import { polygon } from "wagmi/chains";
import ConnectWallet from "@/components/app/ConnectWallet";
import FundTradeAutopilot from "@/components/funds/FundTradeAutopilot";
import { privySignerQuorumId } from "@/lib/privy/config";
import {
  delegatedPrivyWallet,
  privyWalletIdForAddress,
} from "@/lib/privy/wallet";
import type {
  Fund,
  Mandate,
  MandatePosition,
  MandateTrade,
  LegResult,
  TradingSession,
} from "@/lib/funds/types";
import type { MandateSettlement } from "@/lib/funds/settlement";
import { notifyPoolUpdated } from "@/lib/funds/pool-events";
import { formatUsdExact } from "@/lib/funds/format";
import {
  createTradingClient,
  executeMandateTrade,
} from "@/lib/polymarket/trade";
import {
  readLocalTradingCreds,
  clearLocalTradingCreds,
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
  serverSigningEnabled?: boolean;
  mandateSettlement: MandateSettlement | null;
};

const headerClass =
  "text-primary/50 text-[0.65rem] font-medium leading-none tracking-wide uppercase";

export default function MandatePanel({ fund }: Props) {
  const { user } = useUser();
  const { addSigners, removeSigners } = useSigners();
  const { address, isConnected, restoring } = useWalletSession();
  const { onPolygon, switching } = useEnsurePolygon();
  const [summary, setSummary] = useState<MandateSummary | null>(null);
  const [pendingTrades, setPendingTrades] = useState<MandateTrade[]>([]);
  const [failedTrades, setFailedTrades] = useState<MandateTrade[]>([]);
  const [amount, setAmount] = useState("50");
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradingId, setTradingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [results, setResults] = useState<LegResult[] | null>(null);

  const closed = fund.status === "closed";
  const hasMandate = (summary?.mandate?.notionalUsdc ?? 0) > 0;
  const sessionActive = summary?.session?.authorized === true;
  const serverSignerActive = summary?.session?.serverSigner === true;

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const [mandateRes, tradesRes, failedRes] = await Promise.all([
        fetch(
          `/api/funds/${fund.slug}/mandates?address=${encodeURIComponent(address)}`,
        ),
        fetch(
          `/api/funds/${fund.slug}/trades?address=${encodeURIComponent(address)}&pending=1`,
        ),
        fetch(
          `/api/funds/${fund.slug}/trades?address=${encodeURIComponent(address)}&status=failed`,
        ),
      ]);
      const mandateData = await mandateRes.json();
      const tradesData = await tradesRes.json();
      const failedData = await failedRes.json();
      if (!mandateRes.ok) throw new Error(mandateData.error ?? "Load failed");
      setSummary(mandateData);
      setPendingTrades(tradesRes.ok ? (tradesData.trades ?? []) : []);
      setFailedTrades(
        failedRes.ok ? (failedData.trades ?? []).slice(0, 3) : [],
      );
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
      notifyPoolUpdated(fund.slug);
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
      if (!privySignerQuorumId) {
        throw new Error("PUBLIC_PRIVY_SIGNER_QUORUM_ID is not configured");
      }

      await addSigners({
        address,
        signers: [{ signerId: privySignerQuorumId, policyIds: [] }],
      });

      const privyWalletId = privyWalletIdForAddress(user, address);
      if (!privyWalletId) {
        throw new Error("Privy wallet id unavailable — try logging out and back in");
      }

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
          privyWalletId,
          serverSigner: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Authorization failed");

      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authorization failed");
    } finally {
      setAuthorizing(false);
      setStatus(null);
    }
  }

  async function revokeTrading() {
    if (!address || revoking) return;

    setRevoking(true);
    setError(null);

    try {
      const delegated = delegatedPrivyWallet(user);
      const signerAddress = (delegated?.address ?? address) as `0x${string}`;

      let privyError: string | undefined;
      try {
        await removeSigners({ address: signerAddress });
      } catch (e) {
        privyError =
          e instanceof Error ? e.message : "Could not remove Privy session signer";
      }

      const res = await fetch(
        `/api/funds/${fund.slug}/session?address=${encodeURIComponent(address)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Could not revoke trading session");
      }

      clearLocalTradingCreds(fund.slug, address);
      setSummary((prev) => (prev ? { ...prev, session: null } : prev));
      setPendingTrades([]);
      await refresh();

      if (privyError) {
        setError(
          `Auto-trading revoked on server, but Privy signer removal failed: ${privyError}`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setRevoking(false);
    }
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
    <div className="border-primary/10 border-b pb-4 lg:sticky lg:top-24 lg:self-start">
      {address && onPolygon && serverSignerActive && !revoking && (
        <FundTradeAutopilot
          fundSlug={fund.slug}
          address={address}
          enabled={serverSignerActive}
          onTradeSettled={refresh}
          onError={setError}
        />
      )}

      <h2 className="text-primary/45 text-xs uppercase tracking-wide">
        {hasMandate ? "Your mandate" : "Join fund"}
      </h2>

      <div className="mt-3">
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
              <p className="text-primary mt-2 font-mono text-lg font-semibold tabular-nums">
                {formatUsdExact(summary.mandate.notionalUsdc)}
              </p>
              <p className="text-primary/45 mt-1 font-mono text-xs tabular-nums">
                Deployable{" "}
                <span className="text-primary/70 font-mono tabular-nums">
                  {formatUsdExact(summary.mandate.cashUsdc)}
                </span>
                {" · "}
                Pool{" "}
                <span className="text-primary/70 font-mono tabular-nums">
                  {formatUsdExact(summary.totalNotional)}
                </span>
              </p>
            </>
          )}

          {hasMandate && (
            <div className="border-primary/10 mt-4 border-t pt-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="text-primary/45 uppercase tracking-wide">Auto-trading</p>
                {serverSignerActive ? (
                  <span className="text-emerald-400">Server signer on</span>
                ) : sessionActive ? (
                  <span className="text-emerald-400">Active</span>
                ) : (
                  <span className="text-primary/40">Off</span>
                )}
              </div>
              <p className="text-primary/50 mt-2">
                Authorize once — manager fan-out trades execute on the server
                via your Privy wallet. No per-trade wallet popups.
              </p>
              {serverSignerActive && summary?.serverSigningEnabled === false && (
                <p className="text-red-400 mt-2">
                  Server signing is not configured on the host — trades cannot
                  execute until PRIVY_APP_SECRET and PRIVY_AUTHORIZATION_PRIVATE_KEY
                  are set.
                </p>
              )}
              {sessionActive ? (
                <button
                  type="button"
                  disabled={revoking}
                  onClick={revokeTrading}
                  className="text-primary/50 hover:text-primary mt-2 text-[0.65rem] uppercase disabled:opacity-40"
                >
                  {revoking ? "Revoking…" : "Revoke"}
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
                    {formatUsdExact(depositBalance)} deposit wallet
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
            <div className="border-primary/10 mt-4 border-t pt-4 text-xs">
              <p className="text-primary/45 uppercase tracking-wide">Your close settlement</p>
              <p className="text-primary mt-2 font-mono tabular-nums">
                Final value {formatUsdExact(summary.mandateSettlement.finalValueUsdc)}
              </p>
              <p className="text-primary/60 mt-1">
                Profit{" "}
                <span className="text-primary font-mono tabular-nums">
                  {formatUsdExact(summary.mandateSettlement.profitUsdc)}
                </span>
                {" · "}
                Manager share{" "}
                <span className="text-primary font-mono tabular-nums">
                  {formatUsdExact(summary.mandateSettlement.managerShareUsdc)}
                </span>
              </p>
              <p className="text-emerald-400 mt-1 font-mono tabular-nums">
                Your profit {formatUsdExact(summary.mandateSettlement.investorProfitUsdc)}
              </p>
            </div>
          )}

          {(summary?.positions?.length ?? 0) > 0 && (
            <div className="border-primary/10 mt-4 border-t pt-4">
              <p className="text-primary/45 text-xs uppercase tracking-wide">
                Positions
              </p>
              <ul className="mt-2">
                {summary!.positions.map((pos, index) => (
                  <li
                    key={pos.id}
                    className={`border-primary/10 space-y-1 py-3 text-xs ${
                      index > 0 ? "border-t" : ""
                    }`}
                  >
                    <p className="text-primary/80 line-clamp-2">{pos.question}</p>
                    <p className="text-primary font-mono tabular-nums">
                      {pos.shares.toFixed(2)} shares · {formatUsdExact(pos.costUsdc)}
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
            <div className="border-primary/10 mt-4 border-t pt-4">
              <p className="text-primary/45 text-xs uppercase tracking-wide">
                Pending fan-out ({pendingTrades.length})
                {serverSignerActive && (
                  <span className="text-primary/40 ml-2 normal-case">
                    server autopilot
                  </span>
                )}
              </p>
              <ul className="mt-2">
                {pendingTrades.map((trade, index) => (
                  <li
                    key={trade.id}
                    className={`border-primary/10 space-y-2 py-3 text-xs ${
                      index > 0 ? "border-t" : ""
                    }`}
                  >
                    <p className="text-primary/80 line-clamp-2">{trade.question}</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-primary font-mono tabular-nums">
                        {formatUsdExact(trade.usdcAmount)}{" "}
                        <span className="text-primary/50 uppercase">
                          {trade.side}
                        </span>
                      </span>
                      {!serverSignerActive && (
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

          {failedTrades.length > 0 && (
            <div className="border-primary/10 mt-4 border-t pt-4">
              <p className="text-primary/45 text-xs uppercase tracking-wide">
                Recent failed trades
              </p>
              <ul className="mt-2">
                {failedTrades.map((trade, index) => (
                  <li
                    key={trade.id}
                    className={`border-primary/10 space-y-1 py-3 text-xs ${
                      index > 0 ? "border-t" : ""
                    }`}
                  >
                    <p className="text-primary/80 line-clamp-2">{trade.question}</p>
                    <p className="text-red-400">
                      {formatUsdExact(trade.usdcAmount)} — {trade.detail ?? "Trade failed"}
                    </p>
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
      </div>

      {error && <p className="text-red-400 mt-3 text-xs">{error}</p>}
    </div>
  );
}
