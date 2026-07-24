import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rdapLookup } from './rdap.js';

// Sample RDAP response shape based on the RDAP JSON spec (RFC 9083).
// Real registries return additional fields; we only rely on `events` and
// `entities`, so this minimal fixture is enough to test our parsing.
const SAMPLE_RDAP_RESPONSE = {
  objectClassName: 'domain',
  ldhName: 'EXAMPLE-BONUS.COM',
  events: [
    { eventAction: 'registration', eventDate: '2024-01-15T00:00:00Z' },
    { eventAction: 'last changed', eventDate: '2024-06-01T00:00:00Z' },
    { eventAction: 'expiration', eventDate: '2027-01-15T00:00:00Z' },
  ],
  entities: [
    {
      roles: ['registrar'],
      vcardArray: ['vcard', [
        ['version', {}, 'text', '4.0'],
        ['fn', {}, 'text', 'Example Registrar Inc.'],
      ]],
    },
  ],
};

let originalFetch;

before(() => {
  originalFetch = globalThis.fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
});

test('parses registration date and registrar from a well-formed RDAP response', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => SAMPLE_RDAP_RESPONSE,
  });

  const result = await rdapLookup('example-bonus.com');

  assert.equal(result.found, true);
  assert.equal(result.registrar, 'Example Registrar Inc.');
  assert.equal(result.createdDate, '2024-01-15T00:00:00.000Z');
  assert.ok(result.domainAgeDays > 0);
});

test('returns found:false on a 404 (unregistered / no RDAP data)', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 404 });

  const result = await rdapLookup('doesnotexist-xyz123.com');

  assert.equal(result.found, false);
  assert.equal(result.domainAgeDays, null);
});

test('returns an error field on network failure without throwing', async () => {
  globalThis.fetch = async () => {
    throw new Error('network unreachable');
  };

  const result = await rdapLookup('example.com');

  assert.equal(result.found, false);
  assert.equal(result.error, 'network unreachable');
});
