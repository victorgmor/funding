import { useEffect, useMemo, useState } from "react";
import FundFeedCard from "@/components/funds/FundFeedCard";
import FundTradeAutopilot from "@/components/funds/FundTradeAutopilot";
import YourMandatesPanel from "@/components/funds/YourMandatesPanel";
import Providers from "@/components/app/Providers";
import GearIcon from "@/components/fundations/icons/GearIcon";
import SearchIcon from "@/components/fundations/icons/SearchIcon";
import { usePoolTotals } from "@/lib/funds/usePoolTotals";
import type { Fund } from "@/lib/funds/types";
import { notifyPoolUpdated } from "@/lib/funds/pool-events";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = {
  funds: Fund[];
};

type SortField = "published" | "creator" | "cap";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 7;

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "published", label: "Latest" },
  { field: "creator", label: "Managers" },
  { field: "cap", label: "Pool cap" },
];

function filterFunds(funds: Fund[], query: string): Fund[] {
  const q = query.trim().toLowerCase();
  if (!q) return funds;

  return funds.filter(
    (fund) =>
      fund.name.toLowerCase().includes(q) ||
      fund.description.toLowerCase().includes(q) ||
      fund.thesis.toLowerCase().includes(q) ||
      fund.manager.name.toLowerCase().includes(q),
  );
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
  const { address, isConnected } = useWalletSession();
  const [slugs, setSlugs] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !isConnected || !address) {
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
  }, [enabled, address, isConnected]);

  return { slugs, loading };
}

const defaultDirection = (field: SortField): SortDirection =>
  field === "creator" ? "asc" : "desc";

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) return null;
  return (
    <span className="text-primary/40 ml-1 text-xs">
      {direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

function FundListPanelInner({ funds }: Props) {
  const { address, isConnected } = useWalletSession();
  const { totals: poolTotals, refresh: refreshPoolTotals } = usePoolTotals();
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onlyParticipating, setOnlyParticipating] = useState(false);
  const [sortField, setSortField] = useState<SortField>("published");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const { slugs: participatingSlugs, loading: participatingLoading } =
    useParticipatingSlugs(onlyParticipating);

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

  const sortTabClass = (field: SortField) =>
    `border-b-2 pb-2 text-sm transition-colors ${
      sortField === field
        ? "border-primary text-primary font-medium"
        : "border-transparent text-primary/45 hover:text-primary/70"
    }`;

  const emptyMessage = onlyParticipating
    ? !isConnected
      ? "Connect your wallet to filter funds you're in"
      : participatingLoading
        ? "Checking your mandates…"
        : "You're not in any funds yet"
    : "No funds match your search";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,672px)_minmax(280px,1fr)]">
      {isConnected && address && (
        <FundTradeAutopilot
          address={address}
          enabled
          onTradeSettled={() => {
            refreshPoolTotals();
            notifyPoolUpdated();
          }}
        />
      )}
      <div className="min-w-0">
      <div className="pb-5">
        <label className="flex items-center gap-2 pb-2">
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

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          {SORT_OPTIONS.map(({ field, label }) => (
            <button
              key={field}
              type="button"
              onClick={() => toggleSort(field)}
              className={sortTabClass(field)}
            >
              {label}
              <SortIndicator
                active={sortField === field}
                direction={sortDirection}
              />
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2 pb-2">
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
                {onlyParticipating && !isConnected && (
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
              className={`pb-2 transition-colors ${
                settingsOpen
                  ? "text-primary"
                  : "text-primary/45 hover:text-primary/70"
              }`}
            >
              <GearIcon className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {visible.length > 0 ? (
        <div>
          {pagedFunds.map((fund) => (
            <FundFeedCard
              key={fund.slug}
              fund={fund}
              deposited={poolTotals[fund.slug]?.deposited ?? 0}
              profitUsdc={poolTotals[fund.slug]?.profitUsdc ?? null}
            />
          ))}
        </div>
      ) : (
        <p className="text-primary/50 py-12 text-center text-sm">
          {emptyMessage}
        </p>
      )}

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

      <aside className="min-w-0">
        <YourMandatesPanel />
      </aside>
    </div>
  );
}

export default function FundListPanel(props: Props) {
  return (
    <Providers>
      <FundListPanelInner {...props} />
    </Providers>
  );
}
