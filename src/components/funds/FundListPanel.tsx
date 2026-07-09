import { useEffect, useMemo, useState } from "react";
import FundRow from "@/components/funds/FundRow";
import GearIcon from "@/components/fundations/icons/GearIcon";
import SearchIcon from "@/components/fundations/icons/SearchIcon";
import { fundUnlockPrice } from "@/lib/funds/access";
import type { FundPerformance } from "@/lib/funds/performance";
import type { Fund } from "@/lib/funds/types";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = {
  funds: Fund[];
  performanceBySlug: Record<string, FundPerformance | null>;
};

type SortField = "creator" | "price" | "markets" | "performance";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 7;

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
  performanceBySlug: Record<string, FundPerformance | null>,
): Fund[] {
  const roi = (slug: string) => performanceBySlug[slug]?.roi ?? null;
  const price = (fund: Fund) => fundUnlockPrice(fund) ?? 0;
  const factor = direction === "asc" ? 1 : -1;

  return [...funds].sort((a, b) => {
    switch (field) {
      case "creator":
        return factor * a.manager.name.localeCompare(b.manager.name);
      case "price":
        return factor * (price(a) - price(b));
      case "markets":
        return factor * (a.markets.length - b.markets.length);
      case "performance":
        return (
          factor *
          ((roi(a.slug) ?? -Infinity) - (roi(b.slug) ?? -Infinity))
        );
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

const listGridClass =
  "lg:grid lg:grid-cols-[minmax(0,2.5fr)_repeat(4,minmax(0,1fr))_minmax(5.5rem,auto)] lg:items-center lg:gap-x-8 lg:gap-y-4";

const searchClass = `${headerTextClass} text-primary placeholder:text-primary/40 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 uppercase focus:outline-none focus:ring-0`;

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) return null;
  return <span className="ml-1">{direction === "asc" ? "↑" : "↓"}</span>;
}

function FundListPanelInner({ funds, performanceBySlug }: Props) {
  const { isConnected } = useWalletSession();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onlyParticipating, setOnlyParticipating] = useState(false);
  const [sortField, setSortField] = useState<SortField>("performance");
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
    return sortFunds(next, sortField, sortDirection, performanceBySlug);
  }, [
    funds,
    query,
    onlyParticipating,
    participatingSlugs,
    sortField,
    sortDirection,
    performanceBySlug,
  ]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedFunds = visible.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const headerBtnClass = (
    field: SortField,
    align: "left" | "center" | "right" = "left",
  ) =>
    `${headerTextClass} ${
      align === "right"
        ? "text-right"
        : align === "center"
          ? "text-center"
          : "text-left"
    } py-0 uppercase transition-colors ${
      sortField === field
        ? "text-primary"
        : "text-primary/50 hover:text-primary/70"
    }`;

  const emptyMessage = onlyParticipating
    ? !isConnected
      ? "Connect your wallet to filter bundles you're in"
      : participatingLoading
        ? "Checking your positions…"
        : "You're not in any bundles yet"
    : "No bundles match your search";

  return (
    <div className="space-y-1">
      <div className={`px-4 pb-2 ${listGridClass} lg:items-baseline`}>
        <div className="flex min-w-0 items-baseline">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <SearchIcon className="text-primary/40 size-3.5 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder={searchFocused ? "" : "Search bundles"}
              aria-label="Search bundles"
              className={searchClass}
              autoComplete="off"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 lg:contents">
          <button
            type="button"
            onClick={() => toggleSort("creator")}
            className={`${headerBtnClass("creator")} lg:w-full`}
          >
            Creator
            <SortIndicator
              active={sortField === "creator"}
              direction={sortDirection}
            />
          </button>
          <button
            type="button"
            onClick={() => toggleSort("price")}
            className={`${headerBtnClass("price", "center")} lg:w-full`}
          >
            Price
            <SortIndicator
              active={sortField === "price"}
              direction={sortDirection}
            />
          </button>
          <button
            type="button"
            onClick={() => toggleSort("markets")}
            className={`${headerBtnClass("markets")} lg:w-full`}
          >
            Markets
            <SortIndicator
              active={sortField === "markets"}
              direction={sortDirection}
            />
          </button>
          <button
            type="button"
            onClick={() => toggleSort("performance")}
            className={`${headerBtnClass("performance", "right")} lg:w-full`}
            title="Thesis ROI since publish — not your wallet balance"
          >
            Performance
            <SortIndicator
              active={sortField === "performance"}
              direction={sortDirection}
            />
          </button>
          <p
            className={`${headerTextClass} text-primary/50 py-0 text-right uppercase lg:w-full`}
          >
            Access
          </p>
        </div>
      </div>

      {visible.length > 0 ? (
        <div className="space-y-1">
          {pagedFunds.map((fund) => (
            <FundRow
              key={fund.slug}
              fund={fund}
              performance={performanceBySlug[fund.slug] ?? null}
            />
          ))}
        </div>
      ) : (
        <p className="text-primary/50 px-4 py-8 text-center text-sm">
          {emptyMessage}
        </p>
      )}

      <div className="relative flex items-center justify-between gap-4 px-4 pt-4 pb-2">
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
            aria-label="Bundle list settings"
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
