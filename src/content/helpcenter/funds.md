---
page: How funds work
description: Lifecycle, pool caps, and what managers set when they publish.
category: Docs
lastUpdated: "2026-07-19"
---

## Lifecycle

Every fund moves through three stages:

1. **Deposit** — investors can commit (and withdraw unused cash). Ends when the raise deadline passes, the pool cap fills, or the manager ends the raise.
2. **Trading** — the manager places trades; investor cash is deployed via auto-trading. No new commitments.
3. **Closed** — positions are marked, mandates settle, and the fund stops trading.

## What managers set

When creating a fund (`/funds/create`):

| Field | Notes |
| --- | --- |
| Name & thesis | Shown on the fund page and feed |
| Pool cap | Required; max **$15,000** |
| Manager profit share | **0–50%** of investor profit on a profitable close (default often 10%) |
| Raise end | End of the deposit stage |
| Trading end | Soft deadline for the trading stage |

Published funds can’t be deleted — only closed. Funds that reach trading with **$0 raised** may be auto-archived.

## Pool

The pool is the sum of active mandate notionals. Cap progress on the fund page shows deposited capital vs the cap. Leaderboard rankings use pool PnL across a manager’s funds.
