# Translation Audit Report

Date: 2026-08-23

## Executive Summary

The current locale set is structurally complete, but it is not ready to ship without corrections.

- Audited 23 target locales across `web.json` and `messages.json`.
- Audited 627 English source strings and 14,421 target strings in 46 target files.
- The repository test suite passed all 276 checks.
- All target files are valid JSON and have the same key structure as English.
- No missing keys, extra keys, empty values, value-type mismatches, interpolation-token mismatches, numeric-tag mismatches, control characters, or stale translation-cache entries were found.
- 13 confirmed translation-pipeline tokens are visible in shipped strings across Bulgarian, Finnish, Polish, and Russian.
- Multiple high-confidence semantic errors remain, including a Filipino `No` label translated as `Hindi`, Chinese backup messages that describe `$1` as a price, and Japanese/Italian form-status labels that refer to capacity being full.
- The tagged-string translation strategy produces malformed grammar in many locales because sentence fragments are translated separately and reassembled.
- The 30% untranslated threshold is too permissive to catch individual untranslated labels.

**Overall status: fail.** Structural integrity passes, but user-visible translation quality does not.

## Scope

Source files:

- `src/locales/en/web.json`: 545 user-facing strings
- `src/locales/en/messages.json`: 82 user-facing `message` strings

Target locales:

`ar`, `bg`, `de`, `es`, `fi`, `fil`, `fr`, `hi`, `id`, `it`, `ja`, `kk`, `ko`, `nl`, `pl`, `pt`, `ru`, `sv`, `sw`, `th`, `vi`, `zh_CN`, and `zh_TW`

The audit used the current working tree. It already contained uncommitted locale and translation-tooling changes before the audit. No locale file was modified by this audit.

## Method

1. Ran `npm test`, which executes `src/locales.test.mjs` across both locale files and all 23 targets.
2. Compared every target leaf with its English source for structure, type, emptiness, whitespace, control characters, placeholders, tags, and expected writing system.
3. Compared `.translation-source-cache.json` with every current English source value.
4. Checked exact glossary output for standalone glossary terms.
5. Searched for internal pipeline sentinels, including case-mutated and Cyrillic-transliterated forms not covered by the test suite.
6. Grouped English-identical values and repeated-source inconsistencies.
7. Reviewed high-confidence semantic collisions and context-sensitive translations.

No paid translation API was called. Semantic findings are limited to defects that can be identified with high confidence. A native-speaker review is still required before claiming linguistic correctness for all 14,421 target strings.

## Automated Validation

`npm test` result:

```text
tests 276
pass 276
fail 0
```

Additional static checks:

| Check                                           | Result |
| ----------------------------------------------- | -----: |
| Missing keys                                    |      0 |
| Extra keys                                      |      0 |
| Non-string or missing translated leaves         |      0 |
| Empty translated strings                        |      0 |
| Leading/trailing whitespace drift               |      0 |
| Control/replacement characters                  |      0 |
| `{{name}}` / `$1` token mismatches              |      0 |
| HTML/numeric tag mismatches                     |      0 |
| Expected-script anomalies                       |      0 |
| Stale cache entries                             |      0 |
| Missing cache entries                           |      0 |
| Orphaned cache entries                          |      0 |
| Standalone glossary mismatches                  |      0 |
| Repeated English text translated inconsistently |      0 |

These passes establish mechanical integrity only. They do not establish that a translation is natural or semantically correct.

## Critical Findings

### 1. Translation-pipeline tokens leaked into user-visible text

Thirteen shipped values contain mangled `zzGLzz<N>zz` glossary placeholders. These values are broken, not merely awkward.

| Locale | File/key                              | Current value                                                                                  |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bg`   | `web.json:step.disable`               | `ззГЛз0зз ззГЛз1зз`                                                                            |
| `bg`   | `web.json:step.enable`                | `ззГЛз0зз ззГЛз1зз`                                                                            |
| `fi`   | `web.json:notification.step`          | `ZzGLzz0zz-toiminnon valmistuttua`                                                             |
| `fi`   | `web.json:notification.loop`          | `ZzGLzz0zz-toiminnon valmistuttua`                                                             |
| `fi`   | `web.json:notification.automation`    | `ZzGLzz0zz-toiminnon valmistuttua`                                                             |
| `fi`   | `web.json:upgradePlan.pro.tagline`    | `ZzGLzz0zzin täysi teho – integraatioilla, tekoälyllä ja priorisoidulla tuella.`               |
| `pl`   | `web.json:home.quickStart.step3.desc` | `Zapisz swoją konfigurację i przeładuj stronę docelową. ZzGLzz1zz uruchomi się automatycznie.` |
| `ru`   | `web.json:stepSettings.title`         | `Настройки zGLzz0zz`                                                                           |
| `ru`   | `web.json:stepSettings.toast.header`  | `Настройки zGLzz0zz`                                                                           |
| `ru`   | `web.json:automation.batch`           | `Настройки zGLzz0zz`                                                                           |
| `ru`   | `web.json:automation.watch`           | `Настройки zGLzz0zz`                                                                           |
| `ru`   | `web.json:automationSettings.title`   | `Настройки zGLzz0zz`                                                                           |
| `ru`   | `web.json:loop.toast.header`          | `Настройки zGLzz0zz`                                                                           |

Root cause:

- `translate.common.mjs` emits `zzGLzz<N>zz` tokens.
- Google Translate changes their case or script in some languages.
- Restoration only matches exact lowercase ASCII `zzGLzz<N>zz`.
- `locales.test.mjs` checks `zzPHzz` and `__FORCE_RETRANSLATE__`, but not `zzGLzz` or transformed variants.
- The source cache now considers these results current, so a normal incremental translation run will retain them.

### 2. Tagged sentence translation is grammatically unsafe

`translateText()` translates the text before, inside, and after a single `<N>...</N>` tag as separate fragments, trims them, and joins them with spaces. This preserves tag counts but loses grammatical context and causes duplicated words, broken agreement, and unnatural word order.

The most widespread example is `web.json:googleSheets.useStable.message`. The current output is malformed or highly unnatural in nearly every target locale. Representative failures:

| Locale  | Defect excerpt                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------- |
| `zh_CN` | `请使用 <1>稳定版</1> Google Sheets 的 稳定版 版本功能...` duplicates “stable version” and breaks word order. |
| `fr`    | `utilisez le <1>Stable</1> Cette version...` joins incompatible fragments.                                    |
| `ko`    | `<1>안정 버전</1> ... 안정 버전 버전은...` duplicates “version.”                                              |
| `de`    | `die <1>Stabil</1> Version... Die Versionen Stabil...` uses an uninflected adjective.                         |
| `ru`    | `<1>Стабильный</1> Версия... Версии Стабильный...` has broken gender/case agreement.                          |
| `pl`    | `<1>Stabilna</1> Wersja... Wersje Stabilna...` has broken agreement.                                          |

The same failure mode affects tagged login instructions. Duplicated or malformed output was confirmed in `zh_CN`, `ar`, `it`, `nl`, `ru`, `hi`, `bg`, `pl`, `th`, and `kk` for one or more of:

- `discord.loginRequired`
- `backup.loginRequired`
- `googleSheets.loginRequired`
- `explore.loginToExplore`

Examples:

```text
zh_CN: 请 <1>登录</1> 在连接 Discord 之前，请先登录您的帐户。
ar:    لو سمحت <1>تسجيل الدخول</1> قم بتسجيل الدخول إلى حسابك قبل الاتصال بـ Google Drive.
ru:    Пожалуйста <1>Авторизоваться</1> Перед подключением к Google Sheets войдите в свою учетную запись.
th:    โปรด <1>เข้าสู่ระบบ</1> โปรดเข้าสู่ระบบบัญชีของคุณก่อนเชื่อมต่อกับ Discord
```

The source wording also uses the noun `Login` as a verb. Change it to `Log in` before regenerating translations.

### 3. Confirmed semantic mistranslations

| Severity | Locale  | File/key                                                   | Problem                                                                                        |
| -------- | ------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| High     | `fil`   | `web.json:common.no`                                       | Value is `Hindi`, not “No.”                                                                    |
| High     | `zh_CN` | `messages.json:@ACF_BACKUP__NOTIFICATION_BACKUP.message`   | Says the Google Drive backup costs `$1`; `$1` is a location/time placeholder.                  |
| High     | `zh_TW` | Same key                                                   | Same price-versus-location error.                                                              |
| High     | `ja`    | `messages.json:@SIDE_PANEL__ALREADY_FILLED_BUTTON.message` | `既に満席ですか？` asks whether capacity/seats are full.                                       |
| High     | `it`    | Same key                                                   | `Già al completo?` means fully booked/full capacity.                                           |
| High     | `it`    | `messages.json:@SIDE_PANEL__ASK_SIGN_IN_BUTTON.message`    | `Registrazione` means registration/recording, not sign in. It collides with the Recording tab. |
| Medium   | `ko`    | `web.json:error.min`                                       | Duplicates “value”: `값 값을`.                                                                 |
| Medium   | `kk`    | `web.json:error.min`                                       | Duplicates “value”: `Мән мәнін`.                                                               |
| Medium   | `kk`    | `web.json:error.max`                                       | Duplicates “value”: `Мән мәнін`.                                                               |
| Medium   | `hi`    | `web.json:versionAlert.message`                            | Extraneous `यह` breaks the tagged sentence.                                                    |
| Medium   | `bg`    | Same key                                                   | Incorrect gender agreement for `версия`.                                                       |
| Medium   | `sw`    | Same key                                                   | Incorrect noun-class agreement for `Toleo`.                                                    |
| Medium   | `kk`    | Same key                                                   | Malformed possessor/word order around the tagged product name.                                 |

Potentially ambiguous collisions such as “Upgrade”/“Refresh,” “Delete”/“Clear,” and “Duplicate”/“Repeat” were not automatically classified as defects. They need native review in UI context.

## English Source Problems

Machine translation cannot reliably correct ambiguous or ungrammatical English. Fix these source strings before regenerating target locales.

### `messages.json`

| Key                                          | Current problem                                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `EXT_DESCRIPTION.message`                    | Missing space after `anywhere.` and generally ungrammatical copy.                                               |
| `@ACF_BACKUP__NOTIFICATION_BACKUP.message`   | `Configurations are backup...` should use `backed up`; `at $1` is ambiguous and caused the Chinese price error. |
| `@ACF_BACKUP__ERROR_NO_CONFIG.message`       | `backup` should be the verb `back up`.                                                                          |
| `@SIDE_PANEL__ALREADY_FILLED_HINT.message`   | Missing article in `filled form`.                                                                               |
| `@SIDE_PANEL__ALREADY_FILLED_BUTTON.message` | Extra space before `?`; “Filled” lacks “form” context and caused capacity-related translations.                 |
| `@ADVANCE.message`                           | Likely intended to be `Advanced` in this UI context. Confirm with the consuming component.                      |
| `@RECHECK_OPTION.message`                    | CamelCase identifier is exposed as UI copy.                                                                     |

### `web.json`

- Four strings use `<1>Login</1>` as a verb. Use `<1>Log in</1>`.
- `googleSheets.useStable.message` repeats “Stable” and uses a long tagged sentence that the current fragment translator cannot safely process.
- `languages` advertises Catalan even though `ca` is not generated.
- `languages` omits generated locales `bg`, `pl`, `th`, `sw`, `fil`, and `kk`.

## English-Identical Values

The table counts exact English matches across all source strings, including valid product names, plan names, acronyms, code identifiers, and technical terms. A match is a review candidate, not automatically an error.

| Locale  | `web.json` | `messages.json` |
| ------- | ---------: | --------------: |
| `zh_CN` |    6 / 545 |          0 / 82 |
| `zh_TW` |    6 / 545 |          0 / 82 |
| `fr`    |   22 / 545 |          2 / 82 |
| `ko`    |    3 / 545 |          0 / 82 |
| `sv`    |   15 / 545 |          2 / 82 |
| `pt`    |   21 / 545 |          1 / 82 |
| `ja`    |    5 / 545 |          0 / 82 |
| `nl`    |   31 / 545 |          4 / 82 |
| `de`    |   37 / 545 |          6 / 82 |
| `es`    |   15 / 545 |          2 / 82 |
| `vi`    |    8 / 545 |          1 / 82 |
| `fi`    |   11 / 545 |          1 / 82 |
| `ar`    |    3 / 545 |          0 / 82 |
| `it`    |   24 / 545 |          5 / 82 |
| `ru`    |    6 / 545 |          1 / 82 |
| `id`    |   18 / 545 |          1 / 82 |
| `hi`    |    2 / 545 |          0 / 82 |
| `bg`    |    4 / 545 |          0 / 82 |
| `pl`    |   15 / 545 |          1 / 82 |
| `th`    |    4 / 545 |          0 / 82 |
| `sw`    |   11 / 545 |          0 / 82 |
| `fil`   |   21 / 545 |          2 / 82 |
| `kk`    |    6 / 545 |          1 / 82 |

Exact matches in all 23 locales:

- `automationSettings.bypass.prompt`: `Prompt`
- `monitor.debounce`: `Debounce`

These appear intentional. `Prompt` is explicitly fixed to English by the glossary, and `Debounce` is a technical term. Other common legitimate matches include `PayPal`, `URL`, `getElementBy`, `PLUS`, `PRO`, `DEV`, `LOCAL`, `Regex`, product names, and integration names.

The highest review burden is in German, Dutch, Italian, French, Portuguese, Filipino, and Indonesian. Many matches are valid cognates or technical labels, but the existing 30% threshold cannot distinguish those from an untranslated individual string.

## Locale-by-Locale Status

| Locale  | Status       | Main findings                                                                                             |
| ------- | ------------ | --------------------------------------------------------------------------------------------------------- |
| `ar`    | Needs review | Tagged login instructions duplicate or break the sentence.                                                |
| `bg`    | Fail         | Two leaked glossary tokens; malformed tagged login/version copy.                                          |
| `de`    | Needs review | Highest English-identical count; tagged Stable/login copy is awkward.                                     |
| `es`    | Needs review | Tagged Stable copy is malformed; 15 English-identical values.                                             |
| `fi`    | Fail         | Four leaked glossary tokens; tagged Stable copy is malformed.                                             |
| `fil`   | Fail         | `common.no` is `Hindi`; 23 English-identical values across both files.                                    |
| `fr`    | Needs review | Tagged Stable copy is malformed; 24 English-identical values across both files.                           |
| `hi`    | Fail         | Malformed tagged login and version-alert sentences.                                                       |
| `id`    | Needs review | Tagged Stable copy is awkward; review Connect/Connected collisions.                                       |
| `it`    | Fail         | Sign-in button means registration; Already Filled means full capacity; tagged login copy is malformed.    |
| `ja`    | Fail         | Already Filled means full capacity; tagged Stable copy is malformed.                                      |
| `kk`    | Fail         | Duplicated value labels; malformed tagged login/version copy.                                             |
| `ko`    | Fail         | Duplicated value label; tagged Stable copy is malformed.                                                  |
| `nl`    | Needs review | Tagged login/Stable copy is malformed; 35 English-identical values across both files.                     |
| `pl`    | Fail         | One leaked glossary token; malformed tagged login/Stable copy.                                            |
| `pt`    | Needs review | Tagged Stable copy is malformed; review Upgrade/Refresh collision.                                        |
| `ru`    | Fail         | Six leaked glossary tokens; malformed tagged login/Stable copy.                                           |
| `sv`    | Needs review | No hard integrity failure found; 17 English-identical values across both files require contextual review. |
| `sw`    | Fail         | Version-alert noun agreement is wrong; several context collisions need native review.                     |
| `th`    | Needs review | Tagged login copy is malformed; Duplicate/Repeat share one translation and need contextual review.        |
| `vi`    | Needs review | Tagged Stable copy is malformed; otherwise mechanically clean.                                            |
| `zh_CN` | Fail         | Backup placeholder means price; duplicated tagged login and Stable copy.                                  |
| `zh_TW` | Fail         | Backup placeholder means price; malformed tagged Stable copy.                                             |

“Needs review” does not mean approved. It means the static audit found no additional high-confidence hard failure beyond the cross-locale tagged-string issue.

## Validation Gaps

1. `LEAK_PATTERNS` is case-sensitive and omits `zzGLzz`. It also cannot recognize transliterated forms such as Bulgarian `ззГЛз0зз`.
2. Tag checks compare only tag numbers and counts. They cannot detect duplicated text or broken grammar after fragment recombination.
3. Placeholder checks compare only token presence. They cannot detect incorrect semantics around a preserved token, such as `$1` becoming a price.
4. Glossary replacements use fixed standalone forms inside sentences, without inflection, agreement, or language-specific word order.
5. Translation quality fails only when at least 30% of a file is identical to English. Individual untranslated labels always pass.
6. The source cache records source freshness, not output validity. Broken translated values are now cached as current.
7. No validation compares `LANGUAGES` with the `web.json:languages` menu.
8. No source-copy lint catches ambiguous grammar before it reaches all target locales.
9. Project documentation still says “16 target languages” in several places, while `LANGUAGES` currently contains 23.

## Recommended Remediation

### Priority 0: Prevent further corruption

1. Replace the glossary-token scheme with placeholders the API cannot mutate, or translate whole strings with HTML/placeholders preserved by a structured API mode.
2. Make sentinel validation case-insensitive and cover `zzGLzz`, `zzPHzz`, and script-mutated variants.
3. Add a post-translation assertion that every inserted sentinel was restored exactly once before writing a locale file.
4. Stop translating tagged sentence fragments independently.

### Priority 1: Fix source text

1. Correct the English defects listed above.
2. Clarify placeholder meaning, for example: `Configurations were backed up to Google Drive at: $1`.
3. Replace `Already Filled ?` with explicit form language such as `Form already filled?`.
4. Simplify tagged sentences so the linked/tagged text is a complete grammatical unit, or keep tags out of translation input and reinsert them using offsets from whole-sentence translation.
5. Reconcile the language menu with `LANGUAGES`.

### Priority 2: Regenerate and verify

1. Fix the translation pipeline before regenerating; otherwise a force run can reproduce the same corruption.
2. Invalidate affected cache entries or run a controlled force translation after the pipeline fix.
3. Run `npm test` and the additional token/cache checks.
4. Perform native-speaker review, prioritizing all Fail locales and high-traffic locales.
5. Review screenshots in the actual extension/options UI for clipping, directionality, and context.

### Priority 3: Strengthen CI

1. Fail on any unexplained English-identical string rather than using a locale-wide ratio. Maintain an allowlist for brands and technical terms.
2. Add tests for the exact high-risk keys in this report.
3. Add `LANGUAGES`/language-menu parity validation.
4. Add source-copy checks for spacing, `login`/`log in`, exposed identifiers, and ambiguous placeholders.
5. Add a report mode that emits per-locale changed keys for human review on every translation update.

## Release Decision

Do not deploy the current locale set. At minimum, fix the pipeline-token leaks and confirmed high-severity semantic errors, then regenerate affected translations with the corrected pipeline. Native review should follow before calling the locale set fully audited or production-ready.
