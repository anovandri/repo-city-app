import React, { useMemo } from 'react';
import { REPOS } from '../constants/repos.js';

const GITLAB_NAMESPACE = 'https://gitlab.com/dk-digital-bank/services';

function mrBadgeClass(count) {
  if (count >= 6) return 'mr-badge high';
  if (count >= 3) return 'mr-badge medium';
  if (count >= 1) return 'mr-badge low';
  return 'mr-badge zero';
}

/**
 * MRPanel — overlay listing all repos sorted by open MR count.
 *
 * Props:
 *   mrMap       — { [repoSlug]: count }
 *   mrListUrls  — { [repoSlug]: gitlabMrListUrl } from /api/repos
 *   onClose     — () => void
 */
export const MRPanel = React.memo(function MRPanel({ mrMap, mrListUrls = {}, onClose }) {
  const sorted = useMemo(() => {
    return REPOS
      .map(r => ({ ...r, count: mrMap[r.name] ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [mrMap]);

  const total = useMemo(
    () => sorted.reduce((s, r) => s + r.count, 0),
    [sorted],
  );

  // Build the MR list URL: prefer the backend-provided URL (which has the real
  // namespace path), fall back to constructing one from the known namespace.
  function mrUrl(slug) {
    return mrListUrls[slug]
      ?? `${GITLAB_NAMESPACE}/${slug}/-/merge_requests`;
  }

  return (
    <div className="panel-overlay mr-panel">
      <div className="panel-header">
        <span>🔀 Open Merge Requests</span>
        <span className="panel-total">{total} total</span>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="panel-body">
        {sorted.map(repo => (
          <a
            key={repo.id}
            className="mr-row"
            href={mrUrl(repo.name)}
            target="_blank"
            rel="noreferrer"
          >
            <span className="mr-icon">{repo.icon}</span>
            <span className="mr-name">{repo.name.replace('ms-partner-', '').replace('ms-pip-', '').replace('ms-', '')}</span>
            <span className={mrBadgeClass(repo.count)}>{repo.count}</span>
          </a>
        ))}
      </div>
    </div>
  );
});
