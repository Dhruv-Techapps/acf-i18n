import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LANGUAGES } from './translate.constant.mjs';

const SOURCE_LOCALE = 'en';
const LOCALES_ROOT = path.join('src', 'locales');
const FILES = ['web.json', 'messages.json'];

// Strings shorter than this or matching known patterns won't flag as untranslated
const TRANSLATION_THRESHOLD = 0.3; // fail if >30% of translatable strings are identical to EN

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const readJson = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
};

const findMissingPaths = (source, target, prefix = '') => {
  const missing = [];
  if (!isObject(source)) return missing;
  if (!isObject(target)) {
    return Object.keys(source).map((k) => (prefix ? `${prefix}.${k}` : k));
  }
  for (const [key, sourceValue] of Object.entries(source)) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (!Object.hasOwn(target, key)) {
      missing.push(p);
      continue;
    }
    if (isObject(sourceValue)) {
      missing.push(...findMissingPaths(sourceValue, target[key], p));
    }
  }
  return missing;
};

const findExtraPaths = (source, target, prefix = '') => {
  const extra = [];
  if (!isObject(target)) return extra;
  for (const key of Object.keys(target)) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (!isObject(source) || !Object.hasOwn(source, key)) {
      extra.push(p);
    } else if (isObject(target[key])) {
      extra.push(...findExtraPaths(source[key], target[key], p));
    }
  }
  return extra;
};

// Collect { path, value } for all leaf strings in an object.
// For messages.json pass messageOnly=true to only collect 'message' fields.
const collectLeafStrings = (obj, prefix = '', messageOnly = false) => {
  const result = [];
  for (const [key, value] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      if (!messageOnly || key === 'message') {
        result.push({ path: p, value });
      }
    } else if (isObject(value)) {
      result.push(...collectLeafStrings(value, p, messageOnly));
    }
  }
  return result;
};

// Returns true for strings that are legitimately the same across languages.
const isNaturallySame = (value) => {
  if (value.length <= 3) return true;
  if (/^\d[\d.]*$/.test(value)) return true;
  if (/^https?:\/\//.test(value)) return true;
  if (value.includes('$')) return true; // placeholder like $1
};

const getNestedValue = (obj, dotPath) => {
  let cur = obj;
  for (const part of dotPath.split('.')) {
    if (!isObject(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
};

// {{name}}-style interpolation vars and $1-style Chrome-i18n placeholders.
// Order-sensitive (sorted) so a dropped or duplicated token still fails.
const collectInterpolationTokens = (value) => [...(value.match(/\{\{[^}]+\}\}/g) || []), ...(value.match(/\$\d+/g) || [])].sort();

// <1>...</1>-style react-i18next tags and named HTML tags (<kbd>, <b>...)
// alike: which tags open and which close.
const collectTagNumbers = (value) => ({
  opens: (value.match(/<([a-zA-Z0-9]+)>/g) || []).map((m) => m.slice(1, -1)).sort(),
  closes: (value.match(/<\/([a-zA-Z0-9]+)>/g) || []).map((m) => m.slice(2, -1)).sort()
});

// Comparing sorted open/close multisets (collectTagNumbers above) only
// proves the right tags exist somewhere in the string - it can't catch an
// orphaned open, a close with no matching open, or a close that shows up
// before its own open. Walk the string in document order with a stack to
// check the tags actually form valid, properly-nested markup. Word order is
// expected to differ from English (that's a legitimate translation), so
// this doesn't compare against the English tag sequence - only that the
// target string's own tags are well-formed.
const findUnbalancedTag = (value) => {
  const stack = [];
  for (const m of value.matchAll(/<(\/?)([a-zA-Z0-9]+)>/g)) {
    const [, closing, name] = m;
    if (!closing) {
      stack.push(name);
    } else if (stack.pop() !== name) {
      return `unbalanced at "${m[0]}"`;
    }
  }
  return stack.length > 0 ? `unclosed: [${stack.join(', ')}]` : null;
};

// Sentinels/tokens the translate scripts use internally - none should ever
// end up in a shipped locale file if the pipeline is working correctly.
// Fault-tolerant (case-insensitive, z{1,2} per cluster): Translate sometimes
// recapitalizes a token that lands at the start of a sentence, or drops a
// character from the zz doubling (zzGLzz0zz -> zGLzz0zz, seen for real in
// Russian) instead of leaving it verbatim.
const LEAK_PATTERNS = [/z{1,2}PHz{1,2}\d+z{1,2}/i, /z{1,2}GLz{1,2}\d+z{1,2}/i, /__FORCE_RETRANSLATE__/];

// Cache source files to avoid re-reading per test
const sourceCache = new Map();
const getSource = async (fileName) => {
  if (!sourceCache.has(fileName)) {
    sourceCache.set(fileName, await readJson(path.join(LOCALES_ROOT, SOURCE_LOCALE, fileName)));
  }
  return sourceCache.get(fileName);
};

for (const fileName of FILES) {
  const messageOnly = fileName === 'messages.json';

  describe(`${fileName}`, () => {
    describe('missing keys', () => {
      for (const { folder } of LANGUAGES) {
        test(folder, async () => {
          const source = await getSource(fileName);
          const target = await readJson(path.join(LOCALES_ROOT, folder, fileName));
          const missing = findMissingPaths(source, target);
          assert.deepEqual(missing, [], `Missing ${missing.length} key(s) in ${folder}/${fileName}:\n${missing.map((k) => `  - ${k}`).join('\n')}`);
        });
      }
    });

    describe('extra keys', () => {
      for (const { folder } of LANGUAGES) {
        test(folder, async () => {
          const source = await getSource(fileName);
          const target = await readJson(path.join(LOCALES_ROOT, folder, fileName));
          const extra = findExtraPaths(source, target);
          assert.deepEqual(extra, [], `Extra ${extra.length} key(s) in ${folder}/${fileName}:\n${extra.map((k) => `  - ${k}`).join('\n')}`);
        });
      }
    });

    describe('translation quality', () => {
      for (const { folder } of LANGUAGES) {
        test(folder, async () => {
          const source = await getSource(fileName);
          const target = await readJson(path.join(LOCALES_ROOT, folder, fileName));

          const sourceLeaves = collectLeafStrings(source, '', messageOnly);
          const translatable = sourceLeaves.filter(({ value }) => !isNaturallySame(value));

          if (translatable.length === 0) return; // nothing to check

          const identical = translatable.filter(({ path: p, value: enValue }) => {
            const targetValue = getNestedValue(target, p);
            return typeof targetValue === 'string' && targetValue === enValue;
          });

          if (identical.length > 0) {
            const preview = identical.slice(0, 10);
            const rest = identical.length - preview.length;
            console.log(`  [${folder}/${fileName}] ${identical.length}/${translatable.length} strings appear untranslated:`);
            for (const { path: p, value } of preview) {
              console.log(`    - ${p}: "${value}"`);
            }
            if (rest > 0) console.log(`    ... and ${rest} more`);
          }

          const ratio = identical.length / translatable.length;
          assert.ok(
            ratio < TRANSLATION_THRESHOLD,
            `${folder}/${fileName}: ${identical.length}/${translatable.length} (${Math.round(ratio * 100)}%) strings are identical to English — exceeds ${TRANSLATION_THRESHOLD * 100}% threshold`
          );
        });
      }
    });

    describe('placeholder integrity', () => {
      for (const { folder } of LANGUAGES) {
        test(folder, async () => {
          const source = await getSource(fileName);
          const target = await readJson(path.join(LOCALES_ROOT, folder, fileName));
          const sourceLeaves = collectLeafStrings(source, '', messageOnly);

          const mismatches = [];
          for (const { path: p, value: enValue } of sourceLeaves) {
            const enTokens = collectInterpolationTokens(enValue);
            if (enTokens.length === 0) continue;
            const targetValue = getNestedValue(target, p);
            const targetTokens = typeof targetValue === 'string' ? collectInterpolationTokens(targetValue) : [];
            if (JSON.stringify(enTokens) !== JSON.stringify(targetTokens)) {
              mismatches.push(`${p}: expected [${enTokens.join(', ')}] got [${targetTokens.join(', ')}]`);
            }
          }

          assert.deepEqual(mismatches, [], `Placeholder mismatch in ${folder}/${fileName}:\n${mismatches.map((m) => `  - ${m}`).join('\n')}`);
        });
      }
    });

    describe('tag integrity', () => {
      for (const { folder } of LANGUAGES) {
        test(folder, async () => {
          const source = await getSource(fileName);
          const target = await readJson(path.join(LOCALES_ROOT, folder, fileName));
          const sourceLeaves = collectLeafStrings(source, '', messageOnly);

          const mismatches = [];
          for (const { path: p, value: enValue } of sourceLeaves) {
            if (!/<\/?[a-zA-Z0-9]+>/.test(enValue)) continue;
            const enTags = collectTagNumbers(enValue);
            const targetValue = getNestedValue(target, p);
            const targetTags = typeof targetValue === 'string' ? collectTagNumbers(targetValue) : { opens: [], closes: [] };
            if (JSON.stringify(enTags) !== JSON.stringify(targetTags)) {
              mismatches.push(`${p}: expected ${JSON.stringify(enTags)} got ${JSON.stringify(targetTags)}`);
              continue;
            }
            const unbalanced = typeof targetValue === 'string' ? findUnbalancedTag(targetValue) : null;
            if (unbalanced) {
              mismatches.push(`${p}: ${unbalanced} in "${targetValue}"`);
            }
          }

          assert.deepEqual(mismatches, [], `Tag mismatch in ${folder}/${fileName}:\n${mismatches.map((m) => `  - ${m}`).join('\n')}`);
        });
      }
    });

    describe('no leaked pipeline tokens', () => {
      for (const { folder } of LANGUAGES) {
        test(folder, async () => {
          const target = await readJson(path.join(LOCALES_ROOT, folder, fileName));
          const leaves = collectLeafStrings(target, '', messageOnly);
          const leaked = leaves.filter(({ value }) => LEAK_PATTERNS.some((re) => re.test(value)));
          assert.deepEqual(leaked, [], `Leaked pipeline token in ${folder}/${fileName}:\n${leaked.map((l) => `  - ${l.path}: "${l.value}"`).join('\n')}`);
        });
      }
    });
  });
}
