"use client";

import { useState } from "react";
import styles from "./ThemeToggle.module.css";

type Theme = "light" | "dark";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type Props = {
  /** Cookie value from the server. `null` means "no cookie set"; we default
   *  to "light" on both server and client to keep hydration in sync. (CSS
   *  still follows `prefers-color-scheme` automatically when no data-theme
   *  attribute is set, so the page looks right regardless — only the toggle
   *  icon defaults to "moon" until the user clicks it.) */
  initialTheme: Theme | null;
};

export function ThemeToggle({ initialTheme }: Props) {
  const [theme, setThemeState] = useState<Theme>(initialTheme ?? "light");

  function setTheme(next: Theme) {
    setThemeState(next);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next);
      // Cookie so the server can render with the right attribute on next request.
      document.cookie = `vft-theme=${next};path=/;max-age=${ONE_YEAR_SECONDS};samesite=lax`;
    }
  }

  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = theme === "dark" ? "Přepnout na světlý režim" : "Přepnout na tmavý režim";

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
    >
      {theme === "dark" ? (
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ) : (
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
    </button>
  );
}
