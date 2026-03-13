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
 * 
 * Also includes:
 * - Camera Follow System: Follow developers around the city
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
  dayNightToggle: (isNight) => ({
    background: isNight ? '#1a2332' : '#87ceeb',
    border: '1px solid rgba(100,180,255,0.3)',
    borderRadius: '6px',
    color: isNight ? '#ffd580' : '#fff',
    padding: '4px 10px',
    fontSize: '11px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.3s',
    marginRight: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  }),
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
    userSelect: 'text',
    pointerEvents: 'all',
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
    userSelect: 'text',
    pointerEvents: 'all',
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
  section: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid rgba(100, 180, 255, 0.15)',
  },
  sectionTitle: {
    fontSize: '11px',
    color: '#88ccff',
    fontWeight: 700,
    marginBottom: '8px',
    letterSpacing: '0.05em',
  },
  cameraBtn: (active) => ({
    width: '100%',
    padding: '7px',
    background: active ? 'rgba(255,180,100,0.15)' : 'rgba(255,180,100,0.05)',
    border: `1px solid ${active ? 'rgba(255,180,100,0.4)' : 'rgba(255,180,100,0.2)'}`,
    borderRadius: '6px',
    color: active ? '#ffaa66' : '#aa8866',
    fontSize: '11px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.15s',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  }),
};

// ─── component ───────────────────────────────────────────────────────────────

export function SimPanel({ onClose, onToggleDayNight, isNightMode, sceneRef }) {
  const [repos,        setRepos]        = useState([]);
  const [workers,      setWorkers]      = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [selectedType, setSelectedType] = useState('COMMIT');
  const [actor,        setActor]        = useState('');
  const [burstCount,   setBurstCount]   = useState(5);
  const [lastResult,   setLastResult]   = useState(null); // { ok, text }
  const [firing,       setFiring]       = useState(false);
  
  // Camera follow state
  const [cameraMode,      setCameraMode]      = useState('free');
  const [followedDev,     setFollowedDev]     = useState(null); // Developer name
  const [availableDevs,   setAvailableDevs]   = useState([]); // List of developer names

  // Load repo list and worker list on mount
  useEffect(() => {
    fetch('/api/repos', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then(data => {
        setRepos(data);
        if (data.length > 0) setSelectedRepo(data[0].slug);
      });

    fetch('/api/workers', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then(data => setWorkers(data));
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
          actor:     actor || undefined,
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

  // Update available developers list
  useEffect(() => {
    if (sceneRef?.current?.developerMgr) {
      const devs = sceneRef.current.developerMgr._devs || [];
      const devNames = devs
        .filter(d => d.role !== 'leader') // Exclude leader (seated)
        .map(d => d.data.name);
      setAvailableDevs(devNames);
    }
  }, [sceneRef]);

  // Camera follow handlers
  const handleFollowDeveloper = useCallback(() => {
    if (!sceneRef?.current || !followedDev) return;
    
    const { sceneMgr, developerMgr } = sceneRef.current;
    if (!sceneMgr || !developerMgr) return;
    
    // Find developer by name
    const dev = developerMgr._devs.find(d => d.data.name === followedDev);
    if (!dev || !dev.group) {
      setLastResult({ ok: false, text: `✗ Developer "${followedDev}" not found` });
      return;
    }
    
    sceneMgr.setFollowTarget(dev.group);
    setCameraMode('follow');
    setLastResult({ ok: true, text: `📹 Following ${followedDev}` });
  }, [sceneRef, followedDev]);

  const handleStopFollowing = useCallback(() => {
    if (!sceneRef?.current?.sceneMgr) return;
    
    sceneRef.current.sceneMgr.stopFollowing();
    setCameraMode('free');
    setFollowedDev(null);
    setLastResult({ ok: true, text: '🎮 Free camera mode' });
  }, [sceneRef]);

  return (
    <div style={S.overlay}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.title}>⚡ Simulation Panel</span>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {onToggleDayNight && (
            <button style={S.dayNightToggle(isNightMode)} onClick={onToggleDayNight} title="Toggle day/night cycle">
              <span>{isNightMode ? '🌙' : '☀️'}</span>
              <span>{isNightMode ? 'Night' : 'Day'}</span>
            </button>
          )}
          <button style={S.closeBtn} onClick={onClose} title="Close (⌥S)">✕</button>
        </div>
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
      <select
        style={S.select}
        value={actor}
        onChange={e => setActor(e.target.value)}
      >
        <option value="">— Random —</option>
        {workers.map(w => (
          <option key={w.gitlabUsername ?? w.displayName} value={w.gitlabUsername ?? ''}>
            {w.displayName}{w.gitlabUsername ? ` (@${w.gitlabUsername})` : ''}
          </option>
        ))}
      </select>

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

      {/* Camera Follow Section */}
      <div style={S.section}>
        <div style={S.sectionTitle}>📹 Camera Follow</div>
        
        {/* Developer selector */}
        <label style={S.label}>Select Developer</label>
        <select
          style={S.select}
          value={followedDev || ''}
          onChange={e => setFollowedDev(e.target.value)}
          disabled={cameraMode === 'follow'}
        >
          <option value="">— Choose Developer —</option>
          {availableDevs.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        {/* Follow button */}
        {cameraMode !== 'follow' ? (
          <button
            style={S.cameraBtn(false)}
            onClick={handleFollowDeveloper}
            disabled={!followedDev}
          >
            <span>🎥</span>
            <span>Follow Developer</span>
          </button>
        ) : (
          <button
            style={S.cameraBtn(true)}
            onClick={handleStopFollowing}
          >
            <span>🎮</span>
            <span>Stop Following (Free Camera)</span>
          </button>
        )}

        {/* Camera mode indicator */}
        <div style={{ 
          fontSize: '10px', 
          color: cameraMode === 'follow' ? '#ffaa66' : '#667788',
          textAlign: 'center',
          marginTop: '6px',
        }}>
          {cameraMode === 'follow' ? '📹 Following mode active' : '🎮 Free camera mode'}
        </div>
      </div>
    </div>
  );
}
