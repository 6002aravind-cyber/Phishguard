import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { safeBrowsingLookup } from './safeBrowsing.js';

let originalFetch;
let originalApiKey;

before(() => {
  originalFetch = globalThis.fetch;
  originalApiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
});

after(() => {
  globalThis.fetch = originalFetch;
  process.env.GOOGLE_SAFE_BROWSING_API_KEY = originalApiKey;
});

beforeEach(() => {
  process.env.GOOGLE_SAFE_BROWSING_API_KEY = 'test-key-456';
});

test('returns error when API key is missing', async () => {
  process.env.GOOGLE_SAFE_BROWSING_API_KEY = '';
  const result = await safeBrowsingLookup('https://example.com');
  assert.equal(result.isFlagged, false);
  assert.match(result.error, /GOOGLE_SAFE_BROWSING_API_KEY/);
});

test('empty object response (no matches) -> isFlagged false', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(url.includes('key=test-key-456'));
    const body = JSON.parse(options.body);
    assert.equal(body.threatInfo.threatEntries[0].url, 'https://example.com');
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const result = await safeBrowsingLookup('https://example.com');
  assert.equal(result.isFlagged, false);
  assert.deepEqual(result.threatTypes, []);
});

test('matches response -> isFlagged true with threat types', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      matches: [
        { threatType: 'SOCIAL_ENGINEERING', platformType: 'ANY_PLATFORM', threat: { url: 'https://phish.example.com' } },
        { threatType: 'MALWARE', platformType: 'ANY_PLATFORM', threat: { url: 'https://phish.example.com' } },
      ],
    }),
  });

  const result = await safeBrowsingLookup('https://phish.example.com');
  assert.equal(result.isFlagged, true);
  assert.deepEqual(result.threatTypes.sort(), ['MALWARE', 'SOCIAL_ENGINEERING']);
});

test('non-ok response returns error without throwing', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => 'API key not valid',
  });

  const result = await safeBrowsingLookup('https://example.com');
  assert.equal(result.isFlagged, false);
  assert.match(result.error, /status 400/);
});
