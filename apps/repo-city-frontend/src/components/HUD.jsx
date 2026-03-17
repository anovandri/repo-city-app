import React from 'react';

/**
 * HUD — top-left stats panel.
 *
 * Props:
 *   stats         — { repoCount, activeDeveloperCount, totalCommits, openMrCount }
 *   onOpenMRPanel — () => void
 *   onOpenMRDetails — () => void
 *   onOpenDevPanel— () => void
 *   onOpenLeaderboardPanel — () => void
 */
export const HUD = React.memo(function HUD({ stats, onOpenMRPanel, onOpenMRDetails, onOpenDevPanel, onOpenLeaderboardPanel }) {
  return (
    <div className="hud-panel">
      <div className="hud-title">🏙 Repo City</div>
      <div className="hud-stat">
        <span className="hud-stat-label">Repositories</span>
        <span className="hud-stat-value">{stats.repoCount}</span>
      </div>
      <div className="hud-stat">
        <span className="hud-stat-label">🟢 Developers Active</span>
        <span className="hud-stat-value">{stats.activeDeveloperCount}</span>
      </div>
      <div className="hud-stat">
        <span className="hud-stat-label">🔀 Open MRs</span>
        <span className="hud-stat-value">{stats.openMrCount}</span>
      </div>
      <div className="hud-buttons">
        <button className="hud-btn" onClick={onOpenMRPanel}>🔀 Open MRs</button>
        <button className="hud-btn" onClick={onOpenMRDetails}>📋 Recent MRs</button>
        <button className="hud-btn" onClick={onOpenDevPanel}>👤 Dev Profile</button>
        <button className="hud-btn" onClick={onOpenLeaderboardPanel}>🏆 City Leaderboard</button>
      </div>
    </div>
  );
});
