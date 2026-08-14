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
  });
}
