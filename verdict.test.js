/**
 * domainSimilarity.js
 *
 * PhishGuard's "secret sauce": compares a suspicious link's domain against
 * a user's real company domain and returns a similarity score + verdict flag.
 *
 * Techniques combined:
 *   1. Levenshtein edit distance (normalized to 0-100 similarity)
 *   2. Homoglyph normalization (catches lookalike chars before distance calc)
 *   3. Subdomain / prefix-suffix pattern detection (e.g. company.hr-bonus.com)
 *
 * Exposed as a pure function with no external dependencies, so it's easy
 * to unit test in isolation from the rest of the backend.
 */

// --- 1. Homoglyph map ---------------------------------------------------
// Maps visually-similar characters (including common Cyrillic/Latin
// look-alikes and digit substitutions) down to a canonical Latin letter.
// This lets us catch e.g. "g00gle.com" or Cyrillic "а" (U+0430) impersonating "a".
const HOMOGLYPH_MAP = {
  '0': 'o',
  '1': 'l',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  '$': 's',
  // Cyrillic look-alikes -> Latin
  '\u0430': 'a', // а
  '\u0435': 'e', // е
  '\u043e': 'o', // о
  '\u0440': 'p', // р
  '\u0441': 'c', // с
  '\u0443': 'y', // у
  '\u0445': 'x', // х
  '\u0456': 'i', // і
  '\u0458': 'j', // ј
  // Greek look-alikes -> Latin
  '\u03b1': 'a', // α
  '\u03bf': 'o', // ο
  '\u03c1': 'p', // ρ
  '\u03c5': 'u', // υ
};

// Multi-character substitutions checked before single-char mapping,
// longest-match-first (e.g. "rn" visually resembles "m").
const MULTI_CHAR_SUBSTITUTIONS = [
  ['rn', 'm'],
  ['vv', 'w'],
  ['cl', 'd'],
];

function normalizeHomoglyphs(input) {
  let s = input.toLowerCase();

  for (const [from, to] of MULTI_CHAR_SUBSTITUTIONS) {
    s = s.split(from).join(to);
  }

  let normalized = '';
  for (const ch of s) {
    normalized += HOMOGLYPH_MAP[ch] ?? ch;
  }
  return normalized;
}

// --- 2. Levenshtein distance --------------------------------------------
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = new Array(n + 1);
  let currRow = new Array(n + 1);
  for (let j = 0; j <= n; j++) prevRow[j] = j;

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,      // deletion
        currRow[j - 1] + 1,  // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }
  return prevRow[n];
}

// Converts edit distance into a 0-100 similarity score relative to the
// longer of the two strings.
function similarityFromDistance(a, b) {
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length, 1);
  const ratio = 1 - distance / maxLen;
  return Math.round(ratio * 100);
}

// --- 3. Domain parsing helpers ------------------------------------------
// Strips protocol/path/query, returns lowercase hostname only.
function extractHostname(urlOrDomain) {
  let s = urlOrDomain.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) {
    s = 'http://' + s; // allow bare domains through URL parsing
  }
  try {
    return new URL(s).hostname.toLowerCase();
  } catch {
    return urlOrDomain.trim().toLowerCase();
  }
}

// Splits "sub.domain.co.uk" style hosts into labels. We don't do full
// public-suffix-list parsing here (that's a stretch-goal refinement) —
// good enough for hackathon demo purposes.
function getLabels(hostname) {
  return hostname.split('.').filter(Boolean);
}

// Registrable "root" domain — last two labels, e.g. "example.com" from
// "mail.example.com". Naive but fine for common TLDs; flagged as a known
// limitation for multi-part TLDs like .co.uk.
function getRootDomain(hostname) {
  const labels = getLabels(hostname);
  if (labels.length <= 2) return hostname;
  return labels.slice(-2).join('.');
}

// --- 4. Pattern checks ----------------------------------------------------
// Detects the "subdomain/prefix-suffix" impersonation pattern, e.g.
//   yourcompany.hr-bonus.com   (real domain used as a SUBDOMAIN of attacker's)
//   yourcompany-hr-bonus.com   (real domain name used as a PREFIX/SUFFIX)
function detectPatternAbuse(candidateHost, realRoot) {
  const realNameOnly = realRoot.split('.')[0]; // e.g. "yourcompany"
  const findings = [];

  const candidateLabels = getLabels(candidateHost);
  // Case A: real domain name appears as a non-final label (subdomain trick)
  // e.g. "yourcompany.hr-bonus.com" -> labels = [yourcompany, hr-bonus, com]
  if (
    candidateLabels.length > 2 &&
    candidateLabels.slice(0, -2).includes(realNameOnly) &&
    getRootDomain(candidateHost) !== realRoot
  ) {
    findings.push('real_domain_used_as_subdomain');
  }

  // Case B: real domain name embedded as prefix/suffix within a single label
  // e.g. "yourcompany-hr-bonus.com" -> root label "yourcompany-hr-bonus"
  const candidateRootLabel = getLabels(getRootDomain(candidateHost))[0] || '';
  if (
    candidateRootLabel !== realNameOnly &&
    candidateRootLabel.includes(realNameOnly) &&
    realNameOnly.length >= 3 // avoid false positives on very short names
  ) {
    findings.push('real_domain_embedded_in_label');
  }

  return findings;
}

// --- 5. Public API ---------------------------------------------------------

/**
 * @param {string} candidateUrlOrDomain - the link/domain being checked
 * @param {string} realCompanyDomain - the user's configured real domain
 * @returns {{
 *   candidateHost: string,
 *   realRoot: string,
 *   rawSimilarity: number,
 *   normalizedSimilarity: number,
 *   patternFlags: string[],
 *   verdict: 'exact_match' | 'suspicious_lookalike' | 'unrelated',
 *   score: number
 * }}
 */
function scoreDomainSimilarity(candidateUrlOrDomain, realCompanyDomain) {
  const candidateHost = extractHostname(candidateUrlOrDomain);
  const realHost = extractHostname(realCompanyDomain);
  const realRoot = getRootDomain(realHost);
  const candidateRoot = getRootDomain(candidateHost);

  // Exact match on the registrable root domain -> trivially safe, skip the
  // rest of the scoring (an exact match on a sub-brand subdomain like
  // "login.yourcompany.com" also counts as a match here).
  if (candidateRoot === realRoot) {
    return {
      candidateHost,
      realRoot,
      rawSimilarity: 100,
      normalizedSimilarity: 100,
      patternFlags: [],
      verdict: 'exact_match',
      score: 100,
    };
  }

  const rawSimilarity = similarityFromDistance(candidateRoot, realRoot);
  const normalizedSimilarity = similarityFromDistance(
    normalizeHomoglyphs(candidateRoot),
    normalizeHomoglyphs(realRoot)
  );
  const patternFlags = detectPatternAbuse(candidateHost, realRoot);

  // Final score favors whichever signal is more damning: a pattern-abuse
  // hit or a high homoglyph-normalized similarity should dominate even if
  // raw Levenshtein similarity looks low.
  let score = Math.max(rawSimilarity, normalizedSimilarity);
  if (patternFlags.length > 0) {
    score = Math.max(score, 85);
  }

  let verdict;
  if (score >= 70) {
    verdict = 'suspicious_lookalike';
  } else {
    verdict = 'unrelated';
  }

  return {
    candidateHost,
    realRoot,
    rawSimilarity,
    normalizedSimilarity,
    patternFlags,
    verdict,
    score,
  };
}

export {
  scoreDomainSimilarity,
  levenshteinDistance,
  normalizeHomoglyphs,
  extractHostname,
  getRootDomain,
};
