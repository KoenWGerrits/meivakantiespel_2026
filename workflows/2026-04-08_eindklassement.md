# 2026-04-08 — Eindklassement

## What was added

Full implementation of the Eindklassement bet type. Players can now predict the final top-8 ranking of horses after all 5 races.

---

## How it works

### Placing the bet

1. In "Nieuwe Bet", the player selects **Eindklassement**
2. They choose which player is placing the bet
3. They fill in positions 1–8 by selecting a different horse per slot (current horse standings are shown as a reference, if any races have been run)
4. They enter a wager amount (subject to the normal race cap)
5. Bet is saved — the 8 horse/position pairs are stored in `eindklassement_predictions`

**Constraint:** A player can only place **one** eindklassement bet across all races. Attempting a second will be rejected.

### When the multiplier is set

The multiplier depends on which race was active when the bet was placed:

| Race | Multiplier |
|------|-----------|
| 1    | ×1.0      |
| 2    | ×0.8      |
| 3    | ×0.6      |
| 4    | ×0.4      |
| 5    | ×0.2      |

Betting early gives you a higher multiplier; the earlier you commit, the more you can earn.

### Final horse ranking (for comparison)

After all 5 races are finished, horses are ranked by cumulative points:
- 1st place in a race = 8 points
- 2nd place = 7 points
- …
- 8th place = 1 point

Horses are sorted by total descending. This ranking is computed automatically from the stored race results.

### Scoring formula (per predicted horse)

For each of the 8 horses predicted:

| Offset from actual position | Score |
|-----------------------------|-------|
| Exactly correct             | 6 / 5 / 4 / 3 (for positions 1 / 2 / 3 / 4–8) |
| Off by 1                    | 5 / 4 / 3 / 2 (one less than exact) |
| Off by 2 or more            | 0 |

Sum all 8 horse scores, then multiply by the round multiplier.

**Example:** If you predicted 7 horses correctly (total 21 pts) and placed the bet in race 2 (×0.8), your payout = 21 × 0.8 = **€16.80**

### Payout timing

Eindklassement payouts are calculated **automatically** when race 5 results are entered. They appear in the payout summary shown after race 5 alongside the regular single/double payouts.

### Display

- **Bets tab:** Eindklassement cards show "8 paarden voorspeld". A "Voorspelling tonen" button expands the full predicted top-8 list.
- **Balans detail:** Shows "(lopend — einduitslag nog niet bekend)" until all 5 races are done, then shows the formula: `{score}pts × {multiplier} = €{payout}`

---

## Database changes

- New table `eindklassement_predictions`: stores 8 rows per eindklassement bet (one per position), referencing `bets.id` with `ON DELETE CASCADE`.

## New API endpoints

- `GET /api/eindklassement/standings` — current horse standings (rank, horse, total points across finished races)
- `GET /api/bets/<id>/predictions` — predicted top-8 list for a specific eindklassement bet
