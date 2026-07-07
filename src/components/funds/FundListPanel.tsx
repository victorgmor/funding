import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import FundRow from "@/components/funds/FundRow";
import GearIcon from "@/components/fundations/icons/GearIcon";
import SearchIcon from "@/components/fundations/icons/SearchIcon";
import WagmiScope from "@/components/app/WagmiScope";
import type { FundPerformance } from "@/lib/funds/performance";
import type { Fund } from "@/lib/funds/types";

type Props = {
  funds: Fund[];
  performanceBySlug: Record<string, FundPerformance | null>;
};

type SortField = "creator" | "markets" | "performance";
type SortDirection = "asc" | "desc";

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
  const factor = direction === "asc" ? 1 : -1;

  return [...funds].sort((a, b) => {
    switch (field) {
      case "creator":
        return factor * a.manager.name.localeCompare(b.manager.name);
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
  const { address, isConnected } = useAccount();
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
  field === "creator" ? "asc" : "desc";

const headerTextClass =
  "text-[0.65rem] font-medium leading-none tracking-wide";

const listGridClass =
  "lg:grid lg:grid-cols-[2fr_1fr_1.2fr_1fr] lg:items-center lg:gap-4";

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
  const { isConnected } = useAccount();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onlyParticipating, setOnlyParticipating] = useState(false);
  const [sortField, setSortField] = useState<SortField>("performance");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { slugs: participatingSlugs, loading: participatingLoading } =
    useParticipatingSlugs(funds, onlyParticipating);

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

  const headerBtnClass = (field: SortField, align: "left" | "right" = "left") =>
    `${headerTextClass} ${align === "right" ? "text-right" : "text-left"} py-0 uppercase transition-colors ${
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
        <div className="flex min-w-0 items-baseline justify-between gap-2">
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
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label="Bundle list settings"
            aria-expanded={settingsOpen}
            className={`shrink-0 transition-colors ${
              settingsOpen
                ? "text-primary"
                : "text-primary/50 hover:text-primary/70"
            }`}
          >
            <GearIcon className="size-4" />
          </button>
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
        </div>
      </div>

      {settingsOpen && (
        <div className="space-y-3 px-4 pb-6">
          <label
            className={`${headerTextClass} text-primary float-right flex cursor-pointer items-center gap-2 uppercase`}
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
            <p className="text-primary/50 text-xs">
              Connect your wallet to use this filter
            </p>
          )}
        </div>
      )}

      {visible.length > 0 ? (
        <div className="space-y-1">
          {visible.map((fund) => (
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
    </div>
  );
}

export default function FundListPanel(props: Props) {
  return (
    <WagmiScope>
      <FundListPanelInner {...props} />
    </WagmiScope>
  );
}
