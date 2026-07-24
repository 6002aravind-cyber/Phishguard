import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phishTankLookup, loadPhishTankData } from './phishTank.js';

test('loads the sample dataset with expected entry count', async () => {
  const result = await loadPhishTankData();
  assert.equal(result.entryCount, 3);
});

test('exact URL match against known phish entry', async () => {
  await loadPhishTankData();
  const result = await phishTankLookup('https://yourcompany-hr-bonus.com/claim');

  assert.equal(result.isKnownPhish, true);
  assert.equal(result.matchType, 'exact_url');
  assert.equal(result.matchedEntryId, '8675309');
});

test('same-host match when path differs but host is known-bad', async () => {
  await loadPhishTankData();
  const result = await phishTankLookup('https://yourcompany-hr-bonus.com/some/other/path');

  assert.equal(result.isKnownPhish, true);
  assert.equal(result.matchType, 'same_host');
});

test('no match for a clean/unknown URL', async () => {
  await loadPhishTankData();
  const result = await phishTankLookup('https://en.wikipedia.org/wiki/Phishing');

  assert.equal(result.isKnownPhish, false);
  assert.equal(result.matchType, 'none');
});

test('case-insensitive exact match', async () => {
  await loadPhishTankData();
  const result = await phishTankLookup('HTTPS://YourCompany-HR-Bonus.com/Claim');

  assert.equal(result.isKnownPhish, true);
  assert.equal(result.matchType, 'exact_url');
});
