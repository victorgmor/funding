import { fundListGridClass } from "@/components/funds/fund-list-layout";

const headerClass =
  "text-primary/50 py-0 text-[0.65rem] font-medium leading-none tracking-wide uppercase";

export default function FundListColumnHeaders() {
  return (
    <div className={`px-4 pb-2 ${fundListGridClass} lg:items-baseline`}>
      <div className="min-w-0" aria-hidden="true" />
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 lg:contents">
        <p className={`${headerClass} lg:w-full`}>Creator</p>
        <p className={`${headerClass} lg:w-full`}>Pool</p>
        <p
          className={`${headerClass} text-right lg:w-full`}
          title="Fund performance since publish — not your mandate balance"
        >
          PnL
        </p>
      </div>
    </div>
  );
}
