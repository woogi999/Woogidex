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
