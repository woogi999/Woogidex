# Landing scenery

The painting band on the front page (`/`) is a stack of WebP images in `public/assets/landing/`, one folder per theme:

| File | Size | What it is |
|---|---|---|
| `sky.webp` | 2400 × 1350 | Back layer: sky, sun or moon, stars. Opaque. |
| `clouds.webp` | 2400 × 1350 | Clouds and birds, transparent around them. |
| `far.webp` | 2400 × 1350 | The far mountain ranges, transparent above them. |
| `sea.webp` | 2400 × 1350 | The sea, islands and the big rocky island. |
| `fg.webp` | 2400 × 1350 | Front layer: the ledge, pines, meadow. |

`day/` shows in the light theme and `night/` in the dark one.

To paint your own, keep each file's name and size and keep the transparent areas transparent, so the layers can slide over each other. Each layer pans by its own amount as the cursor or phone moves, the front layer the most. Layers are cropped to fill the band without stretching. The band is wide and short, so on a computer it shows the middle band of the picture (roughly the horizon, a bit below centre), and on a phone about the middle third of the width. Keep important things near the middle. The band's top and bottom fade into the page on their own, so the edges don't need painting out.

## Regenerating the painted version

`npm run dev`, then open `/scripts/landing-painter/`. It paints both themes with `painter.ts` and offers every file as a download. Nothing in it is AI-generated: the site doesn't allow AI art.
