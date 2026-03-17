import React, { useEffect, useState } from 'react';

/**
 * MergeRequests — dedicated panel for viewing recent MRs with full descriptions.
 * 
 * Fetches last 10 MRs from /api/merge-requests/recent and displays them
 * in a readable format with clickable links to GitLab.
 * 
 * Props:
 *   onClose — () => void
 */
export const MergeRequests = React.memo(function MergeRequests({ onClose }) {
  const [mrs, setMrs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch('/api/merge-requests/recent?limit=10', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then(data => {
        if (mounted) {
          setMrs(data);
          setLoading(false);
        }
      });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="panel-overlay merge-requests-panel">
      <div className="panel-header">
        <span>📋 Recent Merge Requests</span>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="panel-body">
        {loading ? (
          <div className="mr-loading">Loading merge requests...</div>
        ) : mrs.length === 0 ? (
          <div className="mr-empty">No recent merge requests found.</div>
        ) : (
          <div className="mr-list">
            {mrs.map((mr, i) => (
              <div key={i} className="mr-card">
                <div className="mr-card-header">
                  <a 
                    href={mr.web_url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="mr-card-title"
                  >
                    {mr.title}
                  </a>
                  <span className="mr-card-repo">{mr.repoSlug}</span>
                </div>
                {mr.description && (
                  <div className="mr-card-description">
                    {mr.description}
                  </div>
                )}
                <div className="mr-card-footer">
                  <span className="mr-card-date">
                    Updated: {new Date(mr.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
