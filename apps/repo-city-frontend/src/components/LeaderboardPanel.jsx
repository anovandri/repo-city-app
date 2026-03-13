import React, { useState, useEffect } from 'react';

/**
 * LeaderboardPanel — shows City Leaderboard with rankings.
 *
 * Props:
 *   onClose — () => void
 */
export function LeaderboardPanel({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/leaderboard', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then(data => {
        setData(data);
        setLoading(false);
      });
  }, []);

  if (loading || !data) {
    return (
      <div className="panel-overlay" onClick={onClose}>
        <div className="panel-card" onClick={(e) => e.stopPropagation()}>
          <div className="panel-header">
            <h2>🏆 City Leaderboard</h2>
            <button className="panel-close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <div className="panel-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 14, color: '#999' }}>Loading leaderboard data...</div>
          </div>
        </div>
      </div>
    );
  }

  // Icon assignment based on rank
  const getRepoIcon = (rank) => {
    if (rank === 1) return '🏆';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    if (rank === 4) return '📊';
    return '🔔';
  };

  const getDevIcon = (rank) => {
    if (rank === 1) return '🏆';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    if (rank === 4) return '💻';
    return '⚡';
  };

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel-card" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2>🏆 City Leaderboard</h2>
          <button className="panel-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Section 1: Top Repositories (Last 7 Days) */}
          <section>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#e0e0e0' }}>
              📈 Top Repositories (Last 7 Days)
            </h3>
            {data.topRepos.length === 0 ? (
              <div style={{ fontSize: 13, color: '#999', padding: '12px 0' }}>No MR merges in the last 7 days</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.topRepos.map((repo, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 16 }}>{getRepoIcon(idx + 1)}</span>
                      <span style={{ fontWeight: 500 }}>{repo.name}</span>
                    </div>
                    <span style={{ color: '#4ade80', fontWeight: 600 }}>{repo.count} MRs merged</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 2: Top Developers (Last 7 Days) */}
          <section>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#e0e0e0' }}>
              👥 Top Developers (Last 7 Days)
            </h3>
            {data.topDevelopers.length === 0 ? (
              <div style={{ fontSize: 13, color: '#999', padding: '12px 0' }}>No commits in the last 7 days</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.topDevelopers.map((dev, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 16 }}>{getDevIcon(idx + 1)}</span>
                      <span style={{ fontWeight: 500 }}>{dev.name}</span>
                    </div>
                    <span style={{ color: '#60a5fa', fontWeight: 600 }}>{dev.count} commits</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 3: Most Active Today */}
          <section>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#e0e0e0' }}>
              🔥 Most Active Today
            </h3>
            {data.mostActiveToday.count === 0 ? (
              <div style={{ fontSize: 13, color: '#999', padding: '12px 0' }}>No commits today yet</div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.15), rgba(249, 115, 22, 0.15))',
                  borderRadius: 8,
                  border: '1px solid rgba(251, 146, 60, 0.3)',
                  fontSize: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>🔥</span>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{data.mostActiveToday.name}</span>
                </div>
                <span style={{ color: '#fb923c', fontWeight: 700, fontSize: 15 }}>
                  {data.mostActiveToday.count} commits
                </span>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
