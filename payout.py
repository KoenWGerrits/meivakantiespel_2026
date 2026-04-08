from database import get_db


# ── Single / Double payouts ────────────────────────────────────────────────────

def single_payout(amount: float, odds: float, position: int) -> float:
    if position == 1:
        return amount * odds + amount
    elif position == 2:
        return (amount * odds + amount) / 2
    elif position == 3:
        return (amount * odds + amount) / 3
    return 0.0


def double_payout(
    amount: float,
    horse1_odds: float, horse1_position: int,
    horse2_odds: float, horse2_position: int,
) -> float:
    h1_in_top2 = horse1_position <= 2
    h2_in_top2 = horse2_position <= 2

    if h1_in_top2 and h2_in_top2:
        return (
            single_payout(amount, horse1_odds, horse1_position)
            + single_payout(amount, horse2_odds, horse2_position)
        )
    elif h1_in_top2:
        return single_payout(amount, horse1_odds, horse1_position)
    elif h2_in_top2:
        return single_payout(amount, horse2_odds, horse2_position)
    return 0.0


def calculate_race_payouts(race_id: int) -> list:
    conn = get_db()
    try:
        # Build position map: {horse_id: position}
        results = conn.execute(
            'SELECT horse_id, position FROM race_results WHERE race_id = ?',
            (race_id,)
        ).fetchall()
        positions = {row['horse_id']: row['position'] for row in results}

        # Load single/double bets only — eindklassement is settled separately
        bets = conn.execute('''
            SELECT b.id AS bet_id, b.player_id, b.bet_type,
                   b.horse1_id, b.horse2_id, b.amount,
                   h1.odds AS odds1, h2.odds AS odds2
            FROM bets b
            LEFT JOIN horses h1 ON b.horse1_id = h1.id
            LEFT JOIN horses h2 ON b.horse2_id = h2.id
            WHERE b.race_id = ? AND b.bet_type != 'eindklassement'
        ''', (race_id,)).fetchall()

        payout_records = []
        for bet in bets:
            bet_type = bet['bet_type']
            amount = bet['amount']

            if bet_type == 'single':
                pos = positions.get(bet['horse1_id'], 9)
                amount_out = single_payout(amount, bet['odds1'], pos)
            elif bet_type == 'double':
                pos1 = positions.get(bet['horse1_id'], 9)
                pos2 = positions.get(bet['horse2_id'], 9)
                amount_out = double_payout(amount, bet['odds1'], pos1, bet['odds2'], pos2)
            else:
                amount_out = 0.0

            conn.execute(
                'INSERT INTO payouts (bet_id, amount) VALUES (?, ?)',
                (bet['bet_id'], round(amount_out, 2))
            )
            payout_records.append({
                'bet_id': bet['bet_id'],
                'player_id': bet['player_id'],
                'amount': round(amount_out, 2),
            })

        conn.commit()
        return payout_records
    finally:
        conn.close()


# ── Eindklassement scoring ─────────────────────────────────────────────────────

def _horse_base_score(predicted_position: int) -> int:
    """Base score when a horse is placed exactly correct."""
    if predicted_position == 1:
        return 6
    if predicted_position == 2:
        return 5
    if predicted_position == 3:
        return 4
    return 3  # positions 4–8


def eindklassement_horse_score(predicted_position: int, actual_position: int) -> int:
    """
    Score for one horse prediction:
      exact match → base score (6/5/4/3)
      off by 1    → base score − 1
      off by 2+   → 0
    """
    diff = abs(predicted_position - actual_position)
    if diff == 0:
        return _horse_base_score(predicted_position)
    if diff == 1:
        return max(0, _horse_base_score(predicted_position) - 1)
    return 0


def round_multiplier(race_id: int) -> float:
    """
    Multiplier based on when the eindklassement bet was placed.
    Race 1 → 1.0, Race 2 → 0.8, Race 3 → 0.6, Race 4 → 0.4, Race 5 → 0.2
    """
    return round(max(0.0, 1.0 - (race_id - 1) * 0.2), 1)


def compute_final_standings(conn) -> dict:
    """
    Compute the final horse ranking from all finished race results.
    Points per race: 1st = 8 pts, 2nd = 7 pts, …, 8th = 1 pt.
    Returns {horse_id: rank} where rank 1 is the top-ranked horse.
    """
    rows = conn.execute('''
        SELECT horse_id, SUM(9 - position) AS total_points
        FROM race_results
        GROUP BY horse_id
        ORDER BY total_points DESC, horse_id ASC
    ''').fetchall()
    return {row['horse_id']: rank for rank, row in enumerate(rows, start=1)}


def compute_standings_with_details(conn) -> list:
    """
    Like compute_final_standings but returns a list of dicts with
    {rank, horse_id, horse_name, total_points} for display purposes.
    """
    rows = conn.execute('''
        SELECT h.id AS horse_id, h.name AS horse_name,
               COALESCE(SUM(9 - rr.position), 0) AS total_points
        FROM horses h
        LEFT JOIN race_results rr ON rr.horse_id = h.id
        GROUP BY h.id
        ORDER BY total_points DESC, h.id ASC
    ''').fetchall()
    return [
        {'rank': i, 'horse_id': r['horse_id'], 'horse_name': r['horse_name'],
         'total_points': r['total_points']}
        for i, r in enumerate(rows, start=1)
    ]


def calculate_eindklassement_payouts() -> list:
    """
    Calculate and store payouts for all eindklassement bets.
    Called once after all 5 races are finished.
    Skipped if payouts already exist for any eindklassement bet.
    """
    conn = get_db()
    try:
        # Guard: skip if already calculated
        already = conn.execute('''
            SELECT COUNT(*) FROM payouts
            WHERE bet_id IN (SELECT id FROM bets WHERE bet_type = 'eindklassement')
        ''').fetchone()[0]
        if already > 0:
            return []

        standings = compute_final_standings(conn)  # {horse_id: rank}

        bets = conn.execute('''
            SELECT id AS bet_id, player_id, race_id
            FROM bets WHERE bet_type = 'eindklassement'
        ''').fetchall()

        payout_records = []
        for bet in bets:
            preds = conn.execute('''
                SELECT horse_id, predicted_position
                FROM eindklassement_predictions WHERE bet_id = ?
            ''', (bet['bet_id'],)).fetchall()

            total_score = sum(
                eindklassement_horse_score(p['predicted_position'],
                                           standings.get(p['horse_id'], 9))
                for p in preds
            )
            multiplier = round_multiplier(bet['race_id'])
            amount_out = round(total_score * multiplier, 2)

            conn.execute(
                'INSERT INTO payouts (bet_id, amount) VALUES (?, ?)',
                (bet['bet_id'], amount_out)
            )
            payout_records.append({
                'bet_id': bet['bet_id'],
                'player_id': bet['player_id'],
                'amount': amount_out,
            })

        conn.commit()
        return payout_records
    finally:
        conn.close()
