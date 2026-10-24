# berdnerd

A phone app for learning 50 common Sydney birds by sight and sound. It installs to the home screen and works offline.

What's in it: a **Learn** mode (flashcards by family), **Photo** and **Call** quizzes with spaced repetition and real lookalike distractors, a **Knowledge** quiz (diet, other names, native or introduced, one fact per bird), a **Seasons** quiz built on Atlas of Living Australia records, **Odd one out**, a grouped **Field guide**, and **Bird basics** (parts of a bird, beak and body shapes, where to look, how to listen). New users start with a 12-bird starter pack. Settings include a colour-blind palette.

Data files and how to rebuild them:

- `tools/species.json` — names, family, native/introduced, lookalikes and ID tips; `node tools/update-species.mjs` copies them into `app/data/birds.json` without touching media.
- `tools/facts.json` — hand-checked facts for the knowledge quiz, each with its Wikipedia source; `node tools/build-facts.mjs` writes `app/data/facts.json`.
- `tools/seasonality-overrides.json` — hand labels for seasonal patterns; `node tools/fetch-seasonality.mjs` pulls monthly counts from the Atlas of Living Australia and writes `app/data/seasonality.json` (re-run yearly).

An audit of the app from October 2026, with research on seasonality data and on Indigenous bird names, is in `docs/audit-2026-10-25/`.

**Use it:** https://berdnerd.github.io

- iPhone: open the link in Safari, tap Share, then **Add to Home Screen**.
- Android: open the link in Chrome, tap the menu, then **Install app**.
- For offline use, open Settings in the app and tap **Download**.

## Fonts

[Fredoka](https://github.com/hafontia/Fredoka-One) and [Nunito](https://github.com/googlefonts/nunito), both under the SIL Open Font License (see `app/fonts/`).

## Photos and recordings

Photos and most calls come from [iNaturalist](https://www.inaturalist.org) observers; a few calls come from [xeno-canto](https://xeno-canto.org) recordists. All are used under their Creative Commons licences (CC0, BY, BY-NC, BY-SA, BY-NC-SA; NoDerivatives items are excluded because photos are resized and clips trimmed). Every item is credited in the app (Settings > Photo and sound credits) with a link to the original and to its licence. The app icon is a crop of [observation 150118680](https://www.inaturalist.org/observations/150118680) by Jude Wright (CC BY-NC).

Most of the media is NonCommercial-licensed, so the app must stay free and ad-free.

## How the media is chosen

- `tools/species.json` lists the birds, lookalike groups and ID tips.
- `node tools/fetch-media.mjs candidates` gathers 12 photo candidates per bird; the best 4 are picked by hand into `tools/picks.json` (first one is the cover).
- `node tools/fetch-media.mjs call-candidates` gathers up to 8 recordings per bird.
- `tools/check-calls.py` runs [BirdNET](https://github.com/birdnet-team/birdnet) over every recording, keeps up to 3 where the target bird is clearly calling, and picks the best 20 seconds of each.
- `node tools/fetch-media.mjs build` downloads the picks and writes `app/data/birds.json`.

Preview locally with `node tools/serve.mjs`, then open http://localhost:5173.
