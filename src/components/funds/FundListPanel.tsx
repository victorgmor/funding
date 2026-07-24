import { useEffect, useMemo, useState } from "react";
import Skeleton from "@/components/app/Skeleton";
import FundFeedCard, { FUND_FEED_GRID } from "@/components/funds/FundFeedCard";
import GearIcon from "@/components/fundations/icons/GearIcon";
import SearchIcon from "@/components/fundations/icons/SearchIcon";
import {
  usePoolTotals,
  type PoolTotalEntry,
} from "@/lib/funds/usePoolTotals";
import type { Fund } from "@/lib/funds/types";
import { localDisplayName } from "@/lib/local-profile";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = {
  funds: Fund[];
  initialPoolTotals?: Record<string, PoolTotalEntry>;
};

type SortField = "published" | "creator" | "cap";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 7;

const COLUMNS: {
  key: string;
  label: string;
  sortField?: SortField;
  align?: "right";
}[] = [
  { key: "fund", label: "Fund" },
  { key: "stage", label: "Stage" },
  { key: "manager", label: "Manager", sortField: "creator" },
  { key: "deposited", label: "Deposited", align: "right" },
  { key: "committed", label: "Committed %", sortField: "cap", align: "right" },
  { key: "cap", label: "Cap", align: "right" },
  { key: "share", label: "Profit share", align: "right" },
  { key: "pnl", label: "PnL", align: "right" },
  { key: "published", label: "Published", sortField: "published" },
];

function filterFunds(funds: Fund[], query: string): Fund[] {
  const q = query.trim().toLowerCase();
  if (!q) return funds;

  return funds.filter((fund) => {
    const localName = localDisplayName(fund.manager.id)?.toLowerCase() ?? "";
    return (
      fund.name.toLowerCase().includes(q) ||
      fund.description.toLowerCase().includes(q) ||
      fund.thesis.toLowerCase().includes(q) ||
      fund.manager.name.toLowerCase().includes(q) ||
      localName.includes(q)
    );
  });
}

function sortFunds(
  funds: Fund[],
  field: SortField,
  direction: SortDirection,
): Fund[] {
  const publishedAt = (fund: Fund) =>
    fund.createdAt ? new Date(fund.createdAt).getTime() : 0;
  const factor = direction === "asc" ? 1 : -1;

  return [...funds].sort((a, b) => {
    switch (field) {
      case "published":
        return factor * (publishedAt(a) - publishedAt(b));
      case "creator":
        return factor * a.manager.name.localeCompare(b.manager.name);
      case "cap":
        return factor * ((a.capUsdc ?? 0) - (b.capUsdc ?? 0));
      default:
        return 0;
    }
  });
}

function useParticipatingSlugs(enabled: boolean) {
  const { address, isConnected, restoring } = useWalletSession();
  const [slugs, setSlugs] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || restoring || !isConnected || !address) {
      setSlugs(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/investor/mandates?address=${encodeURIComponent(address)}`,
        );
        const data = (await res.json()) as {
          mandates?: Array<{ fund: { slug: string } }>;
        };
        if (!cancelled) {
          if (!res.ok) {
            setSlugs(new Set());
            return;
          }
          setSlugs(
            new Set((data.mandates ?? []).map((row) => row.fund.slug)),
          );
        }
      } catch {
        if (!cancelled) setSlugs(new Set());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [enabled, address, isConnected, restoring]);

  return { slugs, loading, walletLoading: restoring };
}

const defaultDirection = (field: SortField): SortDirection =>
  field === "creator" ? "asc" : "desc";

function FundFeedSkeleton() {
  return (
    <div aria-hidden>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className={`${FUND_FEED_GRID} border-primary/10 border-b py-2 last:border-b-0`}
        >
          <div className="space-y-1">
            <Skeleton className="h-3.5 w-28 rounded" />
            <Skeleton className="h-3 w-36 rounded" />
          </div>
          <Skeleton className="h-3 w-16 rounded" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="size-4 shrink-0 rounded-full" />
            <Skeleton className="h-3 w-16 rounded" />
          </div>
          <Skeleton className="ml-auto h-3 w-12 rounded" />
          <div className="space-y-1">
            <Skeleton className="ml-auto h-3 w-8 rounded" />
            <Skeleton className="h-1 w-full rounded-full" />
          </div>
          <Skeleton className="ml-auto h-3 w-12 rounded" />
          <Skeleton className="ml-auto h-3 w-8 rounded" />
          <Skeleton className="ml-auto h-3 w-12 rounded" />
          <Skeleton className="h-3 w-10 rounded" />
        </div>
      ))}
    </div>
  );
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) return null;
  return (
    <span className="text-primary/40 ml-0.5">
      {direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

export default function FundListPanel({ funds, initialPoolTotals }: Props) {
  const { isConnected, restoring: walletLoading } = useWalletSession();
  const { totals: poolTotals } = usePoolTotals(initialPoolTotals);
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onlyParticipating, setOnlyParticipating] = useState(false);
  const [sortField, setSortField] = useState<SortField>("published");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const {
    slugs: participatingSlugs,
    loading: participatingLoading,
    walletLoading: participatingWalletLoading,
  } = useParticipatingSlugs(onlyParticipating);

  useEffect(() => {
    setPage(1);
  }, [query, onlyParticipating, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection(defaultDirection(field));
  };

  const visible = useMemo(() => {
    let next = filterFunds(funds, query);
    if (onlyParticipating) {
      if (!participatingSlugs) return [];
      next = next.filter((fund) => participatingSlugs.has(fund.slug));
    }
    return sortFunds(next, sortField, sortDirection);
  }, [
    funds,
    query,
    onlyParticipating,
    participatingSlugs,
    sortField,
    sortDirection,
  ]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedFunds = visible.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const participatingBusy =
    onlyParticipating &&
    (walletLoading || participatingWalletLoading || participatingLoading);

  const emptyMessage = onlyParticipating
    ? !isConnected
      ? "Connect your wallet to filter funds you're in"
      : "You're not in any funds yet"
    : "No funds match your search";

  return (
    <div className="min-w-0">
      {/* Pending-trade polling lives in the global InvestorTradeAutopilot. */}
      <div className="flex items-center gap-3 pb-5">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <SearchIcon className="text-primary/35 size-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search funds"
            aria-label="Search funds"
            className="text-primary placeholder:text-primary/35 w-full appearance-none border-0 bg-transparent py-1 text-base shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 [&::-webkit-search-cancel-button]:appearance-none"
            autoComplete="off"
          />
        </label>

        <div className="flex shrink-0 items-center gap-2">
          {settingsOpen && (
            <div className="flex items-center gap-3">
              <label className="text-primary flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={onlyParticipating}
                  onChange={(e) => setOnlyParticipating(e.target.checked)}
                  className="border-primary/20 text-accent ring-0 size-3.5 shrink-0 rounded"
                />
                Only funds I&apos;m in
              </label>
              {onlyParticipating && walletLoading && (
                <Skeleton className="h-3.5 w-20 shrink-0 rounded" />
              )}
              {onlyParticipating && !walletLoading && !isConnected && (
                <span className="text-primary/50 text-xs whitespace-nowrap">
                  Connect wallet
                </span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label="Feed settings"
            aria-expanded={settingsOpen}
            className={`transition-colors ${
              settingsOpen
                ? "text-primary"
                : "text-primary/45 hover:text-primary/70"
            }`}
          >
            <GearIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-hide">
        <div className="min-w-[56rem]">
          <div
            className={`${FUND_FEED_GRID} text-primary/45 border-primary/10 border-b pb-2 text-[10px] font-medium tracking-wide uppercase`}
            role="row"
          >
            {COLUMNS.map(({ key, label, sortField: field, align }) =>
              field ? (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSort(field)}
                  className={`hover:text-primary/70 text-left transition-colors ${
                    align === "right" ? "text-right" : ""
                  } ${sortField === field ? "text-primary" : ""}`}
                >
                  {label}
                  <SortIndicator
                    active={sortField === field}
                    direction={sortDirection}
                  />
                </button>
              ) : (
                <span
                  key={key}
                  className={align === "right" ? "text-right" : undefined}
                >
                  {label}
                </span>
              ),
            )}
          </div>

          {visible.length > 0 ? (
            pagedFunds.map((fund) => (
              <FundFeedCard
                key={fund.slug}
                fund={fund}
                deposited={poolTotals[fund.slug]?.deposited ?? 0}
                roiPct={poolTotals[fund.slug]?.roiPct ?? null}
              />
            ))
          ) : participatingBusy ? (
            <FundFeedSkeleton />
          ) : (
            <p className="text-primary/50 py-12 text-center text-sm">
              {emptyMessage}
            </p>
          )}
        </div>
      </div>

      {visible.length > PAGE_SIZE && (
        <div className="border-primary/10 flex items-center justify-center gap-4 border-t py-6">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="text-primary/50 hover:text-primary disabled:text-primary/25 text-sm transition-colors disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-primary/45 text-sm tabular-nums">
            Page {currentPage} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={currentPage >= pageCount}
            className="text-primary/50 hover:text-primary disabled:text-primary/25 text-sm transition-colors disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
