import fs from 'node:fs/promises';
import path from 'node:path';
import { LANGUAGES } from './translate.constant.mjs';

const SOURCE_LOCALE = 'en';
const LOCALES_ROOT = path.join('src', 'locales');
const FILES_TO_VALIDATE = ['web.json', 'messages.json'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const findMissingPaths = (source, target, prefix = '') => {
  const missing = [];

  if (!isObject(source)) {
    return missing;
  }

  if (!isObject(target)) {
    for (const key of Object.keys(source)) {
      const nextPath = prefix ? `${prefix}.${key}` : key;
      missing.push(nextPath);
    }
    return missing;
  }

  for (const [key, sourceValue] of Object.entries(source)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;

    if (!Object.hasOwn(target, key)) {
      missing.push(nextPath);
      continue;
    }

    const targetValue = target[key];

    if (isObject(sourceValue)) {
      if (!isObject(targetValue)) {
        missing.push(nextPath);
        continue;
      }

      missing.push(...findMissingPaths(sourceValue, targetValue, nextPath));
    }
  }

  return missing;
};

const readJson = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
};

const validate = async () => {
  const allFailures = [];

  for (const fileName of FILES_TO_VALIDATE) {
    const sourcePath = path.join(LOCALES_ROOT, SOURCE_LOCALE, fileName);

    let sourceJson;
    try {
      sourceJson = await readJson(sourcePath);
    } catch {
      allFailures.push(`${sourcePath}: source file is missing or invalid JSON`);
      continue;
    }

    if (!isObject(sourceJson)) {
      allFailures.push(`${sourcePath}: source JSON must be an object`);
      continue;
    }

    for (const { folder } of LANGUAGES) {
      const targetPath = path.join(LOCALES_ROOT, folder, fileName);

      let targetJson;
      try {
        targetJson = await readJson(targetPath);
      } catch {
        allFailures.push(`${targetPath}: file is missing or invalid JSON`);
        continue;
      }

      const missingPaths = findMissingPaths(sourceJson, targetJson);
      if (missingPaths.length > 0) {
        allFailures.push(`${targetPath}: missing ${missingPaths.length} key(s)`);
        for (const keyPath of missingPaths) {
          allFailures.push(`  - ${keyPath}`);
        }
      }
    }
  }

  if (allFailures.length > 0) {
    console.error('Locale validation failed. Missing keys found:');
    for (const line of allFailures) {
      console.error(line);
    }
    process.exit(1);
  }

  console.log('Locale validation passed. All locale files include English keys.');
};

validate().catch((error) => {
  console.error('Locale validation failed due to an unexpected error.');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});