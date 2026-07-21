/** Shared nav wallet chrome — fixed 12px to match Privy md without waiting for its CSS vars. */
export const walletNavRadius = "rounded-[12px]";
export const walletNavPad = "px-2 py-2";

/** One chip for Log in / Loading / connected — only the label changes. */
export const walletNavButtonClass = `inline-flex items-center justify-center gap-2 ${walletNavPad} ${walletNavRadius} bg-[#181709] text-sm font-medium text-white/80 transition-colors hover:text-white disabled:cursor-wait disabled:opacity-100 disabled:bg-[#181709] disabled:text-white/80`;
