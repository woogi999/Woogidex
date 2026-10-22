# woogidex-web

The dex.woogi.xyz site: [Woogidex Core](https://github.com/woogi999/woogidex-core) plus everything that needs an account or a server. This repo is private.

| Repo | Visibility | What is in it |
|---|---|---|
| `woogidex-core` | public | The Fakemon maker and battles. The app itself |
| `woogidex-web` | private | Accounts, Community Hub, events, messages, notifications, cloud backup, the admin panel, policies, changelog |
| `woogidex-backend` | private | The Cloudflare Worker and Supabase (migrations, edge functions) |

## Get all repos

Put the three repos in one parent folder:

```
<parent>/woogidex-core
<parent>/woogidex-web
<parent>/woogidex-backend
```

1. Clone this repo: `git clone https://github.com/woogi999/woogidex-web.git`
2. In `woogidex-web`, run `npm run sync`. It clones the other two next to it.
3. Run `npm run sync` again at any time to pull all three.

`npm run sync` skips a repo that has uncommitted changes. It only does fast-forward pulls, so it never makes a merge.

Open `woogidex.code-workspace` in VS Code (File > Open Workspace from File). It shows all three repos in one window. Source Control lists each repo on its own, so a commit always goes to the repo that owns the file.

### Git in all three repos

In the parent folder, `git <command>` runs the command in `woogidex-core`, `woogidex-web` and `woogidex-backend`, one after the other. For example, `git status`, `git pull` or `git push`. A repo that fails, such as one with nothing to commit, does not stop the others. A summary line shows the result for each repo.

`scripts/git-all.mjs` does the work. Each shell needs one small hook in the parent folder:

| Shell | Hook |
|---|---|
| cmd | `git.cmd` in the parent folder: `node "%~dp0woogidex-web\scripts\git-all.mjs" %*` |
| Git Bash | A `git` function in `~/.bashrc` that calls the script when `$PWD` is the parent folder |
| PowerShell | A `git` function in your PowerShell profile that calls the script when the current folder is the parent folder, else `git.exe` |

Without a hook, run `node woogidex-web/scripts/git-all.mjs <command>` from the parent folder.

Inside a repo folder, `git` is plain git.

## Which repo gets my change?

| You change | Commit it in |
|---|---|
| The editor, the collection, battles, export, CSS, shared UI | `woogidex-core` (public, so no secrets) |
| Accounts, Community Hub, events, messages, admin, policies, changelog | `woogidex-web` |
| The Worker, database migrations, edge functions | `woogidex-backend` |

The old `woogidex` repo is a private archive. Do not commit to it. A push there deploys nothing.

## Run it

```sh
npm install
npm run dev
```

`npm run dev` and `npm run build` first put Core at `./core` (`scripts/link-core.mjs`):

1. If `../woogidex-core` exists, the script links it, so your Core edits show up here at once.
2. If not, the script clones Core from GitHub.
3. Set `WOOGIDEX_CORE` to use a Core folder somewhere else.

`./core` is not part of this repo (it is in `.gitignore`).

### The whole site in one command

`npm run site` gets the other two repos if they are missing, links Core, installs packages, and starts the site. It also works from the parent folder that holds the three repos, if that folder has the small `package.json` that calls these scripts.

| Command | What it does |
|---|---|
| `npm run site` | Dev server with the live backend |
| `npm run site -- --backend=mock` | Dev server with a local mock backend |
| `npm run site -- --backend=local` | Dev server with a real Supabase in Docker |
| `npm run site -- build` | Production build into `dist/`, then serves it |
| `npm run site -- build --no-serve` | Production build only |
| `npm run site -- --sync` | Pulls all three repos first |
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

## How the files fit together

This repo only has its own files, at the same paths they would have in Core. A file that is not here comes from Core: `js/features/auth.ts` imports `'../core/app.ts'`, and the build finds Core's `js/core/app.ts`. TypeScript does the same through `rootDirs` in `tsconfig.json`.

- `js/host.ts` is where the site plugs into Core: its pages, routes, header buttons, settings and `api` functions. Core calls `installHost()` once, before boot.
- `index.html` is the site's page shell. Keep it in step with Core's `index.html` (stylesheets, containers).
- `public/` goes on top of Core's `public/` in the build.
- `admin.html` and `js/admin/` are the staff panel.

Do not add a file here with the same path as a file in Core. Change Core instead.

## Deploying

`.github/workflows/deploy.yml` builds Core + this repo and deploys the result with the Worker from `woogidex-backend`. It runs when:

- something is pushed to `main` here,
- Core or backend pushes to `main` (they send a `repository_dispatch`),
- you start it by hand (Actions > Deploy > Run workflow).

The workflow file lists the secrets it needs. It does not touch Supabase. The Supabase GitHub integration on woogidex-backend deploys migrations and edge functions (see that repo's README).
