import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = {
  children: ReactNode;
  nav: ReactNode;
};

export function Layout({ children, nav }: Props) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden />
            <span className="brand-text">Macro Tracker</span>
          </Link>
          <nav className="main-nav" aria-label="Primary">
            {nav}
          </nav>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <p>Macros per recipe are stored as totals for the listed servings. Adjust batch size on the meal plan.</p>
      </footer>
    </div>
  );
}
