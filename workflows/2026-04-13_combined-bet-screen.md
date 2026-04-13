# 2026-04-13 — Combined Bet Screen

## What changed

The "Nieuwe Bet" flow was simplified from 4 sequential steps (type → player → horse/EK → amount) into 2 steps:

1. **Type selection** — user picks Single Bet, Double Bet, or Eindklassement
2. **Combined screen** — player selection, horse/EK-prediction selection, and bet amount all appear on one scrollable page

## How it works

After selecting the bet type, the user lands on a single screen that contains three sections separated by dividers:

- **Kies speler** — the full player list grouped by family. The selected player is highlighted. For Eindklassement, players who already placed a bet in a finished race are shown dimmed and disabled; players with an editable existing bet are shown dimmed with an "bewerken" tag.
- **Kies paard / Kies eerste & tweede paard / Voorspel de eindstand** — the relevant selection UI for the chosen bet type:
  - *Single*: a grid of 8 horse buttons; clicking one highlights it
  - *Double*: two horse grids (first and second horse); clicking in each grid highlights the selected horse and disables that horse in the other grid
  - *Eindklassement*: 8 dropdown rows (position 1–8); if the selected player has an existing EK bet, the dropdowns are pre-populated with their saved predictions
- **Kies inzet bedrag** — amount buttons (€1 up to the race cap) and a free-text input

The **Bet Plaatsen** button at the bottom validates all fields (player, horse(s)/predictions, amount) and submits. Error messages for missing EK positions appear inline above the submit button.

## Rules

- Validation order: player → horse(s) or predictions → amount
- Eindklassement predictions are collected from the dropdowns at submit time (not in a separate "confirm" step)
- Selecting a player who already has an EK bet pre-loads their predictions and amount into the form for editing
