import math
from flask import Flask, jsonify, request, render_template
from database import get_db, init_db
from payout import (
    calculate_race_payouts,
    calculate_eindklassement_payouts,
    eindklassement_horse_score,
    new_eindklassement_horse_score,
    round_multiplier,
    compute_final_standings,
    compute_standings_with_details,
)

app = Flask(__name__)


def bet_cap_for_race(race_id: int) -> int:
    if race_id <= 2:
        return 5
    if race_id <= 4:
        return 10
    return 15


# ── Frontend ──────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ── Families ──────────────────────────────────────────────────────────────────

@app.route('/api/families')
def get_families():
    conn = get_db()
    try:
        rows = conn.execute('SELECT id, name FROM families ORDER BY name').fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


# ── Players ───────────────────────────────────────────────────────────────────

@app.route('/api/players')
def get_players():
    conn = get_db()
    try:
        rows = conn.execute('''
            SELECT p.id, p.name, f.id AS family_id, f.name AS family_name
            FROM players p
            JOIN families f ON p.family_id = f.id
            ORDER BY f.name, p.name
        ''').fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route('/api/players/<int:player_id>', methods=['DELETE'])
def delete_player(player_id):
    conn = get_db()
    try:
        if not conn.execute('SELECT id FROM players WHERE id = ?', (player_id,)).fetchone():
            return jsonify({'error': 'Speler niet gevonden'}), 404
        conn.execute('DELETE FROM payouts WHERE bet_id IN (SELECT id FROM bets WHERE player_id = ?)', (player_id,))
        conn.execute('DELETE FROM bets WHERE player_id = ?', (player_id,))
        conn.execute('DELETE FROM players WHERE id = ?', (player_id,))
        conn.commit()
        return jsonify({'deleted': True})
    finally:
        conn.close()


@app.route('/api/players', methods=['POST'])
def create_player():
    data = request.get_json()
    name = (data.get('name') or '').strip()
    family_id = data.get('family_id')
    if not name:
        return jsonify({'error': 'Naam is verplicht'}), 400
    if not family_id:
        return jsonify({'error': 'Familie is verplicht'}), 400

    conn = get_db()
    try:
        if not conn.execute('SELECT id FROM families WHERE id = ?', (family_id,)).fetchone():
            return jsonify({'error': 'Onbekende familie'}), 400
        cur = conn.execute(
            'INSERT INTO players (name, family_id) VALUES (?, ?)', (name, family_id)
        )
        conn.commit()
        return jsonify({'id': cur.lastrowid, 'name': name, 'family_id': family_id}), 201
    finally:
        conn.close()


# ── Horses / Odds ─────────────────────────────────────────────────────────────

@app.route('/api/horses')
def get_horses():
    conn = get_db()
    try:
        rows = conn.execute('SELECT id, name, odds FROM horses ORDER BY id').fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route('/api/horses/<int:horse_id>', methods=['PUT'])
def update_horse(horse_id):
    data = request.get_json()
    try:
        odds = float(data.get('odds'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Ongeldige odds waarde'}), 400
    if odds <= 0:
        return jsonify({'error': 'Odds moeten groter zijn dan 0'}), 400

    conn = get_db()
    try:
        conn.execute('UPDATE horses SET odds = ? WHERE id = ?', (odds, horse_id))
        conn.commit()
        return jsonify({'id': horse_id, 'odds': odds})
    finally:
        conn.close()


# ── Races ─────────────────────────────────────────────────────────────────────

@app.route('/api/races')
def get_races():
    conn = get_db()
    try:
        rows = conn.execute('SELECT id, status FROM races ORDER BY id').fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route('/api/races/active')
def get_active_race():
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, status FROM races WHERE status = 'open' ORDER BY id LIMIT 1"
        ).fetchone()
        if not row:
            return jsonify({'error': 'Geen actieve race'}), 404
        race = dict(row)
        race['bet_cap'] = bet_cap_for_race(race['id'])
        return jsonify(race)
    finally:
        conn.close()


@app.route('/api/races/overview')
def get_races_overview():
    conn = get_db()
    try:
        rows = conn.execute('''
            SELECT r.id, r.status,
                   COUNT(DISTINCT b.id) AS bet_count,
                   COALESCE(SUM(b.amount), 0.0) AS total_wagered,
                   COALESCE(SUM(py.amount), 0.0) AS total_payout
            FROM races r
            LEFT JOIN bets b ON b.race_id = r.id
            LEFT JOIN payouts py ON py.bet_id = b.id
            GROUP BY r.id
            ORDER BY r.id
        ''').fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route('/api/eindklassement/bets')
def get_eindklassement_bets():
    """Return all eindklassement bets with player_id, race_id, and race status."""
    conn = get_db()
    try:
        rows = conn.execute('''
            SELECT b.id AS bet_id, b.player_id, b.race_id, b.amount, r.status AS race_status
            FROM bets b
            JOIN races r ON b.race_id = r.id
            WHERE b.bet_type = 'eindklassement'
        ''').fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route('/api/eindklassement/standings')
def get_eindklassement_standings():
    conn = get_db()
    try:
        return jsonify(compute_standings_with_details(conn))
    finally:
        conn.close()


@app.route('/api/eindklassement/scores')
def get_eindklassement_scores():
    conn = get_db()
    try:
        race5 = conn.execute("SELECT status FROM races WHERE id = 5").fetchone()
        race5_finished = bool(race5 and race5['status'] == 'finished')

        final_standings = {}
        if race5_finished:
            final_standings = compute_final_standings(conn)

        standings_details = compute_standings_with_details(conn)

        bets = conn.execute('''
            SELECT b.id AS bet_id, b.player_id, b.race_id, b.amount,
                   p.name AS player_name, f.name AS family_name
            FROM bets b
            JOIN players p ON b.player_id = p.id
            JOIN families f ON p.family_id = f.id
            WHERE b.bet_type = 'eindklassement'
            ORDER BY f.name, p.name
        ''').fetchall()

        players_data = []
        for bet in bets:
            preds = conn.execute('''
                SELECT ep.predicted_position, ep.horse_id, h.name AS horse_name
                FROM eindklassement_predictions ep
                JOIN horses h ON ep.horse_id = h.id
                WHERE ep.bet_id = ?
                ORDER BY ep.predicted_position
            ''', (bet['bet_id'],)).fetchall()

            multiplier = round_multiplier(bet['race_id'])
            horses_data = []
            total_score = 0
            for pred in preds:
                if race5_finished:
                    actual_pos = final_standings.get(pred['horse_id'], 9)
                    score = new_eindklassement_horse_score(
                        pred['predicted_position'], actual_pos
                    )
                    total_score += score
                else:
                    actual_pos = None
                    score = None

                horses_data.append({
                    'predicted_position': pred['predicted_position'],
                    'horse_id': pred['horse_id'],
                    'horse_name': pred['horse_name'],
                    'actual_position': actual_pos,
                    'score': score,
                })

            payout = math.ceil(total_score * multiplier) if race5_finished else None
            players_data.append({
                'player_id': bet['player_id'],
                'player_name': bet['player_name'],
                'family_name': bet['family_name'],
                'bet_id': bet['bet_id'],
                'race_id': bet['race_id'],
                'amount': bet['amount'],
                'multiplier': multiplier,
                'total_score': total_score if race5_finished else None,
                'payout': payout,
                'horses': horses_data,
            })

        return jsonify({
            'race5_finished': race5_finished,
            'final_standings': standings_details,
            'players': players_data,
        })
    finally:
        conn.close()


@app.route('/api/bets/<int:bet_id>/predictions')
def get_bet_predictions(bet_id):
    conn = get_db()
    try:
        rows = conn.execute('''
            SELECT ep.predicted_position, ep.horse_id, h.name AS horse_name
            FROM eindklassement_predictions ep
            JOIN horses h ON ep.horse_id = h.id
            WHERE ep.bet_id = ?
            ORDER BY ep.predicted_position
        ''', (bet_id,)).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route('/api/races/<int:race_id>/results')
def get_race_results(race_id):
    conn = get_db()
    try:
        rows = conn.execute('''
            SELECT rr.position, rr.horse_id, h.name AS horse_name
            FROM race_results rr
            JOIN horses h ON rr.horse_id = h.id
            WHERE rr.race_id = ?
            ORDER BY rr.position
        ''', (race_id,)).fetchall()
        return jsonify({'race_id': race_id, 'positions': [dict(r) for r in rows]})
    finally:
        conn.close()


# ── Bets ──────────────────────────────────────────────────────────────────────

@app.route('/api/races/<int:race_id>/bets')
def get_bets(race_id):
    conn = get_db()
    try:
        rows = conn.execute('''
            SELECT b.id, b.race_id, b.player_id, p.name AS player_name,
                   f.name AS family_name,
                   b.bet_type, b.horse1_id, h1.name AS horse1_name,
                   b.horse2_id, h2.name AS horse2_name, b.amount
            FROM bets b
            JOIN players p ON b.player_id = p.id
            JOIN families f ON p.family_id = f.id
            LEFT JOIN horses h1 ON b.horse1_id = h1.id
            LEFT JOIN horses h2 ON b.horse2_id = h2.id
            WHERE b.race_id = ?
            ORDER BY b.id
        ''', (race_id,)).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route('/api/races/<int:race_id>/bets', methods=['POST'])
def create_bet(race_id):
    conn = get_db()
    try:
        race = conn.execute('SELECT id, status FROM races WHERE id = ?', (race_id,)).fetchone()
        if not race:
            return jsonify({'error': 'Race niet gevonden'}), 404
        if race['status'] != 'open':
            return jsonify({'error': 'Race is al afgesloten'}), 400

        data = request.get_json()
        player_id = data.get('player_id')
        bet_type = data.get('bet_type')
        horse1_id = data.get('horse1_id')
        horse2_id = data.get('horse2_id')
        try:
            amount = float(data.get('amount', 0))
        except (TypeError, ValueError):
            return jsonify({'error': 'Ongeldig bedrag'}), 400

        if not player_id:
            return jsonify({'error': 'Speler is verplicht'}), 400
        if bet_type not in ('single', 'double', 'eindklassement'):
            return jsonify({'error': 'Ongeldig bet type'}), 400

        if bet_type != 'eindklassement':
            if amount <= 0:
                return jsonify({'error': 'Bedrag moet groter zijn dan 0'}), 400
            cap = bet_cap_for_race(race_id)
            if amount > cap:
                return jsonify({'error': f'Maximaal inzet voor deze race is {cap}'}), 400

        predictions = []
        if bet_type == 'single':
            if not horse1_id:
                return jsonify({'error': 'Selecteer een paard'}), 400
            horse2_id = None
        elif bet_type == 'double':
            if not horse1_id or not horse2_id:
                return jsonify({'error': 'Selecteer twee paarden'}), 400
            if horse1_id == horse2_id:
                return jsonify({'error': 'Selecteer twee verschillende paarden'}), 400
        elif bet_type == 'eindklassement':
            # One eindklassement bet per player across all races
            existing = conn.execute(
                "SELECT id FROM bets WHERE player_id = ? AND bet_type = 'eindklassement'",
                (player_id,)
            ).fetchone()
            if existing:
                return jsonify({'error': 'Deze speler heeft al een eindklassement bet geplaatst'}), 400

            predictions = data.get('predictions', [])
            if len(predictions) != 8:
                return jsonify({'error': 'Precies 8 paarden zijn vereist voor eindklassement'}), 400
            horse_ids_pred = sorted(int(p['horse_id']) for p in predictions)
            pos_values = sorted(int(p['predicted_position']) for p in predictions)
            if horse_ids_pred != list(range(1, 9)):
                return jsonify({'error': 'Alle 8 paarden (id 1-8) moeten worden opgegeven'}), 400
            if pos_values != list(range(1, 9)):
                return jsonify({'error': 'Posities 1-8 moeten elk precies één keer voorkomen'}), 400
            horse1_id = None
            horse2_id = None

        cur = conn.execute(
            '''INSERT INTO bets (race_id, player_id, bet_type, horse1_id, horse2_id, amount)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (race_id, player_id, bet_type, horse1_id, horse2_id, amount)
        )
        bet_id = cur.lastrowid

        if bet_type == 'eindklassement':
            for pred in predictions:
                conn.execute(
                    '''INSERT INTO eindklassement_predictions (bet_id, horse_id, predicted_position)
                       VALUES (?, ?, ?)''',
                    (bet_id, int(pred['horse_id']), int(pred['predicted_position']))
                )

        conn.commit()
        return jsonify({'id': bet_id}), 201
    finally:
        conn.close()


@app.route('/api/races/<int:race_id>/bets', methods=['DELETE'])
def delete_bets(race_id):
    conn = get_db()
    try:
        race = conn.execute('SELECT id, status FROM races WHERE id = ?', (race_id,)).fetchone()
        if not race:
            return jsonify({'error': 'Race niet gevonden'}), 404
        if race['status'] != 'open':
            return jsonify({'error': 'Kan bets niet verwijderen van een afgelopen race'}), 400

        conn.execute('DELETE FROM bets WHERE race_id = ?', (race_id,))
        conn.commit()
        return jsonify({'deleted': True})
    finally:
        conn.close()


@app.route('/api/bets/<int:bet_id>', methods=['DELETE'])
def delete_bet(bet_id):
    conn = get_db()
    try:
        row = conn.execute(
            'SELECT b.id, b.race_id, r.status FROM bets b JOIN races r ON b.race_id = r.id WHERE b.id = ?',
            (bet_id,)
        ).fetchone()
        if not row:
            return jsonify({'error': 'Bet niet gevonden'}), 404
        if row['status'] != 'open':
            return jsonify({'error': 'Kan bet niet verwijderen van een afgelopen race'}), 400
        conn.execute('DELETE FROM bets WHERE id = ?', (bet_id,))
        conn.commit()
        return jsonify({'deleted': True})
    finally:
        conn.close()


@app.route('/api/bets/<int:bet_id>/predictions', methods=['PUT'])
def update_bet_predictions(bet_id):
    conn = get_db()
    try:
        row = conn.execute(
            '''SELECT b.id, b.bet_type, b.race_id, r.status AS race_status
               FROM bets b JOIN races r ON b.race_id = r.id WHERE b.id = ?''',
            (bet_id,)
        ).fetchone()
        if not row:
            return jsonify({'error': 'Bet niet gevonden'}), 404
        if row['bet_type'] != 'eindklassement':
            return jsonify({'error': 'Alleen eindklassement bets kunnen worden bijgewerkt'}), 400
        if row['race_status'] != 'open':
            return jsonify({'error': 'Kan voorspelling niet bewerken van een afgelopen race'}), 400

        data = request.get_json()
        predictions = data.get('predictions', [])
        if len(predictions) != 8:
            return jsonify({'error': 'Precies 8 paarden zijn vereist'}), 400
        horse_ids_pred = sorted(int(p['horse_id']) for p in predictions)
        pos_values = sorted(int(p['predicted_position']) for p in predictions)
        if horse_ids_pred != list(range(1, 9)):
            return jsonify({'error': 'Alle 8 paarden (id 1-8) moeten worden opgegeven'}), 400
        if pos_values != list(range(1, 9)):
            return jsonify({'error': 'Posities 1-8 moeten elk precies één keer voorkomen'}), 400

        conn.execute('DELETE FROM eindklassement_predictions WHERE bet_id = ?', (bet_id,))
        for pred in predictions:
            conn.execute(
                '''INSERT INTO eindklassement_predictions (bet_id, horse_id, predicted_position)
                   VALUES (?, ?, ?)''',
                (bet_id, int(pred['horse_id']), int(pred['predicted_position']))
            )
        conn.commit()
        return jsonify({'updated': True})
    finally:
        conn.close()


@app.route('/api/bets/<int:bet_id>', methods=['PUT'])
def update_bet(bet_id):
    conn = get_db()
    try:
        row = conn.execute(
            'SELECT b.id, b.race_id, r.status FROM bets b JOIN races r ON b.race_id = r.id WHERE b.id = ?',
            (bet_id,)
        ).fetchone()
        if not row:
            return jsonify({'error': 'Bet niet gevonden'}), 404
        if row['status'] != 'open':
            return jsonify({'error': 'Kan bet niet bewerken van een afgelopen race'}), 400

        data = request.get_json()
        try:
            amount = float(data.get('amount', 0))
        except (TypeError, ValueError):
            return jsonify({'error': 'Ongeldig bedrag'}), 400

        cap = bet_cap_for_race(row['race_id'])
        if amount <= 0 or amount > cap:
            return jsonify({'error': f'Bedrag moet tussen €0 en €{cap} zijn'}), 400

        conn.execute('UPDATE bets SET amount = ? WHERE id = ?', (amount, bet_id))
        conn.commit()
        return jsonify({'id': bet_id, 'amount': amount})
    finally:
        conn.close()


@app.route('/api/races/<int:race_id>', methods=['DELETE'])
def delete_race(race_id):
    """Reset or delete a race: removes all bets, results, payouts for this race
    and any races created after it. The race itself is reset to 'open'."""
    conn = get_db()
    try:
        if not conn.execute('SELECT id FROM races WHERE id = ?', (race_id,)).fetchone():
            return jsonify({'error': 'Race niet gevonden'}), 404

        # Delete all data for races after this one
        later = conn.execute('SELECT id FROM races WHERE id > ?', (race_id,)).fetchall()
        for lr in later:
            conn.execute('DELETE FROM payouts WHERE bet_id IN (SELECT id FROM bets WHERE race_id = ?)', (lr['id'],))
            conn.execute('DELETE FROM bets WHERE race_id = ?', (lr['id'],))
            conn.execute('DELETE FROM race_results WHERE race_id = ?', (lr['id'],))
        conn.execute('DELETE FROM races WHERE id > ?', (race_id,))

        # Reset this race
        conn.execute('DELETE FROM payouts WHERE bet_id IN (SELECT id FROM bets WHERE race_id = ?)', (race_id,))
        conn.execute('DELETE FROM bets WHERE race_id = ?', (race_id,))
        conn.execute('DELETE FROM race_results WHERE race_id = ?', (race_id,))
        conn.execute("UPDATE races SET status = 'open' WHERE id = ?", (race_id,))
        conn.commit()
        return jsonify({'reset': True, 'race_id': race_id})
    finally:
        conn.close()


# ── Race Results ──────────────────────────────────────────────────────────────

@app.route('/api/races/<int:race_id>/results', methods=['POST'])
def submit_results(race_id):
    conn = get_db()
    try:
        race = conn.execute('SELECT id, status FROM races WHERE id = ?', (race_id,)).fetchone()
        if not race:
            return jsonify({'error': 'Race niet gevonden'}), 404
        if race['status'] != 'open':
            return jsonify({'error': 'Resultaten al ingevoerd voor deze race'}), 409

        data = request.get_json()
        positions_input = data.get('positions', [])

        if len(positions_input) != 8:
            return jsonify({'error': 'Precies 8 paarden zijn vereist'}), 400

        horse_ids = [int(p['horse_id']) for p in positions_input]
        pos_values = [int(p['position']) for p in positions_input]

        if sorted(horse_ids) != list(range(1, 9)):
            return jsonify({'error': 'Alle 8 paarden (id 1-8) moeten worden opgegeven'}), 400
        if sorted(pos_values) != list(range(1, 9)):
            return jsonify({'error': 'Posities 1-8 moeten elk exact één keer voorkomen'}), 400

        for p in positions_input:
            conn.execute(
                'INSERT INTO race_results (race_id, horse_id, position) VALUES (?, ?, ?)',
                (race_id, int(p['horse_id']), int(p['position']))
            )

        conn.execute("UPDATE races SET status = 'finished' WHERE id = ?", (race_id,))

        finished_count = conn.execute(
            "SELECT COUNT(*) FROM races WHERE status = 'finished'"
        ).fetchone()[0]
        is_last_race = finished_count >= 5
        if not is_last_race:
            next_id = conn.execute('SELECT COALESCE(MAX(id), 0) + 1 FROM races').fetchone()[0]
            conn.execute("INSERT INTO races (id, status) VALUES (?, 'open')", (next_id,))

        conn.commit()
    finally:
        conn.close()

    payout_records = calculate_race_payouts(race_id)

    return jsonify({'race_id': race_id, 'payouts': payout_records}), 201


# ── Results table ─────────────────────────────────────────────────────────────

@app.route('/api/results/table')
def get_results_table():
    """
    Returns a standings table for the race results overview.
    Shape: { race_ids: [1,2,...], horses: [{horse_id, horse_name, total_points, positions}] }
    positions is a dict {race_id_str: position_or_null}
    Sorted by total_points descending.
    """
    conn = get_db()
    try:
        finished = conn.execute(
            "SELECT id FROM races WHERE status = 'finished' ORDER BY id"
        ).fetchall()
        race_ids = [r['id'] for r in finished]

        horses = conn.execute('SELECT id, name FROM horses ORDER BY id').fetchall()

        pos_map = {r: {} for r in race_ids}
        if race_ids:
            ph = ','.join('?' * len(race_ids))
            rows = conn.execute(
                f'SELECT race_id, horse_id, position FROM race_results WHERE race_id IN ({ph})',
                race_ids
            ).fetchall()
            for row in rows:
                pos_map[row['race_id']][row['horse_id']] = row['position']

        result = []
        for h in horses:
            total = sum(
                9 - pos_map[r][h['id']]
                for r in race_ids
                if h['id'] in pos_map.get(r, {})
            )
            result.append({
                'horse_id': h['id'],
                'horse_name': h['name'],
                'total_points': total,
                'positions': {str(r): pos_map[r].get(h['id']) for r in race_ids},
            })

        result.sort(key=lambda x: (-x['total_points'], x['horse_id']))
        return jsonify({'race_ids': race_ids, 'horses': result})
    finally:
        conn.close()


# ── Balance ───────────────────────────────────────────────────────────────────

def _format_formula(bet_type, amount, odds1, pos1, odds2=None, pos2=None):
    """Return a human-readable payout calculation string."""
    def base(a, o): return a * o + a
    def n(v): return f"{v:g}"

    if bet_type == 'eindklassement':
        return '(lopend — uitslag nog niet bekend)'

    if bet_type == 'single':
        if pos1 is None:
            return '(race nog niet afgelopen)'
        if pos1 == 1:
            payout = amount + amount * odds1
            return f"{n(amount)} + {n(amount)} × {n(odds1)} = {math.ceil(payout)}"
        return f"Positie {pos1} — geen uitbetaling"

    if bet_type == 'double':
        if pos1 is None or pos2 is None:
            return '(race nog niet afgelopen)'
        h1 = pos1 <= 2
        h2 = pos2 <= 2
        if h1 and h2:
            payout = amount + amount * (odds1 + odds2)
            return f"{n(amount)} + {n(amount)} × ({n(odds1)} + {n(odds2)}) = {math.ceil(payout)}"
        elif h1:
            payout = amount + (amount * odds1) / 2
            return f"{n(amount)} + ({n(amount)} × {n(odds1)}) ÷ 2 = {math.ceil(payout)}"
        elif h2:
            payout = amount + (amount * odds2) / 2
            return f"{n(amount)} + ({n(amount)} × {n(odds2)}) ÷ 2 = {math.ceil(payout)}"
        return f"Positie {pos1} en {pos2} — geen uitbetaling"

    return ''


def _get_last_payout_id(conn) -> int:
    """Returns the last_payout_id from the most recent payout_event, or 0 if none."""
    row = conn.execute(
        'SELECT last_payout_id FROM payout_events ORDER BY id DESC LIMIT 1'
    ).fetchone()
    return row['last_payout_id'] if row else 0


@app.route('/api/balance')
def get_balance():
    conn = get_db()
    try:
        races_param = request.args.get('races', '')
        race_ids = [int(x) for x in races_param.split(',') if x.strip().isdigit()] if races_param else None

        if race_ids:
            ph = ','.join('?' * len(race_ids))
            rows = conn.execute(f'''
                SELECT p.id AS player_id, p.name AS player_name, f.name AS family_name,
                       COALESCE(SUM(COALESCE(py.amount, 0.0)), 0.0) AS total
                FROM players p
                JOIN families f ON p.family_id = f.id
                LEFT JOIN bets b ON b.player_id = p.id AND b.race_id IN ({ph}) AND b.bet_type != 'eindklassement'
                LEFT JOIN payouts py ON py.bet_id = b.id
                GROUP BY p.id
                ORDER BY f.name, p.name
            ''', race_ids).fetchall()
        else:
            last_paid_id = _get_last_payout_id(conn)
            rows = conn.execute('''
                SELECT p.id AS player_id, p.name AS player_name, f.name AS family_name,
                       COALESCE(SUM(CASE WHEN py.id > ? THEN py.amount ELSE 0 END), 0) AS total
                FROM players p
                JOIN families f ON p.family_id = f.id
                LEFT JOIN bets b ON b.player_id = p.id AND b.bet_type != 'eindklassement'
                LEFT JOIN payouts py ON py.bet_id = b.id
                GROUP BY p.id
                ORDER BY f.name, p.name
            ''', (last_paid_id,)).fetchall()

        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@app.route('/api/balance/<int:player_id>')
def get_player_balance(player_id):
    conn = get_db()
    try:
        player = conn.execute('''
            SELECT p.id, p.name, f.name AS family_name
            FROM players p
            JOIN families f ON p.family_id = f.id
            WHERE p.id = ?
        ''', (player_id,)).fetchone()
        if not player:
            return jsonify({'error': 'Speler niet gevonden'}), 404

        races_param = request.args.get('races', '')
        race_ids = [int(x) for x in races_param.split(',') if x.strip().isdigit()] if races_param else None
        last_paid_id = _get_last_payout_id(conn)

        base_select = '''
            SELECT b.id AS bet_id, b.race_id, b.bet_type, b.amount,
                   h1.name AS horse1_name, h1.odds AS horse1_odds,
                   h2.name AS horse2_name, h2.odds AS horse2_odds,
                   rr1.position AS horse1_position,
                   rr2.position AS horse2_position,
                   {payout_expr} AS payout,
                   CASE WHEN py.id IS NOT NULL AND py.id <= ? THEN py.amount ELSE 0 END AS paid_out,
                   r.status AS race_status,
                   py.id IS NOT NULL AS has_payout
            FROM bets b
            LEFT JOIN horses h1 ON b.horse1_id = h1.id
            LEFT JOIN horses h2 ON b.horse2_id = h2.id
            LEFT JOIN race_results rr1 ON rr1.race_id = b.race_id AND rr1.horse_id = b.horse1_id
            LEFT JOIN race_results rr2 ON rr2.race_id = b.race_id AND rr2.horse_id = b.horse2_id
            LEFT JOIN payouts py ON py.bet_id = b.id
            LEFT JOIN races r ON b.race_id = r.id
            WHERE b.player_id = ? AND b.bet_type != 'eindklassement' {race_filter}
            ORDER BY b.race_id, b.id
        '''

        if race_ids:
            ph = ','.join('?' * len(race_ids))
            query = base_select.format(
                payout_expr='COALESCE(py.amount, 0.0)',
                race_filter=f'AND b.race_id IN ({ph})'
            )
            params = (last_paid_id, player_id, *race_ids)
        else:
            query = base_select.format(
                payout_expr='CASE WHEN py.id > ? THEN COALESCE(py.amount, 0.0) ELSE 0 END',
                race_filter=''
            )
            params = (last_paid_id, last_paid_id, player_id)

        raw_bets = conn.execute(query, params).fetchall()

        # Pre-compute final standings once if any eindklassement bets are resolved
        standings_cache = None

        bet_list = []
        for b in raw_bets:
            entry = dict(b)
            if b['bet_type'] == 'eindklassement':
                if b['has_payout']:
                    # Compute score breakdown for display
                    if standings_cache is None:
                        standings_cache = compute_final_standings(conn)
                    preds = conn.execute('''
                        SELECT horse_id, predicted_position
                        FROM eindklassement_predictions WHERE bet_id = ?
                    ''', (b['bet_id'],)).fetchall()
                    total_score = sum(
                        eindklassement_horse_score(p['predicted_position'],
                                                   standings_cache.get(p['horse_id'], 9))
                        for p in preds
                    )
                    mult = round_multiplier(b['race_id'])
                    entry['formula'] = f'{total_score}pts × {mult} = €{int(b["payout"])}'
                else:
                    entry['formula'] = '(lopend — einduitslag nog niet bekend)'
            else:
                entry['formula'] = _format_formula(
                    b['bet_type'], b['amount'],
                    b['horse1_odds'], b['horse1_position'],
                    b['horse2_odds'], b['horse2_position'],
                )
            bet_list.append(entry)

        total = sum(b['payout'] for b in bet_list)

        return jsonify({
            'player_id': player_id,
            'name': player['name'],
            'family': player['family_name'],
            'bets': bet_list,
            'total': round(total, 2),
        })
    finally:
        conn.close()


@app.route('/api/balance/uitbetalen', methods=['POST'])
def uitbetalen():
    conn = get_db()
    try:
        max_payout = conn.execute('SELECT COALESCE(MAX(id), 0) FROM payouts').fetchone()[0]
        conn.execute(
            'INSERT INTO payout_events (last_payout_id) VALUES (?)', (max_payout,)
        )
        conn.commit()
        return jsonify({'success': True})
    finally:
        conn.close()


if __name__ == '__main__':
    with app.app_context():
        init_db()
    app.run(debug=True, host='localhost', port=5000)
