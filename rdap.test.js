/**
 * phishTank.js
 *
 * Local lookup against a downloaded PhishTank feed (JSON format).
 *
 * PhishTank publishes a free feed of verified phishing URLs at:
 *   https://data.phishtank.com/data/online-valid.json
 * (registration required for an API key to avoid stricter rate limits,
 * but the plain data dump download does not require one).
 *
 * This module does NOT fetch that feed itself — per the project plan,
 * PhishTank is meant to be a periodically-refreshed LOCAL database, not
 * a live API dependency. Download the feed yourself and point
 * PHISHTANK_DATA_PATH at it (see loadPhishTankData below).
 *
 * NOTE: this sandbox's network access is restricted to a fixed domain
 * allowlist that does not include data.phishtank.com, so the real feed
 * could not be downloaded here. A small sample dataset
 * (data/phishtank-sample.json, same schema as the real feed) is used by
 * default so the lookup logic can be built and tested now. Swap in the
 * real feed before demo day — see README section below.
 *
 * To get the real feed:
 *   1. Sign up free at https://www.phishtank.org/
 *   2. Download https://data.phishtank.com/data/online-valid.json
 *   3. Save it to, e.g., data/phishtank-feed.json
 *   4. Set PHISHTANK_DATA_PATH=data/phishtank-feed.json (or pass the path
 *      directly to loadPhishTankData)
 *   5. Re-run periodically (e.g. daily via cron) to keep it fresh.
 */

import { readFile } from 'node:fs/promises';
import { extractHostname } from './domainSimilarity.js';

const DEFAULT_DATA_PATH = new URL('../../data/phishtank-sample.json', import.meta.url);

// In-memory indexes built once at load time:
//  - exactUrlIndex: normalized full URL -> feed entry (catches exact-URL matches)
//  - hostnameIndex: hostname -> array of feed entries (catches "this host has
//    known phishing pages on it even if the exact path differs")
let exactUrlIndex = null;
let hostnameIndex = null;
let loadedFromPath = null;

// Normalizes a URL for exact-match comparison: lowercase, strip trailing
// slash. PhishTank URLs are stored as submitted, so this is intentionally
// light-touch to avoid false negatives from case differences.
function normalizeUrl(url) {
  return url.trim().toLowerCase().replace(/\/$/, '');
}

/**
 * Loads (or reloads) the PhishTank dataset from disk into memory indexes.
 * Call this once at server startup. Safe to call again later to refresh
 * after downloading an updated feed.
 *
 * @param {string|URL} [dataPath] - defaults to the bundled sample dataset
 */
async function loadPhishTankData(dataPath = DEFAULT_DATA_PATH) {
  const raw = await readFile(dataPath, 'utf-8');
  const entries = JSON.parse(raw);

  if (!Array.isArray(entries)) {
    throw new Error('PhishTank data file must be a JSON array of entries');
  }

  const newExactIndex = new Map();
  const newHostnameIndex = new Map();

  for (const entry of entries) {
    if (!entry?.url) continue;

    newExactIndex.set(normalizeUrl(entry.url), entry);

    const host = extractHostname(entry.url);
    if (!newHostnameIndex.has(host)) {
      newHostnameIndex.set(host, []);
    }
    newHostnameIndex.get(host).push(entry);
  }

  exactUrlIndex = newExactIndex;
  hostnameIndex = newHostnameIndex;
  loadedFromPath = dataPath.toString();

  return { entryCount: entries.length, source: loadedFromPath };
}

/**
 * @param {string} candidateUrl
 * @returns {{
 *   source: 'phishtank',
 *   implemented: true,
 *   url: string,
 *   isKnownPhish: boolean,
 *   matchType: 'exact_url'|'same_host'|'none',
 *   matchedEntryId: string|null,
 *   matchedEntryDetailUrl: string|null,
 *   datasetSource: string|null
 * }}
 */
async function phishTankLookup(candidateUrl) {
  // Lazy-load with the default (sample) dataset if nothing's been loaded
  // yet, so this works even if the server startup code forgets to call
  // loadPhishTankData explicitly.
  if (exactUrlIndex === null) {
    await loadPhishTankData();
  }

  const base = {
    source: 'phishtank',
    implemented: true,
    url: candidateUrl,
    isKnownPhish: false,
    matchType: 'none',
    matchedEntryId: null,
    matchedEntryDetailUrl: null,
    datasetSource: loadedFromPath,
  };

  const normalized = normalizeUrl(candidateUrl);
  const exactMatch = exactUrlIndex.get(normalized);
  if (exactMatch) {
    return {
      ...base,
      isKnownPhish: true,
      matchType: 'exact_url',
      matchedEntryId: exactMatch.phish_id ?? null,
      matchedEntryDetailUrl: exactMatch.phish_detail_url ?? null,
    };
  }

  let host;
  try {
    host = extractHostname(candidateUrl);
  } catch {
    return base;
  }

  const hostMatches = hostnameIndex.get(host);
  if (hostMatches?.length) {
    const [firstMatch] = hostMatches;
    return {
      ...base,
      isKnownPhish: true,
      matchType: 'same_host',
      matchedEntryId: firstMatch.phish_id ?? null,
      matchedEntryDetailUrl: firstMatch.phish_detail_url ?? null,
    };
  }

  return base;
}

export { phishTankLookup, loadPhishTankData };
