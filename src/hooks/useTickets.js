import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_MS = 15000;

// user is the viewer identity, sent as a query param so the server can keep
// each account's personal tickets private instead of just hiding them
// client-side (see ticketsRepo.listTicketsForViewer).
export function useTickets(user) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The poll replaces the whole list, so a fetch that was already in flight
  // when a change landed is carrying data from before that change — applying
  // it would visibly undo what just happened (a calendar block snapping back
  // to the rail a moment after you dropped it). These two let a finishing
  // fetch notice that and drop its response; the next poll re-reads the
  // truth 15s later. Same guard useTaskList uses, minus the debounce: writes
  // here are already one request per user action, not one per keystroke.
  const mutationsInFlight = useRef(0);
  const lastMutationAt = useRef(0);

  const refresh = useCallback(async () => {
    const startedAt = Date.now();
    try {
      const response = await fetch(`/api/tickets?viewer=${encodeURIComponent(user || '')}`);
      if (!response.ok) throw new Error('Could not load tickets.');
      const data = await response.json();
      // The server answered, so whatever error was showing is over — that's
      // true regardless of whether this response is still worth applying.
      setError(null);
      if (mutationsInFlight.current > 0 || lastMutationAt.current >= startedAt) return;
      setTickets(data.tickets);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Every write goes through this so the guard above can see it. Failures
  // count too: a request that threw may still have been applied server-side,
  // so a fetch that overlapped it is no more trustworthy than one that
  // overlapped a success.
  async function track(operation) {
    mutationsInFlight.current += 1;
    try {
      return await operation();
    } finally {
      mutationsInFlight.current -= 1;
      lastMutationAt.current = Date.now();
    }
  }

  function createTicket(payload) {
    return track(async () => {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send the ticket.');
      setTickets((prev) => [data.ticket, ...prev]);
      return data.ticket;
    });
  }

  function updateTicket(id, payload) {
    return track(async () => {
      const response = await fetch(`/api/tickets/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the ticket.');
      setTickets((prev) => prev.map((ticket) => (ticket.id === id ? data.ticket : ticket)));
      return data.ticket;
    });
  }

  function deleteTicket(id) {
    return track(async () => {
      const response = await fetch(`/api/tickets/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not delete the ticket.');
      setTickets((prev) => prev.filter((ticket) => ticket.id !== id));
    });
  }

  return { tickets, loading, error, refresh, createTicket, updateTicket, deleteTicket };
}
