import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { TranslateCommon, htmlToTokens, pairTags, tokensToHtml } from './translate.common.mjs';

// A TranslateCommon whose Google client is replaced by `reply`, which receives exactly
// what would have been sent to Translate and returns what Translate would send back.
const translatorWith = (reply) => {
  const translator = new TranslateCommon('web.json');
  const calls = [];
  translator.translate = {
    translate: async (text, options) => {
      calls.push({ text, options });
      return [reply(text, options)];
    }
  };
  return { translator, calls };
};

describe('paired tags', () => {
  test('pairs tags by nesting and rejects anything unbalanced', () => {
    assert.deepEqual([...pairTags(['<1>', '</1>'])], [[0, 1]]);
    assert.deepEqual(
      [...pairTags(['<1>', '{{name}}', '<b>', '</b>', '</1>'])],
      [
        [2, 3],
        [0, 4]
      ]
    );
    assert.equal(pairTags(['{{name}}', '$1']), null);
    assert.equal(pairTags(['<1>']), null);
    assert.equal(pairTags(['</1>', '<1>']), null);
    assert.equal(pairTags(['<1>', '</2>']), null);
  });

  test('round-trips through HTML without touching other tokens', () => {
    const pairs = pairTags(['<1>', '</1>', '{{count}}']);
    const html = tokensToHtml('zzPHzz0zzA & BzzPHzz1zz has zzPHzz2zz items', pairs);
    assert.equal(html, '<a id="ph0">A &amp; B</a> has zzPHzz2zz items');
    assert.equal(htmlToTokens(html, pairs), 'zzPHzz0zzA & BzzPHzz1zz has zzPHzz2zz items');
  });

  test('sends a tagged string as HTML and restores the tags around the moved words', async () => {
    // Korean puts the linked words at the end, and Translate leaves a space before the period.
    const { translator, calls } = translatorWith(() => 'Discord에 접속하기 전에 계정에 <a id="ph0">로그인하세요</a> .');
    const result = await translator.translatePlaceholdersOnly('<1>Log in</1> to your account before connecting with Discord.', 'ko');

    assert.equal(calls[0].text, '<a id="ph0">Log in</a> to your account before connecting with Discord.');
    assert.equal(calls[0].options.format, 'html');
    assert.equal(result, 'Discord에 접속하기 전에 계정에 <1>로그인하세요</1>.');
  });

  test('decodes the HTML entities Translate returns in HTML mode', async () => {
    const { translator } = translatorWith(() => 'Une version de <a id="ph0">Auto Clicker &amp; Auto Fill</a> est disponible, n&#39;attendez pas');
    const result = await translator.translatePlaceholdersOnly('A version of <1>Auto Clicker & Auto Fill</1> is available', 'fr');
    assert.equal(result, "Une version de <1>Auto Clicker & Auto Fill</1> est disponible, n'attendez pas");
  });

  test('still fails loudly when Translate loses a tag', async () => {
    const { translator } = translatorWith(() => 'Connectez-vous à votre compte');
    await assert.rejects(translator.translatePlaceholdersOnly('<1>Log in</1> to your account', 'fr'), /dropped 2 protected token/);
  });

  test('strings without tag pairs keep using the plain-text path', async () => {
    const { translator, calls } = translatorWith((text) => text.replace('items', 'éléments'));
    const result = await translator.translatePlaceholdersOnly('{{count}} items', 'fr');
    assert.equal(calls[0].options.format, undefined);
    assert.equal(result, '{{count}} éléments');
  });
});
