import fs from 'node:fs/promises';
import path from 'node:path';
import { LANGUAGES } from './translate.constant.mjs';

const SOURCE_LOCALE = 'en';
const LOCALES_ROOT = path.join('src', 'locales');
const FILES = ['web.json', 'messages.json'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const removeExtraProps = (source, target) => {
  for (const key of Object.keys(target)) {
    if (!isObject(source) || !Object.hasOwn(source, key)) {
      delete target[key];
    } else if (isObject(source[key]) && isObject(target[key])) {
      removeExtraProps(source[key], target[key]);
    }
  }
};

const readJson = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
};

const clean = async () => {
  let cleanedCount = 0;

  for (const fileName of FILES) {
    const sourcePath = path.join(LOCALES_ROOT, SOURCE_LOCALE, fileName);
    const sourceJson = await readJson(sourcePath);

    for (const { folder } of LANGUAGES) {
      const targetPath = path.join(LOCALES_ROOT, folder, fileName);

      let targetJson;
      try {
        targetJson = await readJson(targetPath);
      } catch {
        console.warn(`Skipping ${targetPath}: not found or invalid JSON`);
        continue;
      }

      const before = JSON.stringify(targetJson);
      removeExtraProps(sourceJson, targetJson);
      const after = JSON.stringify(targetJson);

      if (before !== after) {
        await fs.writeFile(targetPath, JSON.stringify(targetJson, null, 2));
        console.log(`Cleaned extra keys from ${targetPath}`);
        cleanedCount++;
      }
    }
  }

  if (cleanedCount === 0) {
    console.log('No extra properties found. All locale files are clean.');
  } else {
    console.log(`\nCleaned ${cleanedCount} file(s).`);
  }
};

clean().catch((error) => {
  console.error('Clean failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
