"""Prépare les données de l'extension à partir du zip HackerTube (licence ODC-By 1.0).

Usage : python3 -I scripts/build_data.py source/hackertube-data extension/data
"""
import json
import sys
from pathlib import Path

import numpy as np

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

videos = [json.loads(line) for line in open(src / "videos.jsonl")]

# On garde les vidéos vraiment recommandées et pas l'actu périmée.
keep = [v for v in videos if v["hn"]["recommenders"] >= 2 and v["shelf_life"] != "news"]
# Certaines conférences ont été mises en ligne deux fois : on garde la mieux notée (liste déjà triée).
titles = set()
keep = [v for v in keep if not (norm := " ".join(v["title"].lower().split())) in titles and not titles.add(norm)]
kept = {v["vid"] for v in keep}

slim = [
    {
        "v": v["vid"],
        "t": v["title"],
        "c": v["channel"],
        "k": v["content_type"],
        "a": v["categories"][0]["area"] if v["categories"] else "",
        "s": v["score"],
        "r": v["hn"]["recommenders"],
        "y": [v["hn"]["first_year"], v["hn"]["last_year"]],
        "q": v["quote"]["text"] if v.get("quote") else "",
        "qy": v["quote"]["year"] if v.get("quote") else "",
        "w": v["why_hn"],
    }
    for v in keep
]

# « À suivre » : les plus proches par le sens (embeddings fournis dans le zip),
# en remontant celles qu'au moins 2 mêmes personnes ont aussi recommandées.
emb = np.load(src / "embeddings.npy").astype(np.float32)
ids = json.load(open(src / "embedding_ids.json"))
row = {v: i for i, v in enumerate(ids)}
mask = np.array([v in kept for v in ids])

shared = {}
for line in open(src / "related.jsonl"):
    d = json.loads(line)
    # une seule personne en commun, c'est du bruit
    shared[d["vid"]] = [r["vid"] for r in d["related"] if r["vid"] in kept and r["shared_recommenders"] >= 2]

N = 12
related = {}
for v in keep:
    vid = v["vid"]
    sims = emb @ emb[row[vid]]
    sims[~mask] = -1
    sims[row[vid]] = -1
    near = [ids[i] for i in np.argsort(-sims)[:40]]
    both = [x for x in near if x in shared.get(vid, [])]
    picks = (both + [x for x in near if x not in both])[:N]
    related[vid] = picks

json.dump(slim, open(out / "videos.json", "w"), ensure_ascii=False, separators=(",", ":"))
json.dump(related, open(out / "related.json", "w"), separators=(",", ":"))
print(f"{len(slim)} vidéos gardées sur {len(videos)}")
