# acf-i18n

Single source of truth for every user-facing string in **Auto Clicker AutoFill** — both the
extension and the options page read their labels from here. Nothing else owns translations.

> The `apps/acf-i18n` directory inside the `auto-clicker-auto-fill` monorepo is a **stale
> duplicate**. This repo is the live one. Changes made there do not ship.

## Layout

```
src/locales/<folder>/messages.json   → consumed by the extension
src/locales/<folder>/web.json        → consumed by the options page
```

`<folder>` is the locale code: `en` (source) plus `ar de es fi fr id it ja ko nl pt ru sv
vi zh_CN zh_TW` — 16 targets, 17 total. The list lives in `src/translate.constant.mjs`,
which maps the Google Translate language code to the folder name (e.g. `zh-cn` → `zh_CN`).

`messages.json` is Chrome extension i18n format (`{ "key": { "message": "...",
"description": "..." } }`); `web.json` is a plain nested object.

## The two delivery paths are completely different

This is the thing to get right — the same edit reaches the two apps by different routes.

| | Extension | Options page |
| --- | --- | --- |
| File | `messages.json` | `web.json` |
| When | **Build time** | **Runtime** |
| How | `apps/acf-extension/webpack.config.js` copies `**/messages.json` into `dist/_locales` | `fetch` from `VITE_PUBLIC_I18N` |
| Source | `VITE_PUBLIC_I18N_PATH`, defaulting to `../acf-i18n` (this checkout, as a sibling directory) | `https://cdn.getautoclicker.com/locales` |
| To see a change | Rebuild the extension | Redeploy this repo (or point at a local server) |

Consequence: **a string fix for the options page needs this repo deployed**, not an
options-page release. A string fix for the extension needs an extension rebuild and a
store release — the CDN does nothing for it.

All deployed environments (dev, beta, stable) read `web.json` from the CDN.

## Hosting

`firebase.json` serves `src/` directly on Firebase Hosting — project `auto-clicker-autofill`,
site/target `auto-clicker-auto-fill-static`, fronted by **cdn.getautoclicker.com**. JSON
responses get `Access-Control-Allow-Origin: *` and `GET, OPTIONS`, which is what lets the
options page fetch them cross-origin.

Because the public root is `src/`, the `.mjs` scripts sit next to the data; the `ignore`
list keeps them out of the deploy.

## Local development

```bash
npm start
```

Serves `src/` at `http://0.0.0.0:3333` (`npx serve`). The options page's Vite dev server
proxies `/locales` to `VITE_PUBLIC_I18N_URL`, defaulting to `http://localhost:3333` — so
with this running, the options page at :4200 picks up local edits instead of the CDN.
Host is `0.0.0.0`, so another machine on the LAN can reach it too.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run message` | Translates `en/messages.json` into all 16 target languages. Walks the tree, translates `message` string values, and **skips `description` and `placeholders`** (metadata, not user-visible). |
| `npm run web` | Same for `web.json`. |
| `npm test` | Validates every locale against `en` — reports **missing keys** and **extra keys** per file, with the full key paths. This is the PR gate (`validate-locales.yml`). |
| `npm run clean` | Removes leftover/stale keys that no longer exist in the `en` source. |

Translation uses `@google-cloud/translate`, so the translate scripts need GCP credentials.
`npm test` does not.

## Rules

- **Only edit `en/`.** The other 16 are machine-generated; hand-edits are overwritten the
  next time a translate script runs.
- Adding a string: add it to `en/messages.json` or `en/web.json`, run the matching
  translate script, then `npm test` before committing.
- Removing a string: delete from `en/`, then `npm run clean` — don't hand-delete from 16
  files.
- Keep `messages.json` and `web.json` separate; a key only belongs in the one whose app
  uses it.

## CI

- **PR** — `validate-locales.yml` runs `npm test` (locale completeness).
- **Tag `v*`** — `deploy-cdn.yml` deploys to Firebase Hosting `channelId: live` and cuts a
  GitHub release. Nothing deploys on merge to main; a tag is required.
- The monorepo's `pull-request.yml` also checks this repo out and deploys it to a
  **preview channel** (`pr-<N>-i18n`, 15-day expiry) so PR builds test against matching
  locales.
