"""Picks the best calls for each bird with BirdNET, and where to cut each one.

For every candidate recording, BirdNET scores each 3-second slice. The script finds the
20-second stretch where the target bird is loudest and other birds are quietest, keeps up to
3 good recordings per bird, and writes tools/call-picks.json for `fetch-media.mjs build`.
A full report goes to tools/call-check.json.

Usage: tools/.venv/Scripts/python.exe -I tools/check-calls.py
"""
import json
from collections import defaultdict
from pathlib import Path

import birdnet
import soundfile

TOOLS = Path(__file__).resolve().parent
CLIP_SECONDS = 20
SEGMENT = 3.0
CALLS_PER_BIRD = 3
# BirdNET knows some Sydney birds poorly and labels them as similar-sounding birds instead:
# Pacific Black Duck quacks as its close relative the Mallard, and ibis honks and croaks as
# Egyptian Goose or Great Blue Heron (neither occurs in Australia).
ALIASES = {
    'pacific-black-duck': ['Mallard'],
    'australian-white-ibis': ['Australian Ibis', 'Egyptian Goose', 'Great Blue Heron'],
}


def matches(label, bird):
    """BirdNET labels look like 'Scientific name_Common Name'; taxonomy may differ slightly from ours."""
    sci, _, common = label.partition('_')
    epithet = bird['sci'].partition(' ')[2]
    return (sci == bird['sci'] or common.lower() == bird['name'].lower()
            or common in ALIASES.get(bird['id'], [])
            or common.lower() == bird['name'].lower().replace('australian ', '')
            or sci.split(' ')[-1][:6] == epithet[:6])


def best_window(rows, bird, duration):
    """Returns (start, metrics) for the 20 s stretch where the target bird is clearest."""
    segments = defaultdict(lambda: {'target': 0.0, 'other': 0.0, 'other_name': None})
    for start, label, conf in rows:
        seg = segments[start]
        if matches(label, bird):
            seg['target'] = max(seg['target'], conf)
        elif conf > seg['other']:
            seg['other'], seg['other_name'] = conf, label.partition('_')[2]

    def seg_score(s):
        # Reward the target bird; penalise slices where another bird is louder.
        return s['target'] - max(0.0, s['other'] - s['target'])

    last_start = max(0.0, duration - CLIP_SECONDS)
    starts = [x * SEGMENT for x in range(int(last_start // SEGMENT) + 1)]
    best = None
    for start in starts:
        window = [segments[s] for s in segments if start <= s < start + CLIP_SECONDS - 1]
        score = sum(seg_score(s) for s in window)
        if best is None or score > best[1]:
            best = (start, score, window)
    start, score, window = best
    with_target = [s for s in window if s['target'] > 0]
    others = sorted((s for s in window if s['other_name']), key=lambda s: -s['other'])
    return start, {
        'score': round(score, 2),
        'peak': round(max((s['target'] for s in window), default=0.0), 2),
        'dominance': round(sum(s['target'] >= s['other'] for s in with_target) / len(with_target), 2) if with_target else 0.0,
        'slices_with_bird': len(with_target),
        'loudest_other': [others[0]['other_name'], round(others[0]['other'], 2)] if others else None,
    }


def verdict(m):
    if m['peak'] >= 0.6 and m['dominance'] >= 0.6 and m['slices_with_bird'] >= 2:
        return 'good'
    if m['peak'] >= 0.35 and m['dominance'] >= 0.5:
        return 'ok'
    return 'reject'


def main():
    species = {s['id']: s for s in json.loads((TOOLS / 'species.json').read_text(encoding='utf-8'))}
    candidates = json.loads((TOOLS / 'call-candidates.json').read_text(encoding='utf-8'))
    items = [(bird_id, c, str((TOOLS / c['analysis']).resolve())) for bird_id, cs in candidates.items() for c in cs]

    model = birdnet.load('acoustic', '2.4', 'tf', library='litert')
    df = model.predict([p for _, _, p in items], top_k=5, default_confidence_threshold=0.1, n_workers=4).to_dataframe()
    by_file = defaultdict(list)
    for row in df.itertuples(index=False):
        by_file[str(Path(row.input).resolve())].append((float(row.start_time), row.species_name, float(row.confidence)))

    report, picks = [], {}
    for bird_id, c, path in items:
        start, m = best_window(by_file.get(path, []), species[bird_id], soundfile.info(path).duration)
        report.append({'bird': bird_id, 'obsId': c['obsId'], 'start': start, 'verdict': verdict(m), **m})

    rank = {'good': 0, 'ok': 1}
    for bird_id in candidates:
        usable = sorted((r for r in report if r['bird'] == bird_id and r['verdict'] in rank),
                        key=lambda r: (rank[r['verdict']], -r['score']))
        picks[bird_id] = [{'obsId': r['obsId'], 'start': r['start']} for r in usable[:CALLS_PER_BIRD]]

    (TOOLS / 'call-check.json').write_text(json.dumps(report, indent=1), encoding='utf-8')
    (TOOLS / 'call-picks.json').write_text(json.dumps(picks, indent=1), encoding='utf-8')
    counts = defaultdict(int)
    for r in report:
        counts[r['verdict']] += 1
    print(f"{len(report)} candidate recordings: {dict(counts)}")
    for bird_id, chosen in picks.items():
        if len(chosen) < CALLS_PER_BIRD:
            print(f"  {species[bird_id]['name']}: only {len(chosen)} usable call(s)")


if __name__ == '__main__':
    main()
