import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { urlscanLookup } from './urlscan.js';

let originalFetch;
let originalApiKey;

before(() => {
  originalFetch = globalThis.fetch;
  originalApiKey = process.env.URLSCAN_API_KEY;
});

after(() => {
  globalThis.fetch = originalFetch;
  process.env.URLSCAN_API_KEY = originalApiKey;
});

beforeEach(() => {
  process.env.URLSCAN_API_KEY = 'test-key-123';
});

test('returns error when URLSCAN_API_KEY is missing', async () => {
  process.env.URLSCAN_API_KEY = '';
  const result = await urlscanLookup('https://example.com');
  assert.equal(result.found, false);
  assert.match(result.error, /URLSCAN_API_KEY/);
});

test('full submit -> poll -> result flow returns parsed signals', async () => {
  let callCount = 0;

  globalThis.fetch = async (url, options) => {
    callCount++;
    if (url === 'https://urlscan.io/api/v1/scan/') {
      assert.equal(options.headers['API-Key'], 'test-key-123');
      return {
        ok: true,
        status: 200,
        json: async () => ({ uuid: 'abc-123-uuid' }),
      };
    }
    if (url === 'https://urlscan.io/api/v1/result/abc-123-uuid/') {
      // First poll: still processing (404). Second poll: done.
      if (callCount === 2) {
        return { ok: false, status: 404 };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          page: { ip: '1.2.3.4', asn: 'AS12345', country: 'US', url: 'https://example.com/final' },
          task: { screenshotURL: 'https://urlscan.io/screenshots/abc-123-uuid.png' },
          data: { requests: [] },
        }),
      };
    }
    throw new Error(`Unexpected fetch call to ${url}`);
  };

  const result = await urlscanLookup('https://example.com');

  assert.equal(result.found, true);
  assert.equal(result.hostingIp, '1.2.3.4');
  assert.equal(result.asn, 'AS12345');
  assert.equal(result.country, 'US');
  assert.equal(result.screenshotUrl, 'https://urlscan.io/screenshots/abc-123-uuid.png');
});

test('submit failure returns error without throwing', async () => {
  globalThis.fetch = async (url) => {
    if (url === 'https://urlscan.io/api/v1/scan/') {
      return { ok: false, status: 400, text: async () => 'bad url' };
    }
    throw new Error('should not reach result endpoint');
  };

  const result = await urlscanLookup('not-a-real-url');

  assert.equal(result.found, false);
  assert.match(result.error, /status 400/);
});
