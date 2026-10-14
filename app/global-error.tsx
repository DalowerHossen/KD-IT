// path: app/global-error.tsx
"use client";

import type { ReactElement } from "react";

export interface GlobalErrorProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

/**
 * Last-resort boundary when the root layout itself fails. Styles are inline
 * because the global stylesheet cannot be guaranteed to have loaded.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps): ReactElement {
  return (
    <html lang="en" dir="ltr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          backgroundColor: "#ffffff",
          color: "#0f172a",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#475569", marginBottom: "1rem" }}>
            The application could not recover by itself. Reload to try again; your data remains
            safe.
          </p>
          {error.digest === undefined ? null : (
            <p
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.875rem",
                backgroundColor: "#f1f5f9",
                borderRadius: "0.375rem",
                padding: "0.5rem 0.75rem",
                marginBottom: "1rem",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              backgroundColor: "#1d4ed8",
              color: "#ffffff",
              border: "none",
              borderRadius: "0.375rem",
              padding: "0.75rem 1.5rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
