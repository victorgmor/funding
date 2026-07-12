import { useEffect, useMemo, useState } from "react";
import FundFeedCard from "@/components/funds/FundFeedCard";
import GearIcon from "@/components/fundations/icons/GearIcon";
import SearchIcon from "@/components/fundations/icons/SearchIcon";
import { fundUnlockPrice } from "@/lib/funds/access";
import { usePoolTotals } from "@/lib/funds/usePoolTotals";
import type { Fund } from "@/lib/funds/types";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = {
  funds: Fund[];
};

type SortField = "published" | "creator" | "price" | "cap";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 7;

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "published", label: "Latest" },
  { field: "creator", label: "Creators" },
  { field: "price", label: "Price" },
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
  const price = (fund: Fund) => fundUnlockPrice(fund) ?? 0;
  const publishedAt = (fund: Fund) =>
    fund.createdAt ? new Date(fund.createdAt).getTime() : 0;
  const factor = direction === "asc" ? 1 : -1;

  return [...funds].sort((a, b) => {
    switch (field) {
      case "published":
        return factor * (publishedAt(a) - publishedAt(b));
      case "creator":
        return factor * a.manager.name.localeCompare(b.manager.name);
      case "price":
        return factor * (price(a) - price(b));
      case "cap":
        return factor * ((a.capUsdc ?? 0) - (b.capUsdc ?? 0));
      default:
        return 0;
    }
  });
}

function useParticipatingSlugs(funds: Fund[], enabled: boolean) {
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
        const results = await Promise.all(
          funds.map(async (fund) => {
            const res = await fetch(
              `/api/funds/${fund.slug}/mandates?address=${address}`,
            );
            const data = (await res.json()) as {
              mandate?: { notionalUsdc?: number } | null;
            };
            if (!res.ok || !(data.mandate?.notionalUsdc ?? 0)) return null;
            return fund.slug;
          }),
        );
        if (!cancelled) {
          setSlugs(new Set(results.filter(Boolean) as string[]));
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
  }, [funds, enabled, address, isConnected]);

  return { slugs, loading };
}

const defaultDirection = (field: SortField): SortDirection =>
  field === "creator" || field === "price" ? "asc" : "desc";

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
  const { isConnected } = useWalletSession();
  const { totals: poolTotals } = usePoolTotals();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onlyParticipating, setOnlyParticipating] = useState(false);
  const [sortField, setSortField] = useState<SortField>("published");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const { slugs: participatingSlugs, loading: participatingLoading } =
    useParticipatingSlugs(funds, onlyParticipating);

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
    <div className="max-w-2xl">
      <div className="pb-5">
        <label className="flex items-center gap-2 pb-2">
          <SearchIcon className="text-primary/35 size-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
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

          <div className="relative ml-auto">
            {settingsOpen && (
              <div className="border-primary/10 bg-secondary absolute right-0 bottom-full z-10 mb-2 min-w-48 rounded-lg border p-3 shadow-lg">
                <label className="text-primary flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={onlyParticipating}
                    onChange={(e) => setOnlyParticipating(e.target.checked)}
                    className="border-primary/20 text-accent ring-0 size-3.5 shrink-0 rounded"
                  />
                  Only funds I&apos;m in
                </label>
                {onlyParticipating && !isConnected && (
                  <p className="text-primary/50 mt-2 text-xs">
                    Connect your wallet to use this filter
                  </p>
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
          {pagedFunds.map((fund, index) => (
            <FundFeedCard
              key={fund.slug}
              fund={fund}
              deposited={poolTotals[fund.slug] ?? 0}
              lead={index === 0}
              searchFocused={searchFocused}
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
  );
}

export default function FundListPanel(props: Props) {
  return <FundListPanelInner {...props} />;
}
