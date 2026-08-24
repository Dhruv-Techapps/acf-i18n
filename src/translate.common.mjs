import gct from '@google-cloud/translate';
import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES } from './translate.constant.mjs';
import { GLOSSARY } from './glossary.mjs';
const { Translate } = gct.v2;

// One cache file per translated file (web.json / messages.json), not one
// shared file for both. web and message run as separate scripts and used
// to merge their writes into a single cache file at the end - safe only if
// they never overlap in time. Separate files remove the race entirely:
// each script only ever reads and writes its own file, so there's nothing
// left to lose in a lost-update race even if both happen to run at once.
const cacheFilePath = (file) => `src/locales/.translation-source-cache.${file.replace(/\.json$/, '')}.json`;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Longest term first, so "Automation" doesn't shadow a longer phrase that
// happens to contain it (none currently do, but this keeps it safe if one
// is added later). Case-insensitive: source strings use both "Save" and
// mid-sentence "save".
const GLOSSARY_TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);

// The three literal/code values documented in glossary.mjs (a CSS selector
// value, HTML attribute names, a JS/API method name) have no grammatical
// role, so splicing them out of a sentence never leaves a "hole" Translate
// needs to fill with an invented word - unlike a real vocabulary word (see
// translateRaw below). Safe to force wherever they appear, not just
// standalone.
const LITERAL_TERM_NAMES = new Set(['body', 'style, class, hidden', 'getElementBy']);
const LITERAL_TERMS = GLOSSARY_TERMS.filter((t) => LITERAL_TERM_NAMES.has(t));
const LITERAL_PATTERN = new RegExp(`\\b(${LITERAL_TERMS.map(escapeRegExp).join('|')})\\b`, 'gi');

// Everything that must reach the target file byte-for-byte identical to the
// English source, protected as an opaque token before the string is sent to
// Translate: {{name}}/$N interpolation placeholders, <1>/<kbd>-style tags
// (numbered react-i18next tags and named HTML tags alike - both used to be
// handled differently, and named tags weren't protected at all), backtick
// code spans, URLs, and XPath-style element paths. The last was found
// getting "translated" into a dead selector for real -
// //input[@name="username"] became //input[@nimi="käyttäjänimi"] in
// Finnish. The negative lookbehind on the `//` branch keeps it from also
// matching the "//" inside a "https://" URL, which the URL branch already
// protects as one whole span.
const PROTECT_PATTERN = /\{\{[^}]+\}\}|\$\d+|<\/?[a-zA-Z0-9]+>|`[^`]+`|https?:\/\/\S+|(?<!:)\/\/[^\s,]+/g;

// Fault-tolerant restore pattern for every token PROTECT_PATTERN produces:
// z{1,2} at each zz-cluster tolerates Translate dropping one z (zzPHzz0zz ->
// zPHzz0zz, seen for real in Russian) in addition to the case-insensitive
// `i` flag covering recapitalization at the start of a sentence.
const PH_RESTORE = /z{1,2}PHz{1,2}(\d+)z{1,2}/gi;
// CJK/Thai scripts don't put spaces between words, but the English source
// does (e.g. "Stop Automation"), and that space can survive around a
// restored token even though everything on both sides is now CJK/Thai text
// (e.g. "停止 自動化" instead of "停止自動化"). Collapsing a space that sits
// directly between two such characters is safe for every language - Latin-
// script text never matches this pattern.
const CJK_SPACE_GAP = /(?<=[一-鿿぀-ヿ฀-๿])\s+(?=[一-鿿぀-ヿ฀-๿])/gu;
// One-time full audit: re-translate every key from the current en/ source,
// ignoring both the cache and whatever is already in the target file. Run
// with `--force` once to catch any drift that predates the cache existing.
const FORCE = process.argv.includes('--force');
// Bump this whenever a change to this file or glossary.mjs could change the
// correct output for strings that were already translated - the cache
// can't tell "en/ text is unchanged" apart from "the logic that translates
// it changed" on its own (see start() below, and the incident that added
// this: a glossary/tag rewrite here needed 3,174 cache entries invalidated
// by hand because nothing forced them stale automatically).
const PIPELINE_VERSION = 'glossary-standalone-only-tag-tokens-v2';

class TranslateCommon {
  file = '${file}';
  translate = null;
  // Records, per target language / key path, the en/ string that was last
  // translated - lets us tell "already translated" apart from "en/ changed
  // since the target was translated", which a plain targetValue truthiness
  // check can't distinguish. Keyed per language (not just per key path)
  // because each language's target file is independently stale or current -
  // sharing one entry across languages meant translating language A marked
  // the key as "current" for languages B-P too, so they kept whatever
  // (possibly stale) value they already had instead of re-translating.
  // Lives in its own file per this.file (see cacheFilePath) - not nested
  // under this.file in-memory, since that split already happens at the
  // filesystem level.
  cache = {};
  // Set true when this file's cache was just wiped for being from an older
  // PIPELINE_VERSION (see start() below). A wiped cache and a never-before-
  // tracked key look identical to translateStringValue (cachedSource is
  // undefined either way) - without this flag, wiping the cache actually
  // triggered the same "never tracked, trust what's already there" bootstrap
  // path the undefined check exists for, so a version bump silently reused
  // every existing translation instead of forcing any of them to retranslate.
  forceRetranslateAll = false;
  constructor(file) {
    // Creates a client
    const thisFilePath = fileURLToPath(import.meta.url);
    console.log('thisFilePath', thisFilePath);
    const thisDir = path.dirname(thisFilePath);
    console.log('thisDir', thisDir);
    const repoRoot = path.resolve(thisDir, '..');
    console.log('repoRoot', repoRoot);
    const keyPath = path.join(repoRoot, '../../Documents/serviceAccountKey.json');
    console.log('keyPath', keyPath);

    this.translate = new Translate({ keyFilename: keyPath });
    this.file = file;
  }
  // Subclasses implement translateObject() to translate nested objects/records.
  /**
   * Translates every string in `obj`, reusing anything already translated in `targetJson`.
   * Implemented by each subclass — this base only declares the contract.
   *
   * @param {Record<string, any>} obj
   * @param {string} targetLanguage
   * @param {Record<string, any>} targetJson
   * @returns {Promise<Record<string, any>>}
   */
  // eslint-disable-next-line no-unused-vars
  translateObject = async (obj, targetLanguage, targetJson) => {
    throw new Error('translateObject() must be implemented by a subclass');
  };

  translateStringValue = async (keyPath, value, targetValue, targetLanguage) => {
    const langCache = (this.cache[targetLanguage] ??= {});
    const cachedSource = langCache[keyPath];
    // Reuse the existing translation only if we've never tracked this key/language
    // before (first run after adding the cache - trust what's already there) or the
    // en/ text hasn't changed since it was translated. Otherwise the en/ edit
    // was never propagated, so translate it again. A cache wipe from a
    // PIPELINE_VERSION bump (see start()) looks exactly like "never tracked
    // before" here - forceRetranslateAll distinguishes the two.
    if (!FORCE && !this.forceRetranslateAll && targetValue && (cachedSource === undefined || cachedSource === value)) {
      langCache[keyPath] = value;
      return targetValue;
    }
    try {
      const translatedValue = await this.translateRaw(value, targetLanguage);
      console.log(`Translating "${value}" to "${translatedValue}"`);
      langCache[keyPath] = value;
      return translatedValue;
    } catch (error) {
      // translatePlaceholdersOnly throws when Translate drops a protected
      // token outright rather than just moving it - there's no safe place to
      // guess it back into (see there for why). That's a real, worth-fixing
      // problem for this one key/language, but it shouldn't take down a
      // multi-hour, 23-language run over a single string - keep whatever was
      // already in the target file and move on. Deliberately not writing
      // langCache[keyPath] here: leaving cachedSource unset means the next
      // run treats this key as still needing attention instead of quietly
      // trusting the fallback forever.
      console.error(`SKIPPED ${this.file} ${targetLanguage} ${keyPath}: ${error.message}`);
      return targetValue ?? value;
    }
  };

  // Translates one string, handling glossary terms (see glossary.mjs) on
  // top of the opaque-token protection in translatePlaceholdersOnly below:
  //
  // A term used as the string's ENTIRE (trimmed) content - a button label,
  // a section title - is always safe to force to its canonical translation:
  // there's no surrounding sentence for it to be cut out of.
  //
  // A literal/code term (LITERAL_TERM_NAMES above) is safe to force
  // wherever it appears, standalone or embedded, because it has no
  // grammatical role to lose.
  //
  // Any other glossary term embedded in a larger sentence or label is left
  // to Translate's own judgment instead of forced. Splicing it out and back
  // in (the original approach here) meant Translate never saw it as part of
  // the sentence at all, and it filled the resulting gap with an invented,
  // often-wrong word rather than leaving space for the term - found for
  // real: "We'll manually enable your plan..." came back with the Polish
  // translation of the surrounding text alone reading "we'll remove your
  // plan", with "Enable" spliced in afterward, disconnected from the
  // sentence it was cut out of. Reliably keeping a fixed term correct
  // inside a full sentence needs Google Cloud Translation's own (paid, v3
  // API) Glossary feature, which lets Translate choose the surrounding
  // grammar around a mandated term itself - a local splice-and-reassemble
  // can't do that safely, so for anything but a standalone match it isn't
  // attempted.
  translateRaw = async (value, targetLanguage) => {
    if (!value.trim()) return value;
    const trimmed = value.trim();

    const exactTerm = GLOSSARY_TERMS.find((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (exactTerm) {
      return GLOSSARY[exactTerm]?.[targetLanguage] ?? trimmed;
    }

    const literalMatches = [...value.matchAll(LITERAL_PATTERN)];
    if (literalMatches.length > 0) {
      const parts = [];
      let cursor = 0;
      for (const m of literalMatches) {
        const before = value.slice(cursor, m.index);
        if (before.trim()) parts.push({ text: before, literal: false });
        const canonical = LITERAL_TERMS.find((t) => t.toLowerCase() === m[0].toLowerCase());
        parts.push({ text: GLOSSARY[canonical]?.[targetLanguage] ?? m[0], literal: true });
        cursor = m.index + m[0].length;
      }
      const after = value.slice(cursor);
      if (after.trim()) parts.push({ text: after, literal: false });

      const translatedParts = await Promise.all(parts.map((p) => (p.literal ? p.text : this.translatePlaceholdersOnly(p.text, targetLanguage))));
      return translatedParts
        .map((t) => t.trim())
        .filter((t) => t !== '')
        .join(' ')
        .replace(CJK_SPACE_GAP, '');
    }

    return this.translatePlaceholdersOnly(value, targetLanguage);
  };

  // Swaps every PROTECT_PATTERN match (placeholders, tags, code spans, URLs,
  // XPath - see above) for an opaque token before sending to Google
  // Translate, then restores the exact original text afterward - Translate
  // shouldn't touch any of it. Wrapping {{name}} in another {{...}} (an
  // earlier approach) didn't work - the word inside (e.g. "status") is
  // still real English text, and Translate happily translates it right
  // through the braces (e.g. {{status}} -> {{мәртебесі}}). A token with no
  // recognizable words in it (zzPHzz0zz) has nothing for Translate to
  // "helpfully" render. Sending the whole sentence through in one call
  // (rather than splitting around what used to be a bare <1>...</1> tag)
  // also means Translate gets full grammatical context, fixing the broken
  // agreement/word-order that fragment-by-fragment translation produced.
  translatePlaceholdersOnly = async (value, targetLanguage) => {
    if (!value.trim()) return value;

    const placeholders = [];
    const escaped = value.replace(PROTECT_PATTERN, (match) => {
      placeholders.push(match);
      return `zzPHzz${placeholders.length - 1}zz`;
    });

    if (!/[a-zA-Z]/.test(escaped.replace(/z{1,2}PHz{1,2}\d+z{1,2}/gi, ''))) {
      return escaped.replace(PH_RESTORE, (_, i) => placeholders[Number(i)] ?? '');
    }

    const [translatedValue] = await this.translate.translate(escaped, { from: 'en', to: targetLanguage });

    const foundIndexes = new Set();
    // Fault-tolerant: Translate sometimes recapitalizes a token that lands at
    // the start of a sentence (zzPHzz0zz -> ZzPHzz0zz) or drops a character
    // from the zz/zz doubling instead of leaving it verbatim. z{1,2} in
    // PH_RESTORE tolerates either.
    let result = translatedValue.replace(PH_RESTORE, (_, i) => {
      foundIndexes.add(Number(i));
      return placeholders[Number(i)] ?? '';
    });
    // A dropped token can't be recovered by guessing where it belongs -
    // tacking it onto the front of the string (the original approach here)
    // kept the token *count* right but put it in a place disconnected from
    // its actual referent (e.g. a bare stranded "$2" at the very start of a
    // sentence about "$2 feature"), and for a tag token that also breaks
    // the resulting markup outright. Failing loudly means a dropped token
    // gets caught and fixed - in PROTECT_PATTERN, in the glossary, or by
    // hand - rather than silently shipped in the wrong place.
    const missing = placeholders.filter((_, i) => !foundIndexes.has(i));
    if (missing.length) {
      throw new Error(`Translate dropped ${missing.length} protected token(s) [${missing.join(', ')}] translating "${value}" to ${targetLanguage}. Got back: "${translatedValue}"`);
    }

    return result.replace(CJK_SPACE_GAP, '');
  };

  removeExtraProperties = (obj1, obj2) => {
    Object.keys(obj2).forEach((key) => {
      if (!Object.hasOwn(obj1, key)) {
        delete obj2[key];
      } else if (typeof obj2[key] === 'object' && typeof obj1[key] === 'object') {
        this.removeExtraProperties(obj1[key], obj2[key]);
      }
    });
  };

  start = async () => {
    this.cache = await fs.promises
      .readFile(cacheFilePath(this.file), 'utf8')
      .then(JSON.parse)
      .catch(() => ({}));

    // A cache entry only records which en/ string produced a translation -
    // it can't tell "en/ text is unchanged" apart from "the logic that
    // translates it changed since this was last generated". If this cache
    // was written by an older pipeline version, none of it can be trusted:
    // drop it and let every key retranslate under the current logic instead
    // of silently keeping output from a rewritten
    // translateRaw/translatePlaceholdersOnly.
    if (this.cache.__version !== PIPELINE_VERSION) {
      this.cache = { __version: PIPELINE_VERSION };
      this.forceRetranslateAll = true;
    }

    // Read the JSON file
    const filePath = `src/locales/en/${this.file}`;
    const englishJson = await fs.promises.readFile(filePath, 'utf8');

    for (const { lang, folder } of LANGUAGES) {
      console.error('------------- Processing :: ', folder, lang);
      const translatedFilePath = `src/locales/${folder}/${this.file}`;

      const targetJson = await fs.promises.readFile(translatedFilePath, 'utf8').catch(async () => {
        await fs.promises.mkdir(`src/locales/${folder}`, { recursive: true });
      });
      // Translate the JSON object and log the result
      const translatedJson = await this.translateObject(JSON.parse(englishJson), lang, JSON.parse(targetJson || '{}'));
      await fs.promises.writeFile(`src/locales/${folder}/${this.file}`, JSON.stringify(translatedJson, null, 2));
    }

    // web.json and messages.json each own a separate cache file (see
    // cacheFilePath above), so this write can never collide with the other
    // script's - nothing to merge, nothing to race.
    await fs.promises.writeFile(cacheFilePath(this.file), JSON.stringify(this.cache, null, 2) + '\n');
  };
}

export { TranslateCommon };
