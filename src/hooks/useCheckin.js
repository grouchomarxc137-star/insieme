import { useCallback, useEffect, useState } from 'react';

const POLL_MS = 15000;

// Server-backed (not localStorage) — this is the one place in the app where
// "both of you" needs to be trustworthy regardless of whose device is open.
export function useCheckin(type) {
  const [checkin, setCheckin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/checkins/${type}`);
      if (!response.ok) throw new Error('Could not load check-in status.');
      setCheckin(await response.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function submit(participant, responses) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/checkins/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant, responses }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not submit check-in.');
      setCheckin(data);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return { checkin, loading, submitting, error, submit };
}
