import { useCallback, useEffect, useState } from 'react';

const POLL_MS = 30000;

// Shared list of relationship milestones behind the Moments counters. Polls
// so a date one person adds shows up on the other's screen within POLL_MS,
// same pattern as useTickets.
export function useMilestones() {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/milestones');
      if (!response.ok) throw new Error('Could not load moments.');
      const data = await response.json();
      setMilestones(data.milestones);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function createMilestone(payload) {
    const response = await fetch('/api/milestones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not add the moment.');
    setMilestones((prev) => [...prev, data.milestone]);
    return data.milestone;
  }

  async function updateMilestone(id, payload) {
    const response = await fetch(`/api/milestones/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not update the moment.');
    setMilestones((prev) => prev.map((m) => (m.id === id ? data.milestone : m)));
    return data.milestone;
  }

  async function deleteMilestone(id) {
    const response = await fetch(`/api/milestones/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not remove the moment.');
    setMilestones((prev) => prev.filter((m) => m.id !== id));
  }

  return { milestones, loading, error, refresh, createMilestone, updateMilestone, deleteMilestone };
}
