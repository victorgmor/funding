/** Polymarket cash token (1:1 with USDC). */
export const PUSD_ADDRESS =
  "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB" as const;

/** Legacy USDC.e still credited on some deposit wallets. */
const USDC_E =
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;

/** Native USDC on Polygon. */
const USDC_NATIVE =
  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;

export const GIFT_TOKEN_ADDRESSES = [
  PUSD_ADDRESS,
  USDC_NATIVE,
  USDC_E,
] as const;
