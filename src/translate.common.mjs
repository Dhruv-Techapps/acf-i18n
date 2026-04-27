import gct from '@google-cloud/translate';
import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES } from './translate.constant.mjs';
const { Translate } = gct.v2;

class TranslateCommon {
  file = '${file}';
  translate = null;
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
  // Function to remove extra properties from obj2 that are not in obj1

  translateObject = async () => {
    return new Error();
  };

  translateStringValue = async (value, targetValue, targetLanguage) => {
    if (targetValue) {
      return targetValue;
    } else {
      value = value.replaceAll(/(\$\d+)/g, '{{$1}}');
      const [translatedValue] = await this.translate.translate(value, { from: 'en', to: targetLanguage });
      console.log(`Translating "${value}" to "${translatedValue}"`);
      return translatedValue.replaceAll(/{{(\$\d+)}}/g, '$1');
    }
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
    // Read the JSON file
    const filePath = `src/locales/en/${this.file}`;
    const englishJson = await fs.promises.readFile(filePath, 'utf8');

    for (const { lang, folder } of LANGUAGES) {
      console.error('------------- Processing :: ', folder, lang);
      const translatedFilePath = `src/locales/${folder}/${this.file}`;

      const targetJson = await fs.promises.readFile(translatedFilePath, 'utf8').catch(() => {
        fs.promises.mkdir(`src/locales/${folder}`, { recursive: true });
      });
      // Translate the JSON object and log the result
      const translatedJson = await this.translateObject(JSON.parse(englishJson), lang, JSON.parse(targetJson || '{}'));
      await fs.promises.writeFile(`src/locales/${folder}/${this.file}`, JSON.stringify(translatedJson, null, 2));
    }
  };
}

export { TranslateCommon };
