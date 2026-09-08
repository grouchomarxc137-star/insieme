import { useState } from 'react';
import TopBar from './components/TopBar.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import CharacterPage from './pages/CharacterPage.jsx';
import PlantPage from './pages/PlantPage.jsx';
import MomentsPage from './pages/MomentsPage.jsx';
import TicketsPage from './pages/TicketsPage.jsx';
import ResetRoomPage from './pages/ResetRoomPage.jsx';
import ResetRoomSession from './pages/ResetRoomSession.jsx';
import CheckInPage from './pages/CheckInPage.jsx';
import { getResetSessionIdFromPath } from './lib/resetRoomRoute.js';
import './App.css';

export const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'character', label: 'Character' },
  { id: 'plant', label: 'Plant' },
  { id: 'moments', label: 'Moments' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'reset', label: 'Reset Room' },
  { id: 'checkin', label: 'Check-in' },
];

const PAGES = {
  home: HomePage,
  calendar: CalendarPage,
  character: CharacterPage,
  plant: PlantPage,
  moments: MomentsPage,
  tickets: TicketsPage,
  reset: ResetRoomPage,
  checkin: CheckInPage,
};

const AUTH_STORAGE_KEY = 'lovissimi-user';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [user, setUser] = useState(() => {
    try {
      return localStorage.getItem(AUTH_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  function handleLogin(person) {
    setUser(person);
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, person);
    } catch {
      /* localStorage unavailable, session just won't persist */
    }
  }

  function handleLogout() {
    setUser(null);
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      /* localStorage unavailable, nothing to clear */
    }
  }

  // A Reset Room session link is meant to work standalone — whoever opens it
  // (from Discord or otherwise) joins straight into the session with its own
  // role-claim system, without needing to log into the rest of the app first.
  const resetSessionId = getResetSessionIdFromPath();
  if (resetSessionId) {
    return <ResetRoomSession sessionId={resetSessionId} />;
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const ActivePage = PAGES[activeTab];

  return (
    <div className="app-shell">
      <TopBar activeTab={activeTab} onSelectTab={setActiveTab} user={user} onLogout={handleLogout} />
      <main className="app-main">
        <ActivePage user={user} />
      </main>
    </div>
  );
}
