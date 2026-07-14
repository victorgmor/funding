/** Polygon mainnet Polymarket V2 contracts (docs.polymarket.com/resources/contracts). */
export const CTF_EXCHANGE_V2 =
  "0xE111180000d2663C0091e4f400237545B87B996B" as const;

export const NEG_RISK_CTF_EXCHANGE_V2 =
  "0xe2222d279d744050d28e00520010520000310F59" as const;

export const NEG_RISK_ADAPTER =
  "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as const;

export const CONDITIONAL_TOKENS =
  "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as const;

export const PUSD_COLLATERAL_SPENDERS = [
  CTF_EXCHANGE_V2,
  NEG_RISK_CTF_EXCHANGE_V2,
  NEG_RISK_ADAPTER,
] as const;
