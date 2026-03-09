import React, { useEffect, useState, useCallback } from 'react';

/**
 * SimPanel — developer simulation panel.
 *
 * Fires synthetic city mutation events via POST /api/simulate (single) or
 * POST /api/simulate/burst (multiple random), so you can exercise the full
 * WebSocket → EffectsManager → Three.js pipeline without waiting for real
 * GitLab activity.
 *
 * Toggle visibility: Alt+S (keyboard shortcut wired in App.jsx)
 */

const EVENT_TYPES = [
  { key: 'COMMIT',           label: 'Commit',          icon: '🔨', color: '#44ddff' },
  { key: 'MR_OPENED',        label: 'MR Opened',       icon: '🔀', color: '#cc44ff' },
  { key: 'MR_MERGED',        label: 'MR Merged',       icon: '✅', color: '#66ff88' },
  { key: 'PIPELINE_RUNNING', label: 'Pipeline Running', icon: '⚙️', color: '#66ddff' },
  { key: 'PIPELINE_SUCCESS', label: 'Pipeline Success', icon: '🟢', color: '#44ffaa' },
  { key: 'PIPELINE_FAILED',  label: 'Pipeline Failed',  icon: '🔴', color: '#ff4444' },
];

const BASE_URL = '/api/simulate';

// ─── styles ──────────────────────────────────────────────────────────────────

const S = {
  overlay: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: 9999,
    width: '320px',
    background: 'rgba(12, 14, 20, 0.96)',
    border: '1px solid rgba(100, 180, 255, 0.25)',
    borderRadius: '12px',
    padding: '16px',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: '12px',
    color: '#c8d8f0',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    borderBottom: '1px solid rgba(100, 180, 255, 0.15)',
    paddingBottom: '8px',
  },
  title: {
    fontWeight: 700,
    fontSize: '13px',
    color: '#88ccff',
    letterSpacing: '0.05em',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#556677',
    fontSize: '16px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 2px',
  },
  label: {
    display: 'block',
    marginBottom: '4px',
    color: '#6688aa',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  select: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(100,180,255,0.2)',
    borderRadius: '6px',
    color: '#c8d8f0',
    padding: '6px 8px',
    fontSize: '12px',
    fontFamily: 'inherit',
    marginBottom: '10px',
    appearance: 'none',
    cursor: 'pointer',
  },
  actorInput: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(100,180,255,0.2)',
    borderRadius: '6px',
    color: '#c8d8f0',
    padding: '6px 8px',
    fontSize: '12px',
    fontFamily: 'inherit',
    marginBottom: '12px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  gridRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
    marginBottom: '6px',
  },
  eventBtn: (color, active) => ({
    background: active ? `${color}22` : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? color : 'rgba(100,180,255,0.15)'}`,
    borderRadius: '6px',
    color: active ? color : '#8899aa',
    padding: '6px 8px',
    fontSize: '11px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  }),
  fireBtn: (disabled) => ({
    width: '100%',
    padding: '9px',
    background: disabled ? 'rgba(68,221,255,0.05)' : 'rgba(68,221,255,0.12)',
    border: `1px solid ${disabled ? 'rgba(68,221,255,0.1)' : 'rgba(68,221,255,0.4)'}`,
    borderRadius: '8px',
    color: disabled ? '#335566' : '#44ddff',
    fontSize: '12px',
    fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 700,
    letterSpacing: '0.06em',
    marginBottom: '6px',
    transition: 'all 0.15s',
  }),
  burstRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  burstBtn: {
    flex: 1,
    padding: '7px',
    background: 'rgba(180,100,255,0.1)',
    border: '1px solid rgba(180,100,255,0.3)',
    borderRadius: '8px',
    color: '#cc88ff',
    fontSize: '11px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.15s',
  },
  burstCount: {
    width: '48px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(100,180,255,0.2)',
    borderRadius: '6px',
    color: '#c8d8f0',
    padding: '6px 8px',
    fontSize: '12px',
    fontFamily: 'inherit',
    textAlign: 'center',
    outline: 'none',
  },
  status: (ok) => ({
    marginTop: '8px',
    padding: '5px 8px',
    borderRadius: '5px',
    fontSize: '10px',
    background: ok ? 'rgba(68,255,160,0.08)' : 'rgba(255,60,60,0.08)',
    border: `1px solid ${ok ? 'rgba(68,255,160,0.2)' : 'rgba(255,60,60,0.2)'}`,
    color: ok ? '#44ffaa' : '#ff6666',
  }),
};

// ─── component ───────────────────────────────────────────────────────────────

export function SimPanel({ onClose }) {
  const [repos,       setRepos]       = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [selectedType, setSelectedType] = useState('COMMIT');
  const [actor,       setActor]       = useState('');
  const [burstCount,  setBurstCount]  = useState(5);
  const [lastResult,  setLastResult]  = useState(null); // { ok, text }
  const [firing,      setFiring]      = useState(false);

  // Load repo list on mount
  useEffect(() => {
    fetch('/api/repos', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then(data => {
        setRepos(data);
        if (data.length > 0) setSelectedRepo(data[0].slug);
      });
  }, []);

  const fire = useCallback(async () => {
    if (!selectedRepo || firing) return;
    setFiring(true);
    try {
      const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoSlug:  selectedRepo,
          eventType: selectedType,
          actor:     actor.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setLastResult({ ok: true, text: `✓ ${data.repoIcon} ${data.repoSlug} → ${data.hint} by ${data.actor}` });
      } else {
        setLastResult({ ok: false, text: `✗ ${data.error || 'Unknown error'}` });
      }
    } catch (e) {
      setLastResult({ ok: false, text: `✗ Network error: ${e.message}` });
    } finally {
      setFiring(false);
    }
  }, [selectedRepo, selectedType, actor, firing]);

  const burst = useCallback(async () => {
    if (firing) return;
    setFiring(true);
    try {
      const res = await fetch(`${BASE_URL}/burst?count=${burstCount}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const uniqueRepos = new Set(data.fired.map(f => f.slug)).size;
        setLastResult({ ok: true, text: `✓ Burst: ${data.count} events fired across ${uniqueRepos} repos` });
      } else {
        setLastResult({ ok: false, text: `✗ ${data.error || 'Burst failed'}` });
      }
    } catch (e) {
      setLastResult({ ok: false, text: `✗ Network error: ${e.message}` });
    } finally {
      setFiring(false);
    }
  }, [burstCount, firing]);

  return (
    <div style={S.overlay}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.title}>⚡ Simulation Panel</span>
        <button style={S.closeBtn} onClick={onClose} title="Close (⌥S)">✕</button>
      </div>

      {/* Repo selector */}
      <label style={S.label}>Repository</label>
      <select
        style={S.select}
        value={selectedRepo}
        onChange={e => setSelectedRepo(e.target.value)}
      >
        {repos.map(r => (
          <option key={r.slug} value={r.slug}>{r.icon} {r.slug}</option>
        ))}
      </select>

      {/* Event type grid */}
      <label style={S.label}>Event Type</label>
      <div style={S.gridRow}>
        {EVENT_TYPES.map(ev => (
          <button
            key={ev.key}
            style={S.eventBtn(ev.color, selectedType === ev.key)}
            onClick={() => setSelectedType(ev.key)}
          >
            <span>{ev.icon}</span>
            <span>{ev.label}</span>
          </button>
        ))}
      </div>

      {/* Actor override */}
      <label style={{ ...S.label, marginTop: '6px' }}>Actor (optional)</label>
      <input
        type="text"
        style={S.actorInput}
        placeholder="Random actor if blank"
        value={actor}
        onChange={e => setActor(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && fire()}
      />

      {/* Fire button */}
      <button style={S.fireBtn(!selectedRepo || firing)} onClick={fire} disabled={!selectedRepo || firing}>
        {firing ? '…' : '▶ Fire Event'}
      </button>

      {/* Burst row */}
      <div style={S.burstRow}>
        <button style={S.burstBtn} onClick={burst} disabled={firing}>
          🎲 Burst
        </button>
        <input
          type="number"
          min={1}
          max={20}
          value={burstCount}
          onChange={e => setBurstCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
          style={S.burstCount}
          title="Number of random events (1–20)"
        />
        <span style={{ color: '#445566', fontSize: '10px' }}>events</span>
      </div>

      {/* Last result */}
      {lastResult && (
        <div style={S.status(lastResult.ok)}>{lastResult.text}</div>
      )}
    </div>
  );
}
