# 2026-04-13 — Numpad Entry for Race Results and Eindklassement

## What changed

Replaced the dropdown-based entry for race results and eindklassement predictions with a numpad-style UI. Both screens now work identically.

## How it works

**Layout (top to bottom):**
1. **Position rows** — 8 rows labeled 1e through 8e showing which horse is assigned to each finishing position. The active (currently selected) row is highlighted in blue. A filled row is highlighted in green.
2. **Horse buttons** — a 2-column grid of 8 buttons, one per horse. Each button shows the horse's number (1–8) and name. Once a horse is assigned to a position its button is disabled and greyed out.

**Interaction:**
- The active position starts at 1e (first place).
- Clicking a horse button assigns that horse to the active position and automatically advances to the next unfilled position.
- Clicking any position row makes it the active one. If the row already has a horse, a small **×** button appears on hover to clear it — clearing frees the horse button for re-use.
- **Keyboard shortcut**: pressing digit keys 1–8 assigns horse #N to the active position (works in both the race results entry screen and the eindklassement prediction screen, when no text input has focus).

## Where it applies

- **Race Resultaten** → "Resultaten Invoeren" form
- **Nieuwe Bet** → Eindklassement combined screen (after selecting a player)
