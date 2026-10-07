import { Link } from 'react-router-dom';

export default function Wordmark({ to = '/', className = '' }) {
  return (
    <Link to={to} className={`wordmark ${className}`.trim()}>
      <span className="wordmark-name">Yakwetu</span>
      <span className="wordmark-tag">Sinema</span>
    </Link>
  );
}
