---
page: Trading
description: How manager instructions fan out across investor mandates.
category: Docs
lastUpdated: "2026-07-19"
---

## Manager instructions

In the trading stage, the manager submits a trade instruction: market (or Polymarket URL), side, size in USDC, and price. The app turns that into per-mandate orders.

## Proportional fan-out

Each instruction is split across **active mandates by notional share**, capped by each mandate’s remaining **cash**.

Example: two mandates at $100 and $300 in a $400 pool → a $40 buy becomes $10 and $30 (subject to cash available).

## Auto-trading

Investors enable auto-trading when they join (Privy session / server signer). Filled trades create positions on the mandate; failed fills restore cash.

You can follow open positions and PnL on the fund page and under **Your portfolio**.
