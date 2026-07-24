/**
 * background.js — MV3 service worker
 *
 * Responsibilities:
 *  1. Register the "Check with PhishGuard" right-click context menu on links
 *  2. On click, call the backend /check endpoint with the link + the
 *     user's configured company domain
 *  3. Store the result so popup.js can display it, update the action
 *     badge as an at-a-glance risk indicator, and fire a notification
 *     for high-risk links (since the popup isn't auto-opened on a
 *     context-menu click in MV3 without an explicit user gesture on it)
 */

// Change this once the backend is deployed somewhere other than localhost
// (and update host_permissions in manifest.json to match).
const BACKEND_URL = 'http://localhost:3000';

const BADGE_COLORS = {
  high: '#DC2626',
  medium: '#F59E0B',
  low: '#84CC16',
  safe: '#16A34A',
  unknown: '#6B7280',
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'phishguard-check-link',
    title: 'Check with PhishGuard',
    contexts: ['link'],
  });
});

async function getCompanyDomain() {
  const { companyDomain } = await chrome.storage.sync.get('companyDomain');
  return companyDomain ?? null;
}

function setBadge(riskLevel) {
  const color = BADGE_COLORS[riskLevel] ?? BADGE_COLORS.unknown;
  const text = riskLevel === 'safe' ? '✓' : riskLevel === 'high' ? '!' : riskLevel === 'medium' ? '?' : '';
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
}

async function checkLink(url) {
  const companyDomain = await getCompanyDomain();

  if (!companyDomain) {
    await chrome.storage.local.set({
      lastCheckResult: {
        status: 'error',
        error: 'No company domain configured yet. Click the PhishGuard icon to set it up first.',
        checkedUrl: url,
        checkedAt: Date.now(),
      },
    });
    setBadge('unknown');
    chrome.action.setBadgeText({ text: '?' });
    return;
  }

  // "Checking..." state so the popup can show a spinner if opened mid-flight.
  await chrome.storage.local.set({
    lastCheckResult: { status: 'loading', checkedUrl: url, checkedAt: Date.now() },
  });

  try {
    const response = await fetch(`${BACKEND_URL}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, companyDomain }),
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status ${response.status}`);
    }

    const data = await response.json();
    const riskLevel = data?.verdict?.riskLevel ?? 'unknown';

    await chrome.storage.local.set({
      lastCheckResult: {
        status: 'done',
        checkedUrl: url,
        checkedAt: Date.now(),
        data,
      },
    });

    setBadge(riskLevel);

    if (riskLevel === 'high' || riskLevel === 'medium') {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'PhishGuard: Suspicious link detected',
        message: data?.verdict?.verdict ?? 'This link looks suspicious. Click the PhishGuard icon for details.',
        priority: 2,
      });
    }
  } catch (err) {
    await chrome.storage.local.set({
      lastCheckResult: {
        status: 'error',
        error: err.message,
        checkedUrl: url,
        checkedAt: Date.now(),
      },
    });
    setBadge('unknown');
  }
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'phishguard-check-link' && info.linkUrl) {
    checkLink(info.linkUrl);
  }
});

// Lets popup.js (or a future content script) trigger a check too, e.g. for
// the "paste a link manually" nice-to-have feature.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'CHECK_LINK' && message.url) {
    checkLink(message.url).then(() => sendResponse({ ok: true }));
    return true; // keep the message channel open for the async response
  }
  return false;
});
