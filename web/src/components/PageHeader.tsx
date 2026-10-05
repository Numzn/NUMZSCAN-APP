import { useEffect, useRef, type ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

interface PageHeaderProps {
  title: string;
  crumbs?: Crumb[];
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}

// The only component that renders a page title. It also sets the browser tab title.
export function PageHeader({ title, crumbs, description, badge, actions }: PageHeaderProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = `${title} · EventPass`;
  }, [title]);

  // A new page moves focus to its heading, so keyboard and screen-reader users start at the top of it.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <header className="page-header">
      {crumbs && crumbs.length > 1 && <Breadcrumbs items={crumbs} />}
      <div className="page-head">
        <div className="page-title">
          <div className="page-title-line">
            <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
            {badge}
          </div>
          {description && <p className="meta">{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  );
}
