import random
import statistics

VARIANTS = {
    'A (6/5/4/3)':  {1: 6,  2: 5, 3: 4, **{p: 3 for p in range(4, 9)}},
    'B (7/6/5/4)':  {1: 7,  2: 6, 3: 5, **{p: 4 for p in range(4, 9)}},
    'C (8/7/6/5)':  {1: 8,  2: 7, 3: 6, **{p: 5 for p in range(4, 9)}},
    'D (9/8/7/6)':  {1: 9,  2: 8, 3: 7, **{p: 6 for p in range(4, 9)}},
    'E (10/9/8/7)': {1: 10, 2: 9, 3: 8, **{p: 7 for p in range(4, 9)}},
}
MULTIPLIERS = [1.0, 0.8, 0.6, 0.4, 0.2]
RACE_LABELS  = ['race 1 (×1.0)', 'race 2 (×0.8)', 'race 3 (×0.6)', 'race 4 (×0.4)', 'race 5 (×0.2)']
N = 10_000
HORSES = list(range(1, 9))

random.seed(42)  # reproducible


def score_prediction(predicted_order, actual_order, base_scores):
    actual_pos = {horse: pos + 1 for pos, horse in enumerate(actual_order)}
    total = 0
    for pred_pos, horse in enumerate(predicted_order, start=1):
        diff = abs(pred_pos - actual_pos[horse])
        base = base_scores[pred_pos]
        if diff == 0:
            total += base
        elif diff == 1:
            total += max(0, base - 1)
        # diff >= 2 → 0
    return total


# ── Run simulations ────────────────────────────────────────────────────────────

results = {}
for name, base_scores in VARIANTS.items():
    scores = [
        score_prediction(
            random.sample(HORSES, 8),
            random.sample(HORSES, 8),
            base_scores,
        )
        for _ in range(N)
    ]
    results[name] = scores

# ── Print results ──────────────────────────────────────────────────────────────

col_w = 14
header_mult = '  '.join(f'{lbl:>{col_w}}' for lbl in RACE_LABELS)
print(f"\n{'Variant':<16}  {'Mean pts':>9}  {'Std':>6}  {header_mult}")
print('-' * (16 + 2 + 9 + 2 + 6 + 2 + (col_w + 2) * len(MULTIPLIERS)))

for name, scores in results.items():
    mean = statistics.mean(scores)
    std  = statistics.stdev(scores)
    mult_cols = '  '.join(f'€{mean * m:>{col_w - 1}.2f}' for m in MULTIPLIERS)
    print(f"{name:<16}  {mean:>9.2f}  {std:>6.2f}  {mult_cols}")

print()
print("Note: 'Mean pts' is the raw score before the round multiplier.")
print("      'race N (×M) avg' is what a player betting in race N earns on average.")
print(f"      Based on {N:,} random simulations.")
