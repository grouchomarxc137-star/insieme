import { useState } from 'react';
import './LoginPage.css';

const PEOPLE = ['Principe', 'Principessa'];
const PASSWORD = '290126';

export default function LoginPage({ onLogin }) {
  const [person, setPerson] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    if (!person) {
      setError('Choose who you are first.');
      return;
    }
    if (password !== PASSWORD) {
      setError("That password isn't right.");
      return;
    }
    setError('');
    onLogin(person);
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand pixel-font">👑💛 Insieme</div>
        <h1>Who's this?</h1>
        <p>Pick your person and enter the password to see your character.</p>

        <label className="login-field">
          <span>Person</span>
          <select
            value={person}
            onChange={(event) => {
              setPerson(event.target.value);
              setError('');
            }}
          >
            <option value="" disabled>
              Select a person
            </option>
            {PEOPLE.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError('');
            }}
            placeholder="••••••"
          />
        </label>

        {error && <p className="login-error">{error}</p>}

        <button type="submit" className="login-submit">
          Log in
        </button>
      </form>
    </div>
  );
}
