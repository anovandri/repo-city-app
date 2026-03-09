import React, { useState, useEffect, useCallback, useRef } from 'react';

const TOAST_DURATION = 4500; // ms
const MAX_TOASTS     = 4;

let _toastId = 0;

/**
 * Toast — bottom-center notification stack.
 *
 * Props:
 *   toastRef — ref filled with addToast(message, type) function
 */
export function Toast({ toastRef }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const addToast = useCallback((message, type = '') => {
    const id = ++_toastId;
    setToasts(prev => {
      const next = [...prev, { id, message, type }];
      return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
    });
    timersRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timersRef.current[id];
    }, TOAST_DURATION);
  }, []);

  // Expose addToast via ref for imperative calls from WebSocket handler
  useEffect(() => {
    if (toastRef) toastRef.current = addToast;
    return () => { if (toastRef) toastRef.current = null; };
  }, [addToast, toastRef]);

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type?.toLowerCase?.().replace('_beam','').replace('_success','') ?? ''}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
