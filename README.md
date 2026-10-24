# berdnerd

A phone app for learning 50 common Sydney birds by sight and sound: a photo quiz, a call quiz and a field guide. It installs to the home screen and works offline.

**Use it:** https://berdnerd.github.io

- iPhone: open the link in Safari, tap Share, then **Add to Home Screen**.
- Android: open the link in Chrome, tap the menu, then **Install app**.
- For offline use, open Settings in the app and tap **Download**.

## Fonts

[Fredoka](https://github.com/hafontia/Fredoka-One) and [Nunito](https://github.com/googlefonts/nunito), both under the SIL Open Font License (see `app/fonts/`).

## Photos and recordings

All photos and calls come from [iNaturalist](https://www.inaturalist.org) observers and are used under their Creative Commons licences. Every item is credited in the app (Settings > Photo and sound credits), with a link to the original observation.

## How the media is chosen

- `tools/species.json` lists the birds, lookalike groups and ID tips.
- `node tools/fetch-media.mjs candidates` gathers 12 photo candidates per bird; the best 4 are picked by hand into `tools/picks.json` (first one is the cover).
- `node tools/fetch-media.mjs call-candidates` gathers up to 8 recordings per bird.
- `tools/check-calls.py` runs [BirdNET](https://github.com/birdnet-team/birdnet) over every recording, keeps up to 3 where the target bird is clearly calling, and picks the best 20 seconds of each.
- `node tools/fetch-media.mjs build` downloads the picks and writes `app/data/birds.json`.

Preview locally with `node tools/serve.mjs`, then open http://localhost:5173.
