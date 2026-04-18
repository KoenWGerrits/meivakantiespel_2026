# 2026-04-18 — Payout Formula Update & Balans Layout Fix

## What was changed

- Single and double payout formulas were updated.
- Balans tab layout fixed: columns no longer compress when a player accordion opens.

## New payout formulas

### Single bet
A player bets on one horse finishing **1st**. Only 1st place pays out.

```
payout = inzet + (inzet × odds)
```

No payout for 2nd or 3rd place (previous formula paid out fractions for those).

### Double bet
A player bets on two horses finishing in the **top 2** (1st or 2nd, any order).

| Result | Payout |
|--------|--------|
| Both horses in top 2 | `inzet + inzet × (odds1 + odds2)` |
| One horse in top 2   | `inzet + (inzet × odds) / 2` |
| Neither in top 2     | €0 |

All payouts are rounded up to the nearest whole euro (`math.ceil`).

## Balans layout fix

- Families are shown side by side in fixed-width columns.
- The number of columns is set explicitly in JS (`repeat(N, 1fr)`) so the grid never reshapes when a player's detail accordion opens.
- The detail accordion opens inline within the player's family column, pushing content downward.
