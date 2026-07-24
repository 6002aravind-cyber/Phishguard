import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateVerdict } from './verdict.js';

let originalFetch;
let originalApiKey;

before(() => {
  originalFetch = globalThis.fetch;
  originalApiKey = process.env.GEMINI_API_KEY;
});

after(() => {
  globalThis.fetch = originalFetch;
  process.env.GEMINI_API_KEY = originalApiKey;
});

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'AQ.test-key';
});

const SAMPLE_SIGNALS = {
  similarity: { verdict: 'suspicious_lookalike', score: 85, patternFlags: ['real_domain_embedded_in_label'] },
  rdap: { found: true, domainAgeDays: 2, registrar: 'Sketchy Registrar' },
  phishTank: { isKnownPhish: true, matchType: 'exact_url' },
  urlscan: { found: true, country: 'RU' },
  safeBrowsing: { isFlagged: false, threatTypes: [] },
};

test('returns error when GEMINI_API_KEY is missing', async () => {
  process.env.GEMINI_API_KEY = '';
  const result = await generateVerdict(SAMPLE_SIGNALS, 'evil.com', 'yourcompany.com');
  assert.match(result.error, /GEMINI_API_KEY/);
});

test('sends key via X-goog-api-key header, not query param', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(!url.includes('key='), 'API key should not be in the query string');
    assert.equal(options.headers['X-goog-api-key'], 'AQ.test-key');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"riskLevel":"high","verdict":"⚠️ test","reasoning":"test","confidence":90}' }] } }],
      }),
    };
  };

  const result = await generateVerdict(SAMPLE_SIGNALS, 'evil.com', 'yourcompany.com');
  assert.equal(result.riskLevel, 'high');
});

test('parses a well-formed JSON verdict response', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  riskLevel: 'high',
                  verdict: '⚠️ High risk — likely phishing',
                  reasoning: 'Domain registered 2 days ago and matches a known phishing entry.',
                  confidence: 95,
                }),
              },
            ],
          },
        },
      ],
    }),
  });

  const result = await generateVerdict(SAMPLE_SIGNALS, 'yourcompany-hr-bonus.com', 'yourcompany.com');

  assert.equal(result.riskLevel, 'high');
  assert.equal(result.confidence, 95);
  assert.match(result.verdict, /⚠️/);
});

test('strips markdown code fences if the model adds them anyway', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '```json\n{"riskLevel":"safe","verdict":"✅ Verified","reasoning":"Exact match.","confidence":99}\n```',
              },
            ],
          },
        },
      ],
    }),
  });

  const result = await generateVerdict(SAMPLE_SIGNALS, 'yourcompany.com', 'yourcompany.com');
  assert.equal(result.riskLevel, 'safe');
  assert.equal(result.confidence, 99);
});

test('malformed model output returns error instead of throwing', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: 'not valid json at all' }] } }],
    }),
  });

  const result = await generateVerdict(SAMPLE_SIGNALS, 'evil.com', 'yourcompany.com');
  assert.equal(result.verdict, null);
  assert.match(result.error, /Could not parse/);
});

test('non-ok HTTP response returns error without throwing', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    text: async () => 'Rate limit exceeded',
  });

  const result = await generateVerdict(SAMPLE_SIGNALS, 'evil.com', 'yourcompany.com');
  assert.match(result.error, /status 429/);
});
