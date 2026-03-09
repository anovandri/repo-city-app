import React, { useState, useMemo } from 'react';
import { REPOS }  from '../constants/repos.js';

const ROLE_BADGE = {
  leader:    '👑 Leader',
  caretaker: '🛡 Caretaker',
  engineer:  '⚙️ Engineer',
};

const AVATAR = {
  leader:    '👑',
  caretaker: '🛡️',
  engineer:  { male: '👨‍💻', female: '👩‍💻' },
};

function getAvatar(person) {
  if (person.role === 'leader')    return AVATAR.leader;
  if (person.role === 'caretaker') return AVATAR.caretaker;
  return AVATAR.engineer[person.gender] ?? '🧑‍💻';
}

/**
 * DevPanel — dev profile search + activity overlay.
 *
 * Props:
 *   workers     — [{ displayName, role (UPPER), gender (UPPER) }] from /api/workers
 *   devActivity — { [displayName]: { commits, mrsOpened, mrsMerged, pipelines, byRepo } }
 *   onClose     — () => void
 */
export const DevPanel = React.memo(function DevPanel({ workers = [], devActivity, onClose }) {
  const [query, setQuery]     = useState('');
  const [selected, setSelected] = useState(null);

  // Normalise API workers (UPPERCASE role/gender) into the shape this component needs
  const people = useMemo(() =>
    workers.map(w => ({
      name:   w.displayName,
      gitlab: w.displayName,          // devActivity is keyed by displayName
      role:   w.role.toLowerCase(),
      gender: w.gender.toLowerCase(),
    })),
  [workers]);

  const filtered = useMemo(() => {
    if (!query.trim()) return people;
    const q = query.toLowerCase();
    return people.filter(p => p.name.toLowerCase().includes(q));
  }, [query, people]);

  const activity = selected
    ? devActivity[selected.gitlab] ?? { commits: 0, mrsOpened: 0, mrsMerged: 0, pipelines: 0, byRepo: {} }
    : null;

  return (
    <div className="panel-overlay dev-panel">
      <div className="panel-header">
        <span>👤 Dev Profile</span>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="dev-panel-body">
        {/* Search */}
        <input
          className="dev-search"
          placeholder="Search by name or @gitlab…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {/* Results list (when no one selected) */}
        {!selected && (
          <div className="dev-list">
            {filtered.map(p => (
              <button
                key={p.gitlab}
                className="dev-list-row"
                onClick={() => setSelected(p)}
              >
                <span className="dev-avatar">{getAvatar(p)}</span>
                <span className="dev-list-name">{p.name}</span>
                <span className="dev-list-role">{ROLE_BADGE[p.role]}</span>
              </button>
            ))}
          </div>
        )}
        {/* Profile card */}
        {selected && activity && (
          <div className="dev-profile">
            <button className="dev-back" onClick={() => setSelected(null)}>← Back</button>
            <div className="dev-card">
              <div className="dev-card-avatar">{getAvatar(selected)}</div>
              <div className="dev-card-info">
                <div className="dev-card-name">{selected.name}</div>
                <div className="dev-card-gitlab">@{selected.gitlab}</div>
                <div className={`dev-card-role role-${selected.role}`}>{ROLE_BADGE[selected.role]}</div>
              </div>
            </div>
            {/* Stat boxes */}
            <div className="dev-stats-grid">
              <div className="dev-stat-box commit">
                <div className="dev-stat-val">{activity.commits}</div>
                <div className="dev-stat-lbl">Commits</div>
              </div>
              <div className="dev-stat-box mr-opened">
                <div className="dev-stat-val">{activity.mrsOpened}</div>
                <div className="dev-stat-lbl">MRs Opened</div>
              </div>
              <div className="dev-stat-box merged">
                <div className="dev-stat-val">{activity.mrsMerged}</div>
                <div className="dev-stat-lbl">MRs Merged</div>
              </div>
              <div className="dev-stat-box pipeline">
                <div className="dev-stat-val">{activity.pipelines}</div>
                <div className="dev-stat-lbl">Pipelines</div>
              </div>
            </div>
            {/* Per-repo breakdown */}
            {Object.keys(activity.byRepo).length > 0 && (
              <div className="dev-repo-table">
                <div className="dev-repo-header">
                  <span>Repo</span><span>C</span><span>MR</span><span>Merged</span><span>CI</span>
                </div>
                {Object.entries(activity.byRepo).map(([slug, counts]) => {
                  const repo = REPOS.find(r => r.name === slug);
                  return (
                    <div key={slug} className="dev-repo-row">
                      <span>{repo?.icon ?? ''} {slug.split('-').slice(-1)[0]}</span>
                      <span>{counts.commits}</span>
                      <span>{counts.mrsOpened}</span>
                      <span>{counts.mrsMerged}</span>
                      <span>{counts.pipelines}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
