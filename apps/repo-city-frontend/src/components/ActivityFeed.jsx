import React, { useState, useEffect, useCallback, useRef } from 'react';

/**
 * ActivityFeed — terminal-style top-right ticker.
 *
 * Each incoming event goes through three phases:
 *   1. "walking"  — developer is en-route (shows "waiting for developer...")
 *   2. "typing"   — beam fired; line types itself out character by character
 *   3. "complete" — line flashes then fades out
 *
 * External API (via feedRef):
 *   const id = feedRef.current.push(event)   — add a new line, returns id
 *   feedRef.current.complete(id)             — mark line as complete (beam fired, start typing)
 */

const TYPE_SPEED_MS  = 28;   // ms per character
const COMPLETE_LINGER = 2200; // ms to linger after complete flash
const MAX_LINES      = 25;   // limit to 25 rows as requested

// Event-type → accent colour class
const TYPE_CLASS = {
  COMMIT_BEAM:      'af-commit',
  MR_OPENED_BEAM:   'af-mr',
  MERGE_SUCCESS:    'af-merge',
  PIPELINE_RUNNING: 'af-pipeline',
  PIPELINE_SUCCESS: 'af-pipeline',
  PIPELINE_FAILED:  'af-pipeline-fail',
};

// Friendly verb per type
const TYPE_VERB = {
  COMMIT_BEAM:      'committed to',
  MR_OPENED_BEAM:   'opened MR on',
  MERGE_SUCCESS:    'merged into',
  PIPELINE_RUNNING: 'triggered pipeline on',
  PIPELINE_SUCCESS: 'pipeline passed on',
  PIPELINE_FAILED:  'pipeline FAILED on',
};

const TYPE_ICON = {
  COMMIT_BEAM:      '⬡',
  MR_OPENED_BEAM:   '⬡',
  MERGE_SUCCESS:    '⬡',
  PIPELINE_RUNNING: '⬡',
  PIPELINE_SUCCESS: '⬡',
  PIPELINE_FAILED:  '⬡',
};

let _feedId = 0;

export function ActivityFeed({ feedRef }) {
  const [lines, setLines]     = useState([]);
  const linesRef              = useRef(lines);
  const timersRef             = useRef({});

  // Keep linesRef in sync with lines state for access in callbacks
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  // ── push(event) → id ─────────────────────────────────────────────────────
  const push = useCallback((event) => {
    const id        = event.id ?? ++_feedId; // Use event.id for synchronization
    const typeClass = TYPE_CLASS[event.hint] ?? 'af-commit';
    const verb      = TYPE_VERB[event.hint]  ?? 'acted on';

    // Full line text (typed out when beam fires)
    const actorPart = event.actorDisplayName
      ? `${event.actorDisplayName}`
      : 'Pipeline';
    const repoPart  = event.repoSlug ?? '?';
    const fullText  = `${actorPart} ${verb} ${repoPart}`;

    const line = {
      id,
      fullText,
      displayed: 'waiting for developer...', // Initially shows "waiting"
      typeClass,
      phase: 'walking', // Start in walking phase (waiting for beam)
      ts: new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
      hint: event.hint,
      repoIcon: event.repoIcon ?? '🏢',
    };

    setLines(prev => {
      const next = [...prev, line];
      return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
    });

    return id;
  }, []);

  // ── complete(id) → start typing then flash and remove ───────────────────
  const complete = useCallback((id) => {
    // Find the line to get its fullText
    const lineRef = { current: null };
    setLines(prev => {
      const line = prev.find(l => l.id === id);
      if (line) lineRef.current = line;
      // Switch to typing phase and clear displayed text
      return prev.map(l =>
        l.id === id ? { ...l, phase: 'typing', displayed: '' } : l
      );
    });

    if (!lineRef.current) return;

    const fullText = lineRef.current.fullText;
    
    // Start typewriter effect
    let charIdx = 0;
    const type = () => {
      charIdx++;
      setLines(prev => prev.map(l =>
        l.id === id ? { ...l, displayed: fullText.slice(0, charIdx) } : l
      ));
      if (charIdx < fullText.length) {
        timersRef.current[`type_${id}`] = setTimeout(type, TYPE_SPEED_MS);
      } else {
        // Typing done → switch to complete phase then remove
        setLines(prev => prev.map(l => l.id === id ? { ...l, phase: 'complete' } : l));
        
        timersRef.current[`done_${id}`] = setTimeout(() => {
          setLines(prev => prev.filter(l => l.id !== id));
          delete timersRef.current[`type_${id}`];
          delete timersRef.current[`done_${id}`];
        }, COMPLETE_LINGER);
      }
    };
    timersRef.current[`type_${id}`] = setTimeout(type, TYPE_SPEED_MS);
  }, []);

  // Expose API via ref
  useEffect(() => {
    if (feedRef) feedRef.current = { push, complete };
    return () => { if (feedRef) feedRef.current = null; };
  }, [feedRef, push, complete]);

  // Clean up all timers on unmount
  useEffect(() => () => {
    Object.values(timersRef.current).forEach(clearTimeout);
  }, []);

  if (!lines.length) return null;

  return (
    <div className="af-container">
      {/* Terminal header bar */}
      <div className="af-header">
        <span className="af-dot af-dot-red"   />
        <span className="af-dot af-dot-yellow"/>
        <span className="af-dot af-dot-green" />
        <span className="af-header-title">activity.log</span>
      </div>

      {/* Lines */}
      <div className="af-body">
        {lines.map(line => (
          <div
            key={line.id}
            className={`af-line af-line-${line.phase} ${line.typeClass}`}
          >
            {/* Timestamp */}
            <span className="af-ts">{line.ts}</span>

            {/* Repo icon */}
            <span className="af-repo-icon">{line.repoIcon}</span>

            {/* The typed text */}
            <span className="af-text">
              {line.displayed}
              {/* Blinking cursor while typing or walking */}
              {(line.phase === 'typing' || line.phase === 'walking') && (
                <span className={`af-cursor ${line.phase === 'walking' ? 'af-cursor-walk' : ''}`}>▋</span>
              )}
              {/* Walking indicator */}
              {line.phase === 'walking' && (
                <span className="af-walking"> 🚶</span>
              )}
              {/* Done tick */}
              {line.phase === 'complete' && (
                <span className="af-done"> ✓</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
