# 2026-04-18 — Eindklassement Tab

## What was changed

- Added a dedicated **Eindklassement** tab accessible from the home screen.
- Eindklassement bets are **no longer included in the Balans payout flow** (single/double bets only).
- Introduced a new scoring formula for the Eindklassement tab.
- The auto-calculation of eindklassement payouts after race 5 (into the `payouts` table) has been removed; scoring is computed on-demand by the new endpoint.

## How it works

### New scoring formula

For each horse prediction, the player earns points based on accuracy:

| Result        | Points                                         |
|---------------|------------------------------------------------|
| Exact match   | 15 (pos 1) / 13 (pos 2) / 10 (pos 3) / 8 (pos 4–8) |
| Off by 1      | 5 (regardless of predicted position)           |
| Off by 2+     | 0                                              |

The **total score** is the sum across all 8 horse predictions.  
The **payout** = total_score × round_multiplier (same as before: 1.0 / 0.8 / 0.6 / 0.4 / 0.2 for races 1–5).

> Note: a standard participation cost for the eindklassement will be subtracted at the end but is not implemented in this app yet.

### Eindklassement tab

- Shows all players who placed an eindklassement bet, grouped by family.
- Each row shows the player name, their round multiplier tag, and their total payout (€—  if race 5 has not finished yet).
- Clicking a player expands a dropdown showing their 8 horse predictions in a table:
  - **Voorspeld** — their predicted position for that horse
  - **Paard** — horse name
  - **Werkelijk** — actual final position (— if race 5 not yet finished)
  - **Score** — points earned for that horse (only shown after race 5)
- The footer row of the dropdown shows the formula: `{score}pt × {multiplier} = €{payout}`, or just the multiplier if race 5 is pending.
- A yellow notice banner is shown at the top when race 5 has not yet finished.

### API

New endpoint: `GET /api/eindklassement/scores`  
Returns: `race5_finished`, `final_standings`, and `players[]` with full prediction details and per-horse scores.
