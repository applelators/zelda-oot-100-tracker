# Ocarina of Time — 100% Binge Tracker

A spoiler-tolerant, missable-safe **linear route tracker** for taking the Switch 2
remake of *The Legend of Zelda: Ocarina of Time* to **community 100% in one
midnight-launch sitting**.

Built as a sibling of `xenoblade-100-tracker`: static SPA, Cloudflare Worker +
`[assets]`, all state behind `store.js`, zero backend, works offline (which is the
point — a couch binge shouldn't depend on wifi).

## What "100%" means here

The original N64 completion set, all itemized and metered:

| Category | Count |
|---|---|
| Heart Pieces | 36 |
| Gold Skulltulas | 100 |
| Songs (ocarina + warp) | 12 |
| Spiritual Stones + Medallions | 3 + 6 = 9 |
| Bottles | 4 |
| Great Fairy upgrades | 6 |
| Equipment / Items / Capacity upgrades | all |
| Trade chains (Biggoron's Sword + Happy Mask) | both |
| Dungeons | all |

## How it's structured

- **Mirrors the [Zelda Dungeon walkthrough](https://www.zeldadungeon.net/ocarina-of-time-walkthrough/)
  exactly** — the same **14 chapters** and **~60 numbered sections** (1.1, 1.2 … 14.5),
  in the same order, so you take the same path through the game. Each phase is a ZD
  chapter; each step is a ZD section.
- **Heart Pieces (#1–#36) and Gold Skulltulas (#1–#100)** use Zelda Dungeon's
  collection-order numbering, each its own checkbox with the walkthrough's
  location/method text.
- **Missables, thoroughly flagged in place** — every time-sensitive, order-sensitive
  or child-only pickup carries a ⚠ note (Scarecrow's Song setup, plant-the-beans spots,
  night-only tokens, Dampé's random dig, the Biggoron timed legs, child-only dungeons,
  the final 100% audit). 29 sections are flagged. Use the **only-missable filter** to
  review them all at a glance.
- **"Up next" banner** points at the first incomplete step and jumps you to it.
- **Launch countdown** — set your midnight drop datetime; it ticks down.
- Filters: hide completed, only-missable, search. Export / import / reset.

## Data confidence

`data/route.json` tags every item:

- **high** — essentially everything: structure, songs, dungeon order, key items,
  medallions/stones, trade chains, **all 36 Heart Pieces** (exact location + method),
  **and all 100 Gold Skulltulas** (canonical #1–#100, each with its own location).
- **verify** — only minor details to confirm in-game. **The in-game Gold Skulltula
  counter remains the ultimate source of truth.**

> Built pre-release on the **original N64** baseline. On launch night, patch in any
> remake-specific additions/moves (new collectibles, reordered items) — the data is
> all in one JSON file.

### Data hardening — done

1. Heart Pieces corrected from a wrong 24 to the real **36**; all **100 Gold
   Skulltulas individually itemized**. Every number validated present exactly once.
2. **Restructured to mirror the Zelda Dungeon walkthrough** — 14 chapters / ~60
   numbered sections, same path, with collectibles placed in the exact section ZD
   collects them and renumbered to ZD's order.
3. **Missables audit** — every time/order/child-gated pickup pulled from the
   walkthrough and flagged in place, with a `meta.missablesSummary` quick-reference.

Source of truth: zeldadungeon.net/ocarina-of-time-walkthrough.

## Run it

```bash
# local preview (no install)
cd public && python3 -m http.server 8731   # → http://localhost:8731

# or with wrangler
wrangler dev
```

## Deploy (applelators Cloudflare account)

```bash
wrangler deploy
```

Pure static assets — no KV/D1 needed for v1. The Worker leaves a seam (`/api/*`)
for a future cross-device sync layer; only `worker.js` + `store.js` would change.

## Layout

```
worker.js              Worker entry (serves ./public via ASSETS)
wrangler.toml
public/
  index.html
  styles.css
  store.js             localStorage persistence (checked / tally / done / prefs)
  app.js               route rendering, meters, countdown, filters
  data/route.json      the 17-phase linear 100% route + all collectibles
```
