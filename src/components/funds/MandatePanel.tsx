import { useCallback, useEffect, useRef, useState } from "react";
import { useSigners, useUser } from "@privy-io/react-auth";
import { getWalletClient } from "@wagmi/core";
import { polygon } from "wagmi/chains";
import ConnectWallet from "@/components/app/ConnectWallet";
import WalletPanelPlaceholder from "@/components/app/WalletPanelPlaceholder";
import FundTradeAutopilot from "@/components/funds/FundTradeAutopilot";
import { privySignerQuorumId } from "@/lib/privy/config";
import {
  embeddedPrivyWallet,
  isEmbeddedPrivyAddress,
  privyWalletIdForAddress,
} from "@/lib/privy/wallet";
import type {
  Fund,
  Mandate,
  MandatePosition,
  MandateTrade,
  TradingSession,
} from "@/lib/funds/types";
import type { MandateSettlement } from "@/lib/funds/settlement";
import { notifyPoolUpdated } from "@/lib/funds/pool-events";
import { isFundOwner } from "@/lib/funds/editable";
import { formatUsdExact } from "@/lib/funds/format";
import {
  createTradingClient,
} from "@/lib/polymarket/trade";
import { wagmiConfig } from "@/lib/wagmi/config";
import { useEnsurePolygon } from "@/lib/wagmi/useEnsurePolygon";
import { useWalletGate } from "@/lib/wagmi/useWalletGate";
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
  "text-primary/50 text-sm font-medium leading-none tracking-wide uppercase";

export default function MandatePanel({ fund }: Props) {
  const { user } = useUser();
  const { addSigners } = useSigners();
  const { address, walletAddress, isConnected, loading: walletLoading } = useWalletGate();
  const isOwner = isFundOwner(fund, walletAddress);
  const { onPolygon, switching } = useEnsurePolygon();
  const [summary, setSummary] = useState<MandateSummary | null>(null);
  const [pendingTrades, setPendingTrades] = useState<MandateTrade[]>([]);
  const [amount, setAmount] = useState("50");
  const [mode, setMode] = useState<"add" | "withdraw">("add");
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const closed = fund.status === "closed";
  const hasMandate = (summary?.mandate?.notionalUsdc ?? 0) > 0;
  const deployable = summary?.mandate?.cashUsdc ?? 0;
  const canWithdraw = hasMandate && deployable > 0;
  const isWithdraw = mode === "withdraw" && canWithdraw;
  const serverSignerActive = summary?.session?.serverSigner === true;
  const ensuringSigner = useRef(false);

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

  function requirePrivyWallet() {
    if (!address) throw new Error("Connect wallet first");
    if (!isEmbeddedPrivyAddress(user, address)) {
      throw new Error(
        "External wallets are disabled — log out and sign in with email or Google to use your Privy wallet",
      );
    }
  }

  async function requestChallenge(action: "commit" | "authorize" | "withdraw") {
    requirePrivyWallet();
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

  const ensureServerSigner = useCallback(async () => {
    if (!address || !onPolygon || serverSignerActive) return;

    if (!privySignerQuorumId) {
      throw new Error("PUBLIC_PRIVY_SIGNER_QUORUM_ID is not configured");
    }

    const alreadyDelegated =
      embeddedPrivyWallet(user, address)?.delegated === true;
    if (!alreadyDelegated) {
      try {
        await addSigners({
          address,
          signers: [{ signerId: privySignerQuorumId, policyIds: [] }],
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!/duplicate signer/i.test(message)) throw e;
      }
    }

    const privyWalletId = privyWalletIdForAddress(user, address);
    if (!privyWalletId) {
      throw new Error("Privy wallet id unavailable — try logging out and back in");
    }

    const walletClient = await getWalletClient(wagmiConfig, {
      chainId: polygon.id,
      account: address,
    });
    if (!walletClient) throw new Error("Wallet not ready");

    const { trading, creds } = await createTradingClient(walletClient, setStatus);

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
  }, [
    address,
    onPolygon,
    serverSignerActive,
    user,
    addSigners,
    fund.slug,
    refresh,
  ]);

  useEffect(() => {
    if (
      !address ||
      !onPolygon ||
      closed ||
      !summary ||
      !hasMandate ||
      serverSignerActive ||
      ensuringSigner.current
    ) {
      return;
    }

    ensuringSigner.current = true;
    setError(null);
    void ensureServerSigner()
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Authorization failed");
      })
      .finally(() => {
        ensuringSigner.current = false;
        setStatus(null);
      });
  }, [
    address,
    onPolygon,
    closed,
    summary,
    hasMandate,
    serverSignerActive,
    ensureServerSigner,
  ]);

  async function commit() {
    if (!address || committing || closed) return;
    const amountUsdc = Number(amount);
    if (!amountUsdc || amountUsdc <= 0) {
      setError("Enter a positive amount");
      return;
    }

    if (isWithdraw) {
      if (amountUsdc > deployable) {
        setError(
          `Only ${formatUsdExact(deployable)} deployable — cannot withdraw ${formatUsdExact(amountUsdc)}`,
        );
        return;
      }
    } else if (amountUsdc < 5) {
      setError("Minimum $5 commitment");
      return;
    }

    setCommitting(true);
    setError(null);

    try {
      if (!isWithdraw && !serverSignerActive) {
        setStatus("Authorize auto-trading…");
        await ensureServerSigner();
        setStatus(null);
      }

      const message = await requestChallenge(isWithdraw ? "withdraw" : "commit");
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
          ...(isWithdraw ? { withdraw: true } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error ?? (isWithdraw ? "Withdraw failed" : "Commit failed"),
        );
      }

      await refresh();
      notifyPoolUpdated(fund.slug);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : isWithdraw
            ? "Withdraw failed"
            : "Commit failed",
      );
    } finally {
      setCommitting(false);
      setStatus(null);
    }
  }

  const depositBalance = summary?.depositBalanceUsdc;

  if (isOwner) return null;

  return (
    <div className="border-primary/10 border-b pb-4 pt-4">
      {address && onPolygon && serverSignerActive && (
        <FundTradeAutopilot
          fundSlug={fund.slug}
          address={address}
          enabled={serverSignerActive}
          onTradeSettled={refresh}
          onError={setError}
        />
      )}

      <h2 className="text-primary text-sm font-medium">
        {hasMandate ? "Your mandate" : "Join fund"}
      </h2>

      <div className="mt-3">
      {!isConnected || !address ? (
        <>
          <div data-wallet-restoring>
            <WalletPanelPlaceholder label="Loading wallet…" />
          </div>
          <div className="space-y-3" data-wallet-connect-cta>
            <p className="text-primary/60 text-sm">
              Connect to commit capital to this managed pool.
            </p>
            <ConnectWallet variant="panel" />
          </div>
        </>
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

          {!closed && summary?.raiseOpen !== false && (
            <div className="mt-4">
              {serverSignerActive && summary?.serverSigningEnabled === false && (
                <p className="text-red-400 mb-3 text-xs">
                  Server signing is not configured on the host — trades cannot
                  execute until PRIVY_APP_SECRET and PRIVY_AUTHORIZATION_PRIVATE_KEY
                  are set.
                </p>
              )}
              <div className="mb-2 flex items-center justify-between gap-2">
                {hasMandate && canWithdraw ? (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMode("add")}
                      className={
                        mode === "add"
                          ? headerClass + " text-primary"
                          : "text-primary/40 text-sm font-medium uppercase tracking-wide"
                      }
                    >
                      Add capital
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("withdraw");
                        if (Number(amount) > deployable) {
                          setAmount(String(Math.floor(deployable * 100) / 100));
                        }
                      }}
                      className={
                        mode === "withdraw"
                          ? headerClass + " text-primary"
                          : "text-primary/40 text-sm font-medium uppercase tracking-wide"
                      }
                    >
                      Withdraw
                    </button>
                  </div>
                ) : (
                  <label className={headerClass} htmlFor="mandate-amount">
                    {hasMandate ? "Add capital" : "Commit"}
                  </label>
                )}
                {isWithdraw ? (
                  <button
                    type="button"
                    onClick={() =>
                      setAmount(String(Math.floor(deployable * 100) / 100))
                    }
                    className="text-primary/50 hover:text-primary/70 text-sm tabular-nums"
                  >
                    {formatUsdExact(deployable)} available
                  </button>
                ) : (
                  depositBalance != null && (
                    <span className="text-primary/50 text-sm tabular-nums">
                      {formatUsdExact(depositBalance)} deposit wallet
                    </span>
                  )
                )}
              </div>
              <div className="border-primary/10 flex items-center gap-2 rounded-full border py-1 pl-3 pr-1">
                <span className="text-primary/40 text-sm">$</span>
                <input
                  id="mandate-amount"
                  type="number"
                  min={isWithdraw ? 0.01 : 5}
                  max={isWithdraw ? deployable : undefined}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-primary w-full border-0 bg-transparent py-1.5 text-sm font-medium tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-primary/40 pr-2 text-xs">pUSD</span>
              </div>
              <p className="text-primary/40 mt-2 text-xs">
                {isWithdraw
                  ? "Withdraw unused deployable capital back to your deposit wallet while the raise is open. Capital in open positions stays locked."
                  : "Commitment is backed by pUSD in your Polymarket deposit wallet. Auto-trading is enabled when you join."}
              </p>
              <button
                type="button"
                disabled={committing || signing || (isWithdraw && deployable <= 0)}
                onClick={commit}
                className="bg-accent hover:opacity-90 mt-3 w-full rounded-full py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {signing
                  ? "Sign in wallet…"
                  : committing
                    ? status ??
                      (isWithdraw
                        ? "Withdrawing…"
                        : hasMandate
                          ? "Adding…"
                          : "Joining…")
                    : isWithdraw
                      ? "Withdraw from mandate"
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
                    <p className="text-primary font-mono tabular-nums">
                      {formatUsdExact(trade.usdcAmount)}{" "}
                      <span className="text-primary/50 uppercase">
                        {trade.side}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      </div>

      {error && <p className="text-red-400 mt-3 text-xs">{error}</p>}
    </div>
  );
}
