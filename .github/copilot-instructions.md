# Auto Clicker AutoFill Internationalization (i18n)

This repository manages translations and internationalization for Auto Clicker AutoFill extension and web applications. It uses Google Cloud Translate API for automated translations across 16 languages.

## Working Effectively

- Bootstrap and run translations:
  - `npm install` -- installs Google Cloud Translate dependencies
  - `npm run web` -- translates web content (web.json files)
  - `npm run message` -- translates extension messages (messages.json files)
  - `npm start` -- serves locale files on port 3333 for testing

- Development workflow:
  - **IMPORTANT**: Requires `serviceAccountKey.json` in `~/Documents/` for Google Cloud Translate API
  - Edit source locale (English) in `src/locales/en/`
  - Run translation scripts to update all languages
  - Review generated translations for accuracy
  - Commit all locale files together

## Project Structure

```
/src
├── locales/              # Translation files by language
│   ├── en/              # Source language (English)
│   │   ├── messages.json # Extension messages
│   │   └── web.json     # Web application content
│   ├── ar/              # Arabic
│   ├── de/              # German
│   ├── es/              # Spanish
│   ├── fi/              # Finnish
│   ├── fr/              # French
│   ├── id/              # Indonesian
│   ├── it/              # Italian
│   ├── ja/              # Japanese
│   ├── ko/              # Korean
│   ├── nl/              # Dutch
│   ├── pt/              # Portuguese
│   ├── ru/              # Russian
│   ├── sv/              # Swedish
│   ├── vi/              # Vietnamese
│   ├── zh_CN/           # Chinese (Simplified)
│   └── zh_TW/           # Chinese (Traditional)
├── translate-web.mjs        # Script to translate web.json
├── translate-message.mjs    # Script to translate messages.json
├── translate.common.mjs     # Common translation utilities
└── translate.constant.mjs   # Language configuration
```

## Supported Languages

The project supports 16 languages (plus English source):
- **Asian**: Chinese (Simplified/Traditional), Japanese, Korean, Vietnamese, Indonesian
- **European**: German, Spanish, French, Italian, Dutch, Portuguese, Russian, Swedish, Finnish
- **Middle Eastern**: Arabic

## Translation Scripts

### translate-web.mjs
Translates web application content (web.json files) for the options page and documentation.

### translate-message.mjs
Translates Chrome extension messages (messages.json files) used in the extension UI.

### translate.common.mjs
Shared translation utilities:
- Google Cloud Translate API client initialization
- String value translation with placeholder preservation
- Object property synchronization
- Extra property cleanup

## Common Development Tasks

### Adding New Translation Keys
1. Add new keys to `src/locales/en/messages.json` or `src/locales/en/web.json`
2. Run appropriate translation script:
   - For extension messages: `npm run message`
   - For web content: `npm run web`
3. Review generated translations in all language folders
4. Manually adjust translations if automated output needs refinement
5. Commit all changed locale files

### Updating Existing Translations
1. Edit the English source in `src/locales/en/`
2. Delete the corresponding keys in other language files (or set to empty string)
3. Run the translation script to regenerate
4. Review and commit all changes

### Placeholder Handling
- Placeholders use `$1`, `$2` format
- Translation scripts automatically preserve placeholders
- Format: `{{$1}}` during translation, restored to `$1` after

## Google Cloud Translate API

- **Authentication**: Requires service account key at `~/Documents/serviceAccountKey.json`
- **API**: Uses Google Cloud Translate v2 API
- **Translation Direction**: Always from English (`en`) to target language
- **Costs**: Google Cloud Translate API usage is billable

## Content Types

### messages.json
Chrome extension messages following the i18n format:
```json
{
  "key_name": {
    "message": "Translated text",
    "description": "Context for translators"
  }
}
```

### web.json
Web application content in simple key-value format:
```json
{
  "key_name": "Translated text"
}
```

## Rules for Copilot

- **Always edit English source first** (`src/locales/en/`)
- Never manually edit translated files - use scripts
- Use ES modules (`import`/`export`), never `require()`
- Preserve placeholder format (`$1`, `$2`, etc.)
- Maintain JSON structure and formatting
- Keep descriptions in messages.json for translator context
- Test translations with `npm start` before committing

## Quality Checks

Before committing:
1. Ensure English source is correct and complete
2. Run both translation scripts (`npm run web` && `npm run message`)
3. Verify all locale folders have consistent keys
4. Check placeholder preservation in translations
5. Review critical UI strings manually
6. Test with `npm start` and verify JSON structure

## Relationship to Other Projects

This i18n project provides translations for:
- **Main extension**: `auto-clicker-auto-fill` (uses messages.json)
- **Options page**: Hosted at `stable.getautoclicker.com` (uses web.json)
- **Documentation**: `acf-docs` project (may reference web.json)

## Deployment

- Translations are consumed by other projects
- Messages.json → Chrome extension (_locales folder)
- Web.json → Options page and web applications
- Changes are deployed with the consuming applications

## Troubleshooting

**Service account error**: Ensure `serviceAccountKey.json` exists at `~/Documents/serviceAccountKey.json`

**Missing translations**: Run appropriate script (`npm run web` or `npm run message`)

**Placeholder corruption**: Check that `$1`, `$2` format is preserved in source

**Extra properties**: Translation scripts automatically remove keys not in English source
