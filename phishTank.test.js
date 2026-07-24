/**
 * urlscan.js
 *
 * Real urlscan.io integration — gives hosting IP/ASN/country, redirect
 * chain, and a screenshot of the destination page.
 *
 * urlscan.io's API is two-step and asynchronous:
 *   1. POST /api/v1/scan/  -> submits the URL, returns a scan `uuid`
 *   2. GET  /api/v1/result/{uuid}/ -> poll until the scan finishes
 *      (returns 404 while still processing, 200 once done)
 * Docs: https://urlscan.io/docs/api/
 *
 * Requires URLSCAN_API_KEY in the environment (free tier, sign up at
 * urlscan.io -> account settings -> API key).
 *
 * NOTE: this sandbox's network access is restricted to a fixed domain
 * allowlist that does not include urlscan.io, so this has NOT been
 * tested against the live network here. Test on your own machine before
 * demo day. Logic below follows urlscan's documented API shape.
 */

const SCAN_SUBMIT_URL = 'https://urlscan.io/api/v1/scan/';
const RESULT_URL_BASE = 'https://urlscan.io/api/v1/result';
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 10; // ~20s max wait, fine for a hackathon demo
const REQUEST_TIMEOUT_MS = 8000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractSignalsFromResult(resultJson) {
  const page = resultJson?.page ?? {};
  const requests = resultJson?.data?.requests ?? [];

  // Build a simple redirect chain from the primary document's request/
  // response history if present; otherwise fall back to just the final
  // resolved URL.
  const redirectChain = Array.isArray(requests)
    ? requests
        .map((r) => r?.request?.request?.url)
        .filter(Boolean)
        .slice(0, 10) // cap it, this is just for display
    : [];

  return {
    hostingIp: page.ip ?? null,
    asn: page.asn ?? null,
    country: page.country ?? null,
    redirectChain: redirectChain.length ? redirectChain : (page.url ? [page.url] : []),
    screenshotUrl: resultJson?.task?.screenshotURL ?? null,
  };
}

/**
 * @param {string} candidateUrl
 * @returns {{
 *   source: 'urlscan',
 *   implemented: true,
 *   url: string,
 *   found: boolean,
 *   hostingIp: string|null,
 *   asn: string|null,
 *   country: string|null,
 *   redirectChain: string[],
 *   screenshotUrl: string|null,
 *   error?: string
 * }}
 */
async function urlscanLookup(candidateUrl) {
  const base = {
    source: 'urlscan',
    implemented: true,
    url: candidateUrl,
    found: false,
    hostingIp: null,
    asn: null,
    country: null,
    redirectChain: [],
    screenshotUrl: null,
  };

  const apiKey = process.env.URLSCAN_API_KEY;
  if (!apiKey) {
    return { ...base, error: 'URLSCAN_API_KEY is not set in the environment' };
  }

  try {
    const submitResponse = await fetchWithTimeout(SCAN_SUBMIT_URL, {
      method: 'POST',
      headers: {
        'API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: candidateUrl, visibility: 'unlisted' }),
    });

    if (!submitResponse.ok) {
      const errBody = await submitResponse.text().catch(() => '');
      return {
        ...base,
        error: `urlscan submit failed with status ${submitResponse.status}: ${errBody}`,
      };
    }

    const submitData = await submitResponse.json();
    const uuid = submitData?.uuid;
    if (!uuid) {
      return { ...base, error: 'urlscan submit response missing uuid' };
    }

    // Poll for the result. urlscan returns 404 while the scan is still
    // in progress, and 200 with full result data once complete.
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);

      const resultResponse = await fetchWithTimeout(`${RESULT_URL_BASE}/${uuid}/`);

      if (resultResponse.status === 404) {
        continue; // still processing, try again
      }

      if (!resultResponse.ok) {
        return {
          ...base,
          error: `urlscan result fetch failed with status ${resultResponse.status}`,
        };
      }

      const resultData = await resultResponse.json();
      return {
        ...base,
        found: true,
        ...extractSignalsFromResult(resultData),
      };
    }

    return { ...base, error: 'urlscan result timed out (scan still processing)' };
  } catch (err) {
    const message = err.name === 'AbortError' ? 'urlscan request timed out' : err.message;
    return { ...base, error: message };
  }
}

export { urlscanLookup };
