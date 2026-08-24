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
  let failedCount = 0;

  for (const fileName of FILES) {
    const sourcePath = path.join(LOCALES_ROOT, SOURCE_LOCALE, fileName);
    const sourceJson = await readJson(sourcePath);

    for (const { folder } of LANGUAGES) {
      const targetPath = path.join(LOCALES_ROOT, folder, fileName);

      let targetJson;
      try {
        targetJson = await readJson(targetPath);
      } catch (error) {
        // A read failure here isn't "nothing to clean" - it's a locale file
        // that's missing or broken, which is worse. Reporting it the same
        // way as a clean pass ("no extra properties found") let this
        // command claim success while a locale file silently went missing.
        console.error(`Failed to read ${targetPath}: ${error instanceof Error ? error.message : String(error)}`);
        failedCount++;
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

  if (cleanedCount === 0 && failedCount === 0) {
    console.log('No extra properties found. All locale files are clean.');
  } else if (cleanedCount > 0) {
    console.log(`\nCleaned ${cleanedCount} file(s).`);
  }
  if (failedCount > 0) {
    console.error(`\n${failedCount} file(s) could not be read - fix these before trusting the result above.`);
    process.exitCode = 1;
  }
};

clean().catch((error) => {
  console.error('Clean failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
