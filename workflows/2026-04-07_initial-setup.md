# 2026-04-07 — Initial Setup

## What was added

Full initial implementation of the Meivakantiespel 2026 betting system.

## How the application works

### Tech stack
- Python/Flask backend serving a JSON API
- SQLite3 database (`betting.db`) created automatically on first run
- Single-page HTML/CSS/JS frontend at `http://localhost:5000`

### Screens
1. **Home** — navigation hub with 5 buttons
2. **Nieuwe Bet** — step-by-step bet placement flow
3. **Race Resultaten Invoeren** — enter finishing positions for the active race
4. **Balans** — view accumulated player balances; tap a player to see itemized bets
5. **Nieuwe Speler** — add a player to a family
6. **Odds** — view and edit horse odds

### Players & families
- 5 families pre-seeded: Dirven, Verhoeven, Scholten, Jenneskens, Gerrits
- Players are added via the UI and assigned to a family

### Races
- 5 races total; Race 1 is created at startup
- After results are entered for a race, the next race is automatically created (up to 5)
- Bet cap per race: races 1–2 = €5, races 3–4 = €10, race 5 = €15

### Horses
- 8 horses: Paard 1 through Paard 8
- Starting odds: 8.0 for all horses
- Odds can be edited at any time via the Odds screen

### Bet types

#### Single Bet
Player selects one horse and a wager amount.

Payout formula:
- 1st place: `amount × odds + amount`
- 2nd place: `(amount × odds + amount) / 2`
- 3rd place: `(amount × odds + amount) / 3`
- Other: €0

#### Double Bet
Player selects two horses and a wager amount.

Payout formula:
- Neither horse in top 2: €0
- One horse in top 2: single-bet payout for that horse at its finishing position
- Both horses in top 2 (one 1st, one 2nd): sum of both single-bet payouts

#### Eindklassement
Placeholder — not yet implemented. Accepted by the system but payout is always €0.

### Balance & payout events
- Payouts are calculated automatically when race results are entered
- The Balans screen shows the **cumulative** total since the last "Uitbetalen" action
- Clicking "Uitbetalen" records a payout event; the balance then resets to €0 for all players
- The full history is preserved in the database; only the display window resets
