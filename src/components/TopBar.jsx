import { TABS } from '../App.jsx';
import './TopBar.css';

export default function TopBar({ activeTab, onSelectTab, user, onLogout }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-brand pixel-font">
          <span className="topbar-brand-mark">👑💛</span>
          <span className="topbar-brand-name">Insieme</span>
        </div>
        <nav className="topbar-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`topbar-tab${tab.id === activeTab ? ' is-active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        {user && (
          <div className="topbar-account">
            <span className="topbar-user">{user === 'Principessa' ? '👸' : '🤴'} {user}</span>
            <button type="button" className="topbar-logout" onClick={onLogout}>
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
