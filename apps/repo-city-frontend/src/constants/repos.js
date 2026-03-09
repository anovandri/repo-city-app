/**
 * All 18 repository definitions for the city.
 * pos: [x, floors, z] — floors drives building height; x/z are scene positions.
 */
export const REPOS = [
  // ── ms-partner district (NW) ──────────────────────────────────────────────
  { id: 'msp-admin',   icon: '🛡️', name: 'ms-partner-administration',        pos: [-48,  8,  -8], district: 'ms-partner' },
  { id: 'msp-atome',   icon: '⚛️', name: 'ms-partner-atome',                 pos: [-48,  7, -24], district: 'ms-partner' },
  { id: 'msp-cb',      icon: '🔔', name: 'ms-partner-callback',              pos: [-32,  7, -36], district: 'ms-partner' },
  { id: 'msp-cbrl',    icon: '⏱️', name: 'ms-partner-callback-rate-limiter', pos: [-48,  7, -40], district: 'ms-partner' },
  { id: 'msp-cust',    icon: '👥', name: 'ms-partner-customer',              pos: [-32,  7, -52], district: 'ms-partner' },
  { id: 'msp-gw',      icon: '🌐', name: 'ms-partner-gateway',               pos: [-16,  8, -52], district: 'ms-partner' },
  { id: 'msp-int',     icon: '🔗', name: 'ms-partner-integration-platform',  pos: [-64,  8, -24], district: 'ms-partner' },
  { id: 'msp-reg',     icon: '📝', name: 'ms-partner-registration',          pos: [-64,  7, -40], district: 'ms-partner' },
  { id: 'msp-txn',     icon: '💱', name: 'ms-partner-transaction',           pos: [-48,  9, -56], district: 'ms-partner' },
  { id: 'msp-web',     icon: '🖥️', name: 'ms-partner-web',                   pos: [-16,  7, -36], district: 'ms-partner' },
  // ── ms-pip district (NE) ──────────────────────────────────────────────────
  { id: 'pip-cat',     icon: '📚', name: 'ms-pip-catalog',                   pos: [ 24,  7, -36], district: 'ms-pip' },
  { id: 'pip-gw',      icon: '🚪', name: 'ms-pip-gateway',                   pos: [ 40,  8, -24], district: 'ms-pip' },
  { id: 'pip-res',     icon: '📦', name: 'ms-pip-resource',                  pos: [ 40,  7, -40], district: 'ms-pip' },
  { id: 'pip-txn',     icon: '💳', name: 'ms-pip-transaction',               pos: [ 24,  8, -52], district: 'ms-pip' },
  // ── Standalone (SE) ───────────────────────────────────────────────────────
  { id: 'webview-auto',icon: '🤖', name: 'partner-webview-automation-test',  pos: [ 24,  7,  20], district: 'standalone' },
  { id: 'partnership', icon: '🤝', name: 'partnership-automation',           pos: [ 40,  7,  20], district: 'standalone' },
  // ── Special ───────────────────────────────────────────────────────────────
  { id: 'ginpay',      icon: '⚠️', name: 'ms-ginpay',                        pos: [  8,  6, -36], district: 'special', sunset: true },
  { id: 'prod-support',icon: '🚨', name: 'production-support',               pos: [ 20, 14,   0], district: 'special', support: true },
];

/** Map from repo name (slug) → REPOS entry — fast lookup. */
export const REPO_BY_NAME = Object.fromEntries(REPOS.map(r => [r.name, r]));

/** Map from repo id → REPOS entry. */
export const REPO_BY_ID = Object.fromEntries(REPOS.map(r => [r.id, r]));
