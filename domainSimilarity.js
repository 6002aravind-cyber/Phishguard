/**
 * safeBrowsing.js
 *
 * Real Google Safe Browsing API (v4) integration — checks a URL against
 * Google's malware/phishing/unwanted-software blocklists.
 *
 * Docs: https://developers.google.com/safe-browsing/v4/lookup-api
 *
 * Requires GOOGLE_SAFE_BROWSING_API_KEY in the environment (free, from
 * Google Cloud Console -> enable "Safe Browsing API" -> Credentials ->
 * API Key).
 *
 * NOTE: this sandbox's network access is restricted to a fixed domain
 * allowlist that does not include safebrowsing.googleapis.com, so this
 * has NOT been tested against the live network here. Test on your own
 * machine before demo day. Logic below follows the documented v4 API
 * request/response shape exactly.
 */

const SAFE_BROWSING_URL = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const REQUEST_TIMEOUT_MS = 5000;

// Threat types worth checking for a phishing/brand-impersonation use case.
// (SOCIAL_ENGINEERING covers phishing specifically; MALWARE and
// UNWANTED_SOFTWARE cover malicious payloads a fake "bonus" link might push.)
const THREAT_TYPES = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'];

/**
 * @param {string} candidateUrl
 * @returns {{
 *   source: 'safe_browsing',
 *   implemented: true,
 *   url: string,
 *   isFlagged: boolean,
 *   threatTypes: string[],
 *   error?: string
 * }}
 */
async function safeBrowsingLookup(candidateUrl) {
  const base = {
    source: 'safe_browsing',
    implemented: true,
    url: candidateUrl,
    isFlagged: false,
    threatTypes: [],
  };

  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!apiKey) {
    return { ...base, error: 'GOOGLE_SAFE_BROWSING_API_KEY is not set in the environment' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${SAFE_BROWSING_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        client: {
          clientId: 'phishguard',
          clientVersion: '1.0.0',
        },
        threatInfo: {
          threatTypes: THREAT_TYPES,
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url: candidateUrl }],
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      return {
        ...base,
        error: `Safe Browsing request failed with status ${response.status}: ${errBody}`,
      };
    }

    const data = await response.json();
    // Google returns an EMPTY object ({}) when there are no matches at all.
    const matches = Array.isArray(data?.matches) ? data.matches : [];

    return {
      ...base,
      isFlagged: matches.length > 0,
      threatTypes: [...new Set(matches.map((m) => m.threatType).filter(Boolean))],
    };
  } catch (err) {
    const message = err.name === 'AbortError' ? 'Safe Browsing request timed out' : err.message;
    return { ...base, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export { safeBrowsingLookup };
