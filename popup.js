:root {
  --bg: #0F1417;
  --card-bg: #1A2226;
  --border: #2A353A;
  --text: #E6EDEF;
  --text-muted: #8FA3AA;
  --accent: #2DD4BF;
  --accent-dark: #0F766E;
  --danger: #DC2626;
  --warning: #F59E0B;
  --low: #84CC16;
  --safe: #16A34A;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  width: 380px;
  margin: 0;
  padding: 16px;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 13px;
  line-height: 1.5;
}

.header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.header-icon {
  width: 32px;
  height: 32px;
}

.header h1 {
  font-size: 16px;
  margin: 0;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.tagline {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: var(--text-muted);
}

.card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
}

.card h2 {
  font-size: 12.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  margin: 0 0 6px;
  font-weight: 600;
}

.hint {
  margin: 0 0 8px;
  color: var(--text-muted);
  font-size: 12px;
}

.input-row {
  display: flex;
  gap: 6px;
}

input[type="text"] {
  flex: 1;
  min-width: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 7px 9px;
  font-size: 12.5px;
  font-family: var(--font);
}

input[type="text"]:focus {
  outline: none;
  border-color: var(--accent);
}

button {
  background: var(--accent);
  color: #05201C;
  border: none;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

button:hover {
  background: #5EEAD4;
}

button:active {
  background: var(--accent-dark);
  color: var(--text);
}

.saved-msg {
  margin: 6px 0 0;
  color: var(--safe);
  font-size: 12px;
  font-weight: 600;
}

.hidden {
  display: none;
}

/* --- Result rendering --- */

.verdict-banner {
  border-radius: 8px;
  padding: 10px 12px;
  font-weight: 700;
  font-size: 13.5px;
  margin-bottom: 10px;
  border: 1px solid transparent;
}

.verdict-banner.risk-high {
  background: rgba(220, 38, 38, 0.15);
  border-color: var(--danger);
  color: #FCA5A5;
}

.verdict-banner.risk-medium {
  background: rgba(245, 158, 11, 0.15);
  border-color: var(--warning);
  color: #FCD34D;
}

.verdict-banner.risk-low {
  background: rgba(132, 204, 22, 0.15);
  border-color: var(--low);
  color: #D9F99D;
}

.verdict-banner.risk-safe {
  background: rgba(22, 163, 74, 0.15);
  border-color: var(--safe);
  color: #86EFAC;
}

.verdict-reasoning {
  margin: 0 0 10px;
  color: var(--text-muted);
  font-size: 12px;
}

.checked-url {
  font-family: "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
  margin: 0 0 10px;
  padding: 6px 8px;
  background: var(--bg);
  border-radius: 6px;
  border: 1px solid var(--border);
}

.signal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.signal-item {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 9px;
}

.signal-label {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  margin: 0 0 3px;
}

.signal-value {
  font-size: 12.5px;
  font-weight: 600;
  margin: 0;
}

.signal-value.flag-bad {
  color: #FCA5A5;
}

.signal-value.flag-good {
  color: #86EFAC;
}

.confidence-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--text-muted);
}

.error-msg {
  color: #FCA5A5;
  font-size: 12px;
}

.loading-msg {
  color: var(--text-muted);
  font-size: 12.5px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
