# acf-i18n

Single source of truth for every user-facing string in **Auto Clicker AutoFill** — both the extension and the options page read their labels from here. Nothing else owns translations.

> The `apps/acf-i18n` directory inside the `auto-clicker-auto-fill` monorepo is a **stale duplicate**. This repo is the live one. Changes made there do not ship.

## Layout

```
src/locales/<folder>/messages.json   → consumed by the extension
src/locales/<folder>/web.json        → consumed by the options page
```

`<folder>` is the locale code: `en` (source) plus `ar bg de es fi fil fr hi id it ja ko nl pl pt_PT ru sv sw th vi zh_CN zh_TW` — 22 targets, 23 total. Folder names must match a locale code Chrome's extension i18n actually recognizes ([supported locales](https://developer.chrome.com/docs/extensions/reference/api/i18n)) — this is why Portuguese is `pt_PT` rather than a bare `pt`, and why Kazakh isn't in the list (`kk` isn't a Chrome-recognized locale, so `messages.json` under it would never load in the extension). The list lives in `src/translate.constant.mjs`, which maps the Google Translate language code to the folder name (e.g. `zh-cn` → `zh_CN`).

`messages.json` is Chrome extension i18n format (`{ "key": { "message": "...", "description": "..." } }`); `web.json` is a plain nested object.

## The two delivery paths are completely different

This is the thing to get right — the same edit reaches the two apps by different routes.

|                 | Extension                                                                                    | Options page                                    |
| --------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| File            | `messages.json`                                                                              | `web.json`                                      |
| When            | **Build time**                                                                               | **Runtime**                                     |
| How             | `apps/acf-extension/webpack.config.js` copies `**/messages.json` into `dist/_locales`        | `fetch` from `VITE_PUBLIC_I18N`                 |
| Source          | `VITE_PUBLIC_I18N_PATH`, defaulting to `../acf-i18n` (this checkout, as a sibling directory) | `https://cdn.getautoclicker.com/locales`        |
| To see a change | Rebuild the extension                                                                        | Redeploy this repo (or point at a local server) |

Consequence: **a string fix for the options page needs this repo deployed**, not an options-page release. A string fix for the extension needs an extension rebuild and a store release — the CDN does nothing for it.

All deployed environments (dev, beta, stable) read `web.json` from the CDN.

## Hosting

`firebase.json` serves `src/` directly on Firebase Hosting — project `auto-clicker-autofill`, site/target `auto-clicker-auto-fill-static`, fronted by **cdn.getautoclicker.com**. JSON responses get `Access-Control-Allow-Origin: *` and `GET, OPTIONS`, which is what lets the options page fetch them cross-origin.

Because the public root is `src/`, the `.mjs` scripts sit next to the data; the `ignore` list keeps them out of the deploy.

## Local development

```bash
npm start
```

Serves `src/` at `http://0.0.0.0:3333` (`npx serve`). The options page's Vite dev server proxies `/locales` to `VITE_PUBLIC_I18N_URL`, defaulting to `http://localhost:3333` — so with this running, the options page at :4200 picks up local edits instead of the CDN. Host is `0.0.0.0`, so another machine on the LAN can reach it too.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run message` | Translates `en/messages.json` into all 22 target languages. Walks the tree, translates `message` string values, and **skips `description` and `placeholders`** (metadata, not user-visible). Only translates keys that are new or whose `en/` text changed since the last run — see caching note below. |
| `npm run web` | Same for `web.json`. |
| `npm run message:force` / `npm run web:force` | Same, but ignores the cache and re-translates every key from scratch regardless of whether `en/` changed. Use this once for a full audit (e.g. after adding the cache, or if you suspect drift), then let the plain `message`/`web` scripts take over incrementally — a full force run re-translates ~600 strings × 22 languages, so it costs real Google Translate API usage. |
| `npm test` | Validates every locale against `en` — **missing keys**, **extra keys**, strings identical to `en` (untranslated), **`{{name}}`/`$1` placeholder integrity**, **`<1>...</1>` tag integrity**, and no leaked internal pipeline tokens (`zzPHzz`/`__FORCE_RETRANSLATE__`) — all per file, with full key paths. Runs in CI (`.github/workflows/test.yml`) on every push and PR. |
| `npm run clean` | Removes leftover/stale keys that no longer exist in the `en` source. |

Translation uses `@google-cloud/translate`, so the translate scripts need GCP credentials. `npm test` does not.

`npm run message`/`npm run web` track which `en/` string produced each existing translation in `src/locales/.translation-source-cache.web.json` and `src/locales/.translation-source-cache.messages.json` (one cache per translated file, so the two scripts never race on a shared file) — committed to the repo, but excluded from the Firebase Hosting deploy by the existing `**/.*` rule in `firebase.json` (it's tooling metadata, not a locale file). This is what lets them skip re-translating keys that haven't changed instead of blindly reusing anything already present in the target file — the latter used to mean an edit to an existing `en/` string silently never reached the other 22 locales.

## Rules

- **Only edit `en/`.** The other 22 are machine-generated; hand-edits are overwritten the next time a translate script runs.
- Adding a string: add it to `en/messages.json` or `en/web.json`, run the matching translate script, then `npm test` before committing.
- Removing a string: delete from `en/`, then `npm run clean` — don't hand-delete from 22 files.
- Keep `messages.json` and `web.json` separate; a key only belongs in the one whose app uses it.

## CI

- **Every push and PR** — `.github/workflows/test.yml` runs lint, format check, typecheck, and `npm test` (locale completeness + placeholder/tag integrity).
- **Tag `v*`** — `deploy-cdn.yml` deploys to Firebase Hosting `channelId: live` and cuts a GitHub release. Nothing deploys on merge to main; a tag is required.
- The monorepo's `pull-request.yml` also checks this repo out and deploys it to a **preview channel** (`pr-<N>-i18n`, 15-day expiry) so PR builds test against matching locales.
