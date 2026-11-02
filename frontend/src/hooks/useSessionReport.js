import { useEffect, useState } from 'react';
import api from '../api/client';

// Bounded, short-lived reuse across report/statistics tabs. Never reuse failures.
const pending = new Map();
const cached = new Map();
const MAX_AGE_MS = 10000;
function load(sessionId, force) {
  const previous = cached.get(sessionId);
  if (!force && previous && Date.now() - previous.fetchedAt < MAX_AGE_MS) return Promise.resolve(previous);
  if (!pending.has(sessionId)) {
    const request = api.get(`/trainer/sessions/${sessionId}/report`).then((response) => {
      const data = { report: response.data, fetchedAt: Date.now() };
      cached.delete(sessionId);
      cached.set(sessionId, data);
      if (cached.size > 8) cached.delete(cached.keys().next().value);
      return data;
    });
    pending.set(sessionId, request);
    request.then(() => pending.delete(sessionId), () => pending.delete(sessionId));
  }
  return pending.get(sessionId);
}
export function useSessionReport(sessionId, retry = 0) {
  const [state, setState] = useState({ id: sessionId, loading: true });
  useEffect(() => {
    let current = true;
    load(sessionId, retry > 0).then((data) => {
      if (current) setState({ id: sessionId, retry, ...data });
    }, () => {
      if (current) setState({ id: sessionId, retry, error: true });
    });
    return () => { current = false; };
  }, [sessionId, retry]);
  return state.id === sessionId && (state.retry ?? 0) === retry ? state : { loading: true };
}
