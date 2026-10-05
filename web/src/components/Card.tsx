import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

// A content container inside the workspace. Cards hold a section, never the whole page.
export function Card({ title, description, actions, footer, children }: CardProps) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p className="meta">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
      {footer && <footer className="card-footer">{footer}</footer>}
    </section>
  );
}
