# Betting System — Horse Racing Competition

## Project Overview

This is a betting system for a horse racing competition. The core purpose is to:
- Register bets placed by specific players before a race
- Automatically calculate and display payouts to each player after the race result is known

## Workflow Tracking

After every meaningful change to the application, update the `workflows/` folder with a markdown file describing what changed and how the application now works.

### Workflow file conventions
- One file per feature or significant change
- File naming: `YYYY-MM-DD_short-description.md`
- Each file must describe:
  - What was added or changed
  - How that part of the application works (functional description, not code-level)
  - Any rules or formulas introduced (e.g. payout calculation logic)

Example: `workflows/2026-04-07_initial-setup.md`

## Application Requirements

### Players & Bets
- Players are identified by name (or ID)
- A player can place one or more bets before the race starts
- Each bet consists of:
  - The player placing the bet
  - The horse they are betting on
  - The amount wagered

### Race Result
- After the race, the finishing positions of the horses are recorded
- At minimum: first place is required; support for place/show bets is optional

### Payout Calculation
- Once the result is entered, the system calculates how much each winning player receives
- Payout logic must be explicit and documented in `workflows/`
- Default starting point: winner-takes-all with proportional distribution among players who bet on the winning horse

### Output
- The system should clearly show:
  - Which players won
  - How much each winning player receives
  - Which players lost and how much they wagered (lost)

## Development Guidelines

- Keep the logic simple and correct before adding features
- Document every new rule or formula in `workflows/` immediately after implementing it
- Do not add features beyond what is described unless explicitly asked
