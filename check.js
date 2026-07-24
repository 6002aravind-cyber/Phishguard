import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreDomainSimilarity } from './domainSimilarity.js';

const REAL_DOMAIN = 'yourcompany.com';

test('exact match on real company domain -> exact_match, score 100', () => {
  const result = scoreDomainSimilarity('https://yourcompany.com/login', REAL_DOMAIN);
  assert.equal(result.verdict, 'exact_match');
  assert.equal(result.score, 100);
});

test('legit subdomain of real company domain -> exact_match', () => {
  const result = scoreDomainSimilarity('https://login.yourcompany.com/sso', REAL_DOMAIN);
  assert.equal(result.verdict, 'exact_match');
});

test('prefix/suffix pattern abuse -> flagged suspicious_lookalike', () => {
  // From the project plan's own demo script
  const result = scoreDomainSimilarity('https://yourcompany-hr-bonus.com/claim', REAL_DOMAIN);
  assert.equal(result.verdict, 'suspicious_lookalike');
  assert.ok(result.patternFlags.includes('real_domain_embedded_in_label'));
});

test('subdomain trick pattern abuse -> flagged suspicious_lookalike', () => {
  const result = scoreDomainSimilarity('https://yourcompany.hr-bonus.com/claim', REAL_DOMAIN);
  assert.equal(result.verdict, 'suspicious_lookalike');
  assert.ok(result.patternFlags.includes('real_domain_used_as_subdomain'));
});

test('homoglyph substitution (0 for o) -> flagged suspicious_lookalike', () => {
  const result = scoreDomainSimilarity('https://yourc0mpany.com', REAL_DOMAIN);
  assert.equal(result.verdict, 'suspicious_lookalike');
  assert.ok(result.normalizedSimilarity > result.rawSimilarity - 1);
});

test('completely unrelated domain -> unrelated', () => {
  const result = scoreDomainSimilarity('https://en.wikipedia.org/wiki/Phishing', REAL_DOMAIN);
  assert.equal(result.verdict, 'unrelated');
});

test('rn/m homoglyph trick (yourcompany -> yourcornpany)', () => {
  const result = scoreDomainSimilarity('https://yourcornpany.com', REAL_DOMAIN);
  assert.equal(result.verdict, 'suspicious_lookalike');
});
