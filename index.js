/**
 * rdap.js
 *
 * Real RDAP (Registration Data Access Protocol) integration — the free,
 * structured, no-API-key-needed replacement for WHOIS.
 *
 * We query rdap.org's bootstrap endpoint, which figures out the correct
 * registry (Verisign for .com, PIR for .org, etc.) and redirects/responds
 * accordingly, so callers don't need per-TLD registry logic.
 *
 * Docs: https://rdap.org/
 *
 * NOTE: this makes a live network call to an external registry. It has
 * NOT been tested against the live network in this dev sandbox (outbound
 * access here is restricted to a fixed domain allowlist that doesn't
 * include rdap.org / registry RDAP servers). Test this against the real
 * network before demo day.
 */

const RDAP_BASE_URL = 'https://rdap.org/domain';
const REQUEST_TIMEOUT_MS = 5000;

function daysBetween(dateA, dateB) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((dateA.getTime() - dateB.getTime()) / msPerDay);
}

// RDAP responses use a standard "events" array with an eventAction field
// (e.g. "registration", "last changed", "expiration") — we pull out the
// registration date from there.
function extractRegistrationDate(rdapJson) {
  const events = rdapJson?.events;
  if (!Array.isArray(events)) return null;

  const regEvent = events.find(
    (e) => e.eventAction === 'registration'
  );
  if (!regEvent?.eventDate) return null;

  const parsed = new Date(regEvent.eventDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Registrar name usually lives in the "entities" array under a "registrar"
// role, with the name in vcardArray (jCard format) or a "fn" field.
function extractRegistrar(rdapJson) {
  const entities = rdapJson?.entities;
  if (!Array.isArray(entities)) return null;

  const registrarEntity = entities.find(
    (e) => Array.isArray(e.roles) && e.roles.includes('registrar')
  );
  if (!registrarEntity) return null;

  // jCard format: vcardArray = ["vcard", [ ["fn", {}, "text", "Some Registrar"], ... ]]
  const vcard = registrarEntity.vcardArray?.[1];
  if (Array.isArray(vcard)) {
    const fnEntry = vcard.find((entry) => entry[0] === 'fn');
    if (fnEntry?.[3]) return fnEntry[3];
  }

  return registrarEntity.handle ?? null;
}

/**
 * @param {string} hostname - e.g. "example.com" (no protocol/path)
 * @returns {{
 *   source: 'rdap',
 *   implemented: true,
 *   hostname: string,
 *   found: boolean,
 *   domainAgeDays: number|null,
 *   registrar: string|null,
 *   createdDate: string|null,
 *   error?: string
 * }}
 */
async function rdapLookup(hostname) {
  const baseResult = {
    source: 'rdap',
    implemented: true,
    hostname,
    found: false,
    domainAgeDays: null,
    registrar: null,
    createdDate: null,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${RDAP_BASE_URL}/${encodeURIComponent(hostname)}`, {
      headers: { Accept: 'application/rdap+json' },
      signal: controller.signal,
    });

    // RDAP returns 404 for domains with no registration data available
    // (e.g. unregistered domains, or registries that don't publish RDAP).
    if (response.status === 404) {
      return { ...baseResult, found: false };
    }

    if (!response.ok) {
      return {
        ...baseResult,
        error: `RDAP request failed with status ${response.status}`,
      };
    }

    const data = await response.json();
    const createdDate = extractRegistrationDate(data);
    const registrar = extractRegistrar(data);

    return {
      ...baseResult,
      found: true,
      domainAgeDays: createdDate ? daysBetween(new Date(), createdDate) : null,
      registrar,
      createdDate: createdDate ? createdDate.toISOString() : null,
    };
  } catch (err) {
    const message = err.name === 'AbortError' ? 'RDAP request timed out' : err.message;
    return { ...baseResult, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export { rdapLookup };
