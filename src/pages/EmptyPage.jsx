import './EmptyPage.css';

export default function EmptyPage({ icon, title, description }) {
  return (
    <div className="page">
      <div className="page-header">
        <h1>{title}</h1>
      </div>
      <div className="empty-card">
        <span className="empty-icon">{icon}</span>
        <h2>Coming soon</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}
