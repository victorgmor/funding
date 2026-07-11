import { useEffect, useState } from "react";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
};

const toggleClass = (active: boolean) =>
  active
    ? "bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium uppercase"
    : "text-primary/40 hover:text-primary/70 px-3 py-1.5 text-xs font-medium uppercase transition-colors";

export default function UnlockPriceField({ id, value, onChange }: Props) {
  const hasPrice = value.trim() !== "";
  const [paid, setPaid] = useState(hasPrice);

  useEffect(() => {
    if (hasPrice) setPaid(true);
  }, [hasPrice]);

  return (
    <div>
      <p className="text-primary mb-2 text-sm">Bundle access</p>
      <div className="border-primary/10 flex w-fit overflow-hidden rounded border">
        <button
          type="button"
          onClick={() => {
            setPaid(false);
            onChange("");
          }}
          className={toggleClass(!paid)}
        >
          Free
        </button>
        <button
          type="button"
          onClick={() => setPaid(true)}
          className={toggleClass(paid)}
        >
          Paid
        </button>
      </div>

      {!paid ? (
        <p className="text-primary/50 mt-2 text-xs">
          Open to everyone — no unlock fee.
        </p>
      ) : (
        <>
          <label className="sr-only" htmlFor={id}>
            Unlock price in pUSD
          </label>
          <div className="border-primary/10 mt-2 flex items-center gap-2 rounded border py-1 pl-3 pr-1">
            <span className="text-primary/40 text-sm">$</span>
            <input
              id={id}
              type="number"
              min={1}
              step="0.01"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="5.00"
              inputMode="decimal"
              className="text-primary w-full border-0 bg-transparent py-1.5 text-sm font-medium tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-primary/40 pr-2 text-xs">pUSD</span>
          </div>
          <p className="text-primary/50 mt-1 text-xs">
            One-time unlock fee. Minimum $1. Markets and thesis stay hidden
            until paid.
          </p>
        </>
      )}
    </div>
  );
}
