/**
 * verdict.js
 *
 * Turns the combined JSON signals (domain similarity, RDAP, PhishTank,
 * urlscan, Safe Browsing) into a plain-English verdict a non-technical
 * employee can understand, using the Gemini API (free tier — see
 * project decision to avoid Claude API cost for this hackathon).
 *
 * Docs: https://ai.google.dev/gemini-api/docs
 *
 * Requires GEMINI_API_KEY in the environment. Supports both key formats:
 *   - Legacy "Standard" keys (AIza...)
 *   - New "Auth" keys (AQ.Ab...) — these MUST be sent via the
 *     `X-goog-api-key` header, NOT as a `?key=` query param or
 *     `Authorization: Bearer` header. Sending via header works for both
 *     formats, so we always use the header approach.
 *
 * NOTE: this sandbox's network access is restricted to a fixed domain
 * allowlist that does not include generativelanguage.googleapis.com, so
 * this has NOT been tested against the live network here. Test on your
 * own machine before demo day.
 */

const GEMINI_MODEL = 'gemini-flash-latest'; // free-tier eligible per Google's docs
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const REQUEST_TIMEOUT_MS = 15000;

function buildPrompt(signals, hostname, companyDomain) {
  return `You are a security assistant helping a non-technical employee understand whether a link is a phishing attempt impersonating their company.

Company's real domain: ${companyDomain}
Link's domain: ${hostname}

Signals collected about this link (JSON):
${JSON.stringify(signals, null, 2)}

Based on these signals, respond with ONLY a JSON object (no markdown, no code fences, no extra text) matching this exact shape:
{
  "riskLevel": "high" | "medium" | "low" | "safe",
  "verdict": "<one short plain-English sentence starting with an emoji: ⚠️ for high/medium risk, ✅ for safe>",
  "reasoning": "<1-2 short sentences explaining the key signals that led to this verdict, in plain language a non-technical person would understand>",
  "confidence": <integer 0-100>
}

Guidance:
- If domain similarity verdict is "exact_match" AND no phishing/malware flags are present, riskLevel should be "safe".
- If domain similarity verdict is "suspicious_lookalike", or PhishTank/Safe Browsing flag the link, riskLevel should be "high" or "medium" depending on how many signals agree.
- Weigh domain age (very new domains are suspicious) if RDAP data is available.
- Be concise. The verdict sentence is shown directly in a browser extension popup.`;
}

function extractJsonFromResponse(geminiResponseJson) {
  const text = geminiResponseJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  // Defensive: strip markdown code fences if the model adds them despite
  // instructions not to.
  const cleaned = text.replace(/^```json\s*|^```\s*|```$/gm, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * @param {object} signals - the combined signals object from /check (similarity, rdap, phishTank, urlscan, safeBrowsing)
 * @param {string} hostname - the candidate link's hostname
 * @param {string} companyDomain - the user's configured real company domain
 * @returns {{
 *   riskLevel: 'high'|'medium'|'low'|'safe'|null,
 *   verdict: string|null,
 *   reasoning: string|null,
 *   confidence: number|null,
 *   error?: string
 * }}
 */
async function generateVerdict(signals, hostname, companyDomain) {
  const base = { riskLevel: null, verdict: null, reasoning: null, confidence: null };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ...base, error: 'GEMINI_API_KEY is not set in the environment' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: buildPrompt(signals, hostname, companyDomain) }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      return { ...base, error: `Gemini request failed with status ${response.status}: ${errBody}` };
    }

    const data = await response.json();
    const parsed = extractJsonFromResponse(data);

    if (!parsed) {
      return { ...base, error: 'Could not parse a JSON verdict from the Gemini response' };
    }

    return {
      riskLevel: parsed.riskLevel ?? null,
      verdict: parsed.verdict ?? null,
      reasoning: parsed.reasoning ?? null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    };
  } catch (err) {
    const message = err.name === 'AbortError' ? 'Gemini request timed out' : err.message;
    return { ...base, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export { generateVerdict };
