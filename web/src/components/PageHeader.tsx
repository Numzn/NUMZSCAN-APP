import { useEffect, type ReactNode } from "react";
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
  useEffect(() => {
    document.title = `${title} · EventPass`;
  }, [title]);

  return (
    <header className="page-header">
      {crumbs && crumbs.length > 1 && <Breadcrumbs items={crumbs} />}
      <div className="page-head">
        <div className="page-title">
          <div className="page-title-line">
            <h1>{title}</h1>
            {badge}
          </div>
          {description && <p className="meta">{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  );
}
