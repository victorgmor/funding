import { useEffect, useMemo, useState } from "react";
import FundFeedCard from "@/components/funds/FundFeedCard";
import GearIcon from "@/components/fundations/icons/GearIcon";
import SearchIcon from "@/components/fundations/icons/SearchIcon";
import { fundUnlockPrice } from "@/lib/funds/access";
import type { Fund } from "@/lib/funds/types";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = {
  funds: Fund[];
};

type SortField = "published" | "creator" | "price" | "markets";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 7;

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "published", label: "Latest" },
  { field: "creator", label: "Creator" },
  { field: "price", label: "Price" },
  { field: "markets", label: "Markets" },
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
      case "markets":
        return factor * (a.markets.length - b.markets.length);
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
              `/api/funds/${fund.slug}/invested?address=${address}`,
            );
            const data = (await res.json()) as { invested?: boolean };
            if (!res.ok || !data.invested) return null;
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

const headerTextClass =
  "text-[0.65rem] font-medium leading-none tracking-wide";

const searchClass = `${headerTextClass} text-primary placeholder:text-primary/40 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 focus:outline-none focus:ring-0`;

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) return null;
  return <span className="ml-0.5">{direction === "asc" ? "↑" : "↓"}</span>;
}

function FundListPanelInner({ funds }: Props) {
  const { isConnected } = useWalletSession();
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

  const sortBtnClass = (field: SortField) =>
    `${headerTextClass} rounded-full px-3 py-1.5 uppercase transition-colors ${
      sortField === field
        ? "bg-primary/10 text-primary"
        : "text-primary/50 hover:text-primary/70"
    }`;

  const emptyMessage = onlyParticipating
    ? !isConnected
      ? "Connect your wallet to filter bundles you're in"
      : participatingLoading
        ? "Checking your positions…"
        : "You're not in any bundles yet"
    : "No calls match your search";

  const feedLabel =
    sortField === "published"
      ? "Latest calls"
      : `${SORT_OPTIONS.find((o) => o.field === sortField)?.label ?? "Calls"}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <SearchIcon className="text-primary/40 size-3.5 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={searchFocused ? "" : "Search calls…"}
            aria-label="Search calls"
            className={searchClass}
            autoComplete="off"
          />
        </label>

        <div className="flex flex-wrap items-center gap-1">
          {SORT_OPTIONS.map(({ field, label }) => (
            <button
              key={field}
              type="button"
              onClick={() => toggleSort(field)}
              className={sortBtnClass(field)}
            >
              {label}
              <SortIndicator
                active={sortField === field}
                direction={sortDirection}
              />
            </button>
          ))}
        </div>
      </div>

      <p className="text-primary/40 px-4 text-[0.65rem] font-medium uppercase">
        {feedLabel} · {visible.length} call{visible.length === 1 ? "" : "s"}
      </p>

      {visible.length > 0 ? (
        <div className="space-y-2 px-4">
          {pagedFunds.map((fund) => (
            <FundFeedCard key={fund.slug} fund={fund} />
          ))}
        </div>
      ) : (
        <p className="text-primary/50 px-4 py-8 text-center text-sm">
          {emptyMessage}
        </p>
      )}

      <div className="relative flex items-center justify-between gap-4 px-4 pt-2 pb-2">
        {visible.length > PAGE_SIZE ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="text-primary/50 hover:text-primary disabled:text-primary/25 text-[0.65rem] font-medium uppercase transition-colors disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="text-primary/50 font-mono text-xs tabular-nums">
              {currentPage} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount}
              className="text-primary/50 hover:text-primary disabled:text-primary/25 text-[0.65rem] font-medium uppercase transition-colors disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        ) : (
          <div />
        )}

        <div className="relative ml-auto">
          {settingsOpen && (
            <div className="border-primary/10 bg-secondary absolute right-0 bottom-full z-10 mb-2 min-w-48 rounded-lg border p-3 shadow-lg">
              <label
                className={`${headerTextClass} text-primary flex cursor-pointer items-center gap-2 uppercase`}
              >
                <input
                  type="checkbox"
                  checked={onlyParticipating}
                  onChange={(e) => setOnlyParticipating(e.target.checked)}
                  className="border-primary/20 text-accent ring-0 size-[0.65rem] shrink-0 rounded"
                />
                Only bundles I&apos;m in
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
            className={`transition-colors ${
              settingsOpen
                ? "text-primary"
                : "text-primary/50 hover:text-primary/70"
            }`}
          >
            <GearIcon className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FundListPanel(props: Props) {
  return <FundListPanelInner {...props} />;
}
