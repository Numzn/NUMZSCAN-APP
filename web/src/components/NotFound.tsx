import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <section className="not-found">
      <h1>Page not found</h1>
      <p className="meta">Check the address, or go back to <Link to="/">your events</Link>.</p>
    </section>
  );
}
