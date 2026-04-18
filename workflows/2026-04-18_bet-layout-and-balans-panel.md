# 2026-04-18 — Bet Layout Redesign & Balans External Panel

## What was changed

### Nieuwe Bet screen: 3-column layout
The bet placement screen now uses a 3-column grid:
- Column 1: Player selection (grouped by family)
- Column 2: Horse selection (single/double) or EK numpad
- Column 3: Amount (hidden for EK bets)

For **double** bets, a single grid replaces the two separate grids. Selecting a horse toggles
it; selecting up to 2 shows "1" / "2" badges. Selecting a third horse pushes out the first.

For **eindklassement** bets:
- The amount column is hidden entirely
- The layout shifts to a 2-column grid (`.ek-mode` CSS class)
- `amount: 0` is submitted to the backend (backend skips amount/cap validation for EK)
- The success screen omits the `€` amount line

### Balans: player detail shown below all columns
Clicking a player row no longer opens an inline accordion. Instead, a shared panel
(`#balans-detail-panel`) appears below all family columns, showing the selected player's
bet breakdown. Clicking the same player again closes the panel.

The family column grid uses an explicit `repeat(N, minmax(0, 1fr))` column count set in JS
so the grid never reshapes when the detail panel opens.
