import { TranslateCommon } from './translate.common.mjs';

class TranslateMessage extends TranslateCommon {
  constructor() {
    super('messages.json');
  }

  // Function to recursively translate the values in an object
  translateObject = async (obj, targetLanguage, targetJson, keyPrefix = '') => {
    const translatedObject = {};

    for (const key in obj) {
      const value = obj[key];
      const targetValue = targetJson?.[key];
      const keyPath = keyPrefix ? `${keyPrefix}.${key}` : key;

      // Copy description and placeholders as-is from English - they are not user-facing
      if (key === 'description' || key === 'placeholders') {
        translatedObject[key] = value;
      } else if (typeof value === 'string' && key === 'message') {
        translatedObject[key] = await this.translateStringValue(keyPath, value, targetValue, targetLanguage);
      } else if (typeof value === 'object') {
        translatedObject[key] = await this.translateObject(value, targetLanguage, targetValue, keyPath);
      }
    }

    return translatedObject;
  };
}

new TranslateMessage().start();
