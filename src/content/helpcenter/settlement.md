---
page: Settlement
description: Closing a fund, profit share, and what investors receive.
category: Docs
lastUpdated: "2026-07-19"
---

## Closing

The manager closes the fund (or trading end / status moves it to closed). Each mandate is settled once.

## How settlement is calculated

For each mandate:

1. **Final value** = remaining cash + mark-to-market of positions  
2. **Profit** = `max(0, final value − notional)`  
3. **Manager share** = profit × manager profit-share %  
4. **Investor profit** = profit − manager share  

The manager only takes a cut of **profits**, not of losses.

## After close

Mandates are marked closed. The fund page shows close settlement (including your investor profit when applicable). Unwind / withdraw flow follows settlement of that mandate.
