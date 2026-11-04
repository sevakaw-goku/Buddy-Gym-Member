import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AcceptInvitation from './invitations/AcceptInvitation';
import './styles.css';

function InvitationRouter() {
  const [token, setToken] = React.useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get('invite'),
  );
  React.useEffect(() => {
    const change = () =>
      setToken(
        new URLSearchParams(window.location.hash.slice(1)).get('invite'),
      );
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  return token !== null ? <AcceptInvitation token={token} /> : <App />;
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <InvitationRouter />
  </React.StrictMode>,
);
