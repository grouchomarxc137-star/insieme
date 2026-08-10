import { useCallback, useEffect, useState } from 'react';

const POLL_MS = 15000;

// user is the viewer identity, sent as a query param so the server can keep
// each account's personal tickets private instead of just hiding them
// client-side (see ticketsRepo.listTicketsForViewer).
export function useTickets(user) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/tickets?viewer=${encodeURIComponent(user || '')}`);
      if (!response.ok) throw new Error('Could not load tickets.');
      const data = await response.json();
      setTickets(data.tickets);
      setError(null);
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

  async function createTicket(payload) {
    const response = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not send the ticket.');
    setTickets((prev) => [data.ticket, ...prev]);
    return data.ticket;
  }

  async function updateTicket(id, payload) {
    const response = await fetch(`/api/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not update the ticket.');
    setTickets((prev) => prev.map((ticket) => (ticket.id === id ? data.ticket : ticket)));
    return data.ticket;
  }

  async function deleteTicket(id) {
    const response = await fetch(`/api/tickets/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not delete the ticket.');
    setTickets((prev) => prev.filter((ticket) => ticket.id !== id));
  }

  return { tickets, loading, error, refresh, createTicket, updateTicket, deleteTicket };
}
