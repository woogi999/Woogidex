# The landing page: parked, not out yet

The new front page is finished enough to keep in the code, but it is switched
off so it doesn't go live before it's ready. With the switch off, `/` opens My
Collection and the logo goes there too, exactly as before.

## Where the switch is

`js/core/flags.ts` exports `LANDING_PAGE`, which is true only when the build
has `VITE_LANDING_PAGE=1`. Everything that would show the landing page checks
it:

- `js/core/app.ts`: `showLanding()`, the boot skeleton and the data warm-up
- `js/app/mount.tsx`: whether `LandingPage` is mounted at all
- `js/app/pages/SettingsPage.tsx`: the "Paint smudge on the front page" setting
- `index.html`: the first-frame styling (`%VITE_LANDING_PAGE%`)

## See it locally

Create `.env.development.local` in the project root (git-ignored, and only
read by `npm run dev`, so a production build made on this machine stays off):

    VITE_LANDING_PAGE=1

## What is not in git

`public/assets/landing/` (the painted day and night scenery) is in
`.gitignore`, and a build leaves it out of `dist/` while the switch is off
(`holdBackLanding` in `vite.config.js`). It is repainted by `scripts/landing-painter/` and lives only on
this machine until launch. Note: the two commits made before this
(`282507d`, `d56479d`) still contain those images; if they must never reach
GitHub, squash those commits before pushing.

## Launching it

1. Remove the `public/assets/landing/` line from `.gitignore` and add the art.
2. Apply `supabase/migrations/20261020000000_landing_showcase.sql` (the
   signed-out showcase; it has not been applied to the live database).
3. Build with `VITE_LANDING_PAGE=1` (or make `LANDING_PAGE` plain `true` and
   drop the checks).
4. Put the parked release notes below into the changelog.

## Parked release notes

These were written for v1.14.1 and taken out until launch:

- **A brand new front page.** Woogidex now opens on a goated ass artwork scenery with a few Fakémon from the Community Hub and a quick tour of what you can do. Your collection is still one click away, under My Collection.
- **Paint with your cursor.** Move over the logo, the painting or a colorful button and you'll pick up its color, then smear it across the page. The paint fades as you drag it and dries away after a few seconds, and you get a clean page every time you come back. You can turn it off in Settings. It starts off on phones and slower devices.
