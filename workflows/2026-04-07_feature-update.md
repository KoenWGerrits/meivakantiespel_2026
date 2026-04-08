# 2026-04-07 — Feature Update

## What was added or changed

Seven improvements were made to the application based on user feedback.

---

## 1. Balans tab — Uitbetaald column

The player detail accordion in the Balans tab now includes a seventh column: **Uitbetaald**.

- Shows the amount that was physically paid out via the "Uitbetalen" button at the time of payment
- Displays `—` if the payout has not yet been marked as paid out
- Displays `€XX.XX` in green if the amount was included in a previous uitbetaling event

**How it works:** The `payouts` table stores individual payout records. The `payout_events` table records the highest payout ID at the moment "Uitbetalen" is clicked. Any payout with an ID ≤ the recorded event ID is considered "paid out".

---

## 2. Balans tab — Horse finishing position

The player detail accordion now includes a **Positie** column showing how the horse(s) finished in that race.

- Single bet: shows position of the one horse (e.g. `2e`)
- Double bet: shows both positions separated by `/` (e.g. `1e / 3e`)
- Pending (race not yet finished): shows `—`

---

## 3. Bets tab — Race tabs to view all races

The Bets tab previously only showed bets for the active race. It now shows **all races** as tabs at the top.

- Each race gets a tab; finished races are styled differently
- Clicking a tab loads bets for that race
- Edit/delete actions only appear for open races
- On load, the latest race is selected by default

---

## 4. Overzicht tab

A new **Overzicht** tab was added (accessible from the home screen).

- Shows one card per race with: status (open/afgerond), number of bets, total wagered, total paid out
- Each card has a "Race Resetten" button that clears all bets, results, and payouts for that race and all later races, then re-opens it

---

## 5. Payout summary — player names fixed

After entering race results, the summary screen now correctly shows **first name + family name** (e.g. "Jan (Gerrits)") instead of just the family name.

**Root cause:** The payout summary was previously building names only from the API response field naming, which returned `family_name` but not a fully qualified display name. Fixed by fetching `/api/players` and combining `p.name` (first name) with `p.family_name`.

---

## 6. Balans tab — Race filter

A race filter was added above the player list in the Balans tab.

- Finished races appear as chip buttons
- Selecting one or more chips filters the balance to show only earnings/losses from those specific races
- "Alles" button clears the filter and reverts to the default (post-uitbetaling window) view
- The filter also applies to the per-player accordion detail view

---

## 7. Race Resultaten tab — History overview

The Race Resultaten tab now opens to a **history view** by default instead of directly showing the entry form.

- Shows all finished races as expandable cards; clicking a card reveals the finishing order
- A "Resultaten Invoeren voor Race X" button appears if there is an active race
- Clicking the button switches to the entry form
- After results are saved, the payout summary is shown; going back returns to the history view
