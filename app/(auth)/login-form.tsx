"use client";

import { useState, type FormEvent } from "react";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import styles from "./login-form.module.css";

const NOT_ALLOWED = "Tenhle e-mail nemá přístup. Zeptej se admina, ať tě přidá.";
const RATE_LIMIT = "Posílali jsme moc odkazů. Zkus to prosím za chvíli znovu.";
const CALLBACK_FAILED = "Přihlášení se nepodařilo dokončit. Zkus to prosím znovu.";
const GENERIC_ERROR = "Nepovedlo se to. Zkus to prosím za chvíli.";

const NOT_ALLOWED_CODES = new Set([
  "signup_disabled",
  "otp_disabled",
  "email_not_authorized",
  "user_not_found",
]);

const RATE_LIMIT_CODES = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
]);

function mapAuthError(error: AuthError | null | undefined): string {
  if (!error) return GENERIC_ERROR;
  if (error.code && NOT_ALLOWED_CODES.has(error.code)) return NOT_ALLOWED;
  if (error.code && RATE_LIMIT_CODES.has(error.code)) return RATE_LIMIT;
  // Fallback by status + message — Supabase doesn't always set error.code.
  if (error.status === 422 && /signups?\s+not\s+allowed/i.test(error.message)) {
    return NOT_ALLOWED;
  }
  if (error.status === 429) return RATE_LIMIT;
  return GENERIC_ERROR;
}

function mapInitialError(code?: string): string | null {
  if (!code) return null;
  if (code === "auth_callback") return CALLBACK_FAILED;
  return GENERIC_ERROR;
}

export function LoginForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");
  const [error, setError] = useState<string | null>(mapInitialError(initialError));

  const supabase = createClient();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus("loading");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false,
      },
    });

    if (error) {
      setError(mapAuthError(error));
      setStatus("idle");
      return;
    }

    setStatus("sent");
  }

  async function onGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(mapAuthError(error));
  }

  if (status === "sent") {
    return (
      <div className={styles.wrap}>
        <p className={styles.success}>
          Mrkni do mailu — poslali jsme ti přihlašovací odkaz na <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.heading}>Přihlášení</h1>
      <p className={styles.lede}>
        Zadej e-mail, na který tě admin přidal — pošleme ti odkaz na jedno kliknutí.
      </p>

      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.label} htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          className={styles.input}
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "loading"}
        />
        <button className={styles.button} type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Posílám…" : "Pošli mi přihlašovací odkaz"}
        </button>
      </form>

      <div className={styles.divider}>nebo</div>

      <button className={styles.google} type="button" onClick={onGoogle}>
        Přihlásit přes Google
      </button>

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
