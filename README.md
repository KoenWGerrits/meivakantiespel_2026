# Meivakantiespel 2026 — Paardenwedden

A betting system for a horse racing competition. Players place bets on races, and payouts are calculated automatically after each race result is entered.

## Requirements

- Python 3.10+

## Setup

1. **Create and activate a virtual environment** (recommended):

   ```bash
   python -m venv .venv
   # Windows
   .venv\Scripts\activate
   # macOS / Linux
   source .venv/bin/activate
   ```

2. **Install dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

3. **Run the app:**

   ```bash
   python app.py
   ```

4. **Open in your browser:**

   ```
   http://localhost:5000
   ```

The SQLite database (`betting.db`) is created automatically on first run, pre-seeded with 5 families, 8 horses, and race 1.

## Resetting

To start over, stop the app and delete `betting.db`. The next run recreates everything from scratch.
