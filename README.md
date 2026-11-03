<img width="1019" height="343" alt="woogidex_icon" src="https://github.com/user-attachments/assets/78e38332-dfce-4ab5-b92a-8d7955316862" />

A browser-based toolkit for making and battling with Fakemon.

I started this because I wanted one place to actually **design a Fakemon from start to finish**, instead of bouncing between a bunch of different tools. It's grown a fair bit since then.

This repo is the whole Woogidex site: the Fakemon maker, the battle simulator, accounts, the Community Hub, events, messages and the admin panel. The site is live at [dex.woogi.xyz](https://dex.woogi.xyz). The Cloudflare Worker and the database (Supabase) are in the private `woogidex-backend` repo.

## Run it

```sh
npm install
npm run dev
```

Then open http://localhost:5173. The dev server talks to the live backend, so accounts and data are real. To use a local mock backend, run `npm run site -- --backend=mock` (see below).

To check a production build: `npm run build`, then `npm run preview`.

Your collection lives in this browser (IndexedDB). Localhost is a different site from dex.woogi.xyz as far as the browser cares, so it starts empty. Export from the live site and import here to bring your Fakemon over.

## Checks

Run these before you push. CI (`.github/workflows/ci.yml`) runs the same three on every push and pull request:

```sh
npm run typecheck
npm test
npm run build
```

## Features

**Editor**
- Stats, BST, typing, abilities, egg groups, gender ratios, height and weight
- Learnset editor with move recommendations
- Custom moves, abilities, and items, including a visual (Scratch-style) block editor for writing their actual battle effects
- Evolution lines, with methods and connected learnsets
- Sample competitive set generator
- Type matchup / bulk comparison analysis tab
- Shiny artwork, cries, and art credit
- PNG, plain text, JSON, Pokémon Showdown, and Pokémon Essentials export
- A name generator for when you're stuck

**My Collection**
- Folders, pins, search and sorting
- Regions: group Fakemon into a dex of your own, with analytics
- Custom types
- Safety checks and a recovery scan, so a bad load never wipes your collection

**Battle**
- A Pokémon-style battle simulator, including a fair amount of Showdown's move/ability/item data
- Battle a bot. Online battles need accounts, which a host site brings (see below)

## Sample Set Generator

Woogidex looks at a Fakemon's actual data and tries to build a sensible competitive set for it: base stats, typing, abilities, available moves, STAB, coverage, setup, recovery, priority, hazards, and so on. It scores the Fakemon against roles like Physical Sweeper, Wallbreaker, Bulky Attacker, Support, Pivot and Hazard Setter, and builds a set around whichever fits best.

It's not perfect, but it's a genuinely useful starting point.

## How the code is laid out

| Folder | What is in it |
|---|---|
| `js/core/` | Boot (`app.ts`), routing, storage, the extension registries (`extend.ts`), Supabase, notifications, moderation |
| `js/host.ts` | The site's pages, routes, header buttons and settings. `js/core/app.ts` calls `installHost()` once, before boot |
| `js/editor/` | The Fakemon editor, the ability block editor, sample sets |
| `js/battle/` | The battle engine, its UI and 3D field, and the netcode |
| `js/export/` | PNG, Showdown, Essentials and ZIP export |
| `js/features/` | Pokédex data, analysis, evolution, regions, accounts, the Community Hub, messages, events |
| `js/app/` | The React pages, components and dialogs |
| `js/admin/`, `admin.html` | The staff panel |
| `css/` | Stylesheets. The order in `index.html` matters |
| `public/` | Pictures, type icons and emojis, copied into the build as they are |
| `scripts/` | Dev helpers: `site.mjs`, `mock-backend.mjs`, `local-db.mjs`, `sync.mjs`, `git-all.mjs` |
| `tests/` | `node --test` tests |
| `vite.shared.js` | The build (404 copy, service worker, emoji list) |

## Get both repos

Put the two repos in one parent folder:

```
<parent>/woogidex-core
<parent>/woogidex-backend
```

1. Clone this repo: `git clone https://github.com/woogi999/woogidex-core.git`
2. In `woogidex-core`, run `npm run sync`. It clones `woogidex-backend` next to it, if your account can read it.
3. Run `npm run sync` again at any time to pull both.

`npm run sync` skips a repo that has uncommitted changes. It only does fast-forward pulls, so it never makes a merge.

`woogidex.code-workspace` opens both repos in one VS Code window.

In the parent folder, `node woogidex-core/scripts/git-all.mjs <command>` runs one git command in both repos. A small `git.cmd` in the parent folder can call it for you in cmd.exe.

## The whole site in one command

`npm run site` gets `woogidex-backend` if it is missing, installs packages, and starts the site.

| Command | What it does |
|---|---|
| `npm run site` | Dev server with the live backend |
| `npm run site -- --backend=mock` | Dev server with a local mock backend |
| `npm run site -- --backend=local` | Dev server with a real Supabase in Docker |
| `npm run site -- build` | Production build into `dist/`, then serves it |
| `npm run site -- build --no-serve` | Production build only |
| `npm run site -- --sync` | Pulls both repos first |
| `npm run site -- --check` | Runs the typecheck first |
| `npm run site -- --backend=<url>` | Uses another Supabase project |

The backends:

- **live**: the real Supabase project. Accounts and data are real. What you do there goes live.
- **mock**: `scripts/mock-backend.mjs`, on 127.0.0.1 only. Any username and password signs you in. Tables are plain JSON lists in `node_modules/.cache/woogidex-mock/db.json`. Delete that file to start empty. It has no row-level rules, no storage, no Realtime and only two edge functions, so some features fail as they do offline.
- **local**: a real Supabase in Docker (`scripts/local-db.mjs`) with the live schema and no live data. Row-level rules, triggers and database functions work as on the live site. Edge functions do not run, so sign in with an email address, not a username.

Set up the local backend one time:

1. Install Docker Desktop and the Supabase CLI.
2. Start Docker Desktop.
3. Run `supabase login`. It opens the browser.
4. Run `npm run local-db -- setup`. It dumps the live schema (no data) into `woogidex-backend/local/`.
5. Run `npm run site -- --backend=local`.

Other commands: `npm run local-db -- stop` stops it. `npm run local-db -- reset` empties it. Run `setup` again to take a fresh schema dump after new migrations.

The Worker does not run locally. Link previews, `/sheets` and TURN need Cloudflare and its secrets. The dev server stands in for the `/sb` proxy.

## Which repo gets my change?

| You change | Commit it in |
|---|---|
| Anything on the site: the editor, battles, accounts, the Community Hub, admin, CSS | `woogidex-core` (public, so never commit a secret) |
| The Worker, database migrations, edge functions | `woogidex-backend` |

The old `woogidex-web` repo is an archive. Its history is part of this repo now. Do not commit to it.

## Deploying

`.github/workflows/deploy.yml` builds this repo and deploys the result with the Worker from `woogidex-backend`. It runs when:

- something is pushed to `main` here,
- the backend pushes a Worker change to `main` (it sends a `repository_dispatch`),
- you start it by hand (Actions > Deploy > Run workflow).

It runs only in `woogi999/woogidex-core`, never in a fork or for a pull request. The workflow file lists the secrets it needs. They are in the `production` environment, which only `main` can use. The workflow does not touch Supabase. The Supabase GitHub integration on `woogidex-backend` deploys migrations and edge functions.

## Status

Still very much a **work in progress**. Things will probably break, things will probably get redesigned, and some systems (looking at you, battle sim) are still being actively fought with.

## Contributing

Found something broken, or have an idea? Open an issue or a PR. CI type-checks, tests and builds every pull request.

Have fun making weird Pokémon. :3
