import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['**/node_modules/**', 'src/locales/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
];
