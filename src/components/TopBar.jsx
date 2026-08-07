import { TABS } from '../App.jsx';
import './TopBar.css';

export default function TopBar({ activeTab, onSelectTab, user, onLogout }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-brand pixel-font">
          <img
            src="/logo.png"
            alt="Lovissimi"
            width={26}
            height={26}
            style={{ width: 26, height: 26, borderRadius: '22%', objectFit: 'cover' }}
          />
          <span className="topbar-brand-name">Lovissimi</span>
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
