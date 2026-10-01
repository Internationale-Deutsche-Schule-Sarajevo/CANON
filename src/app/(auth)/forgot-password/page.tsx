"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/reset-password` },
    );

    if (resetError) {
      setError("Nije moguće poslati email za reset lozinke. Pokušajte ponovo.");
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--neutral-paper)",
        padding: "var(--space-6)",
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ textAlign: "center", marginBottom: "var(--space-8)" }}>
          <h1
            style={{
              fontSize: "var(--text-heading)",
              color: "var(--idss-dark-blue)",
              marginBottom: "var(--space-2)",
            }}
          >
            Reset lozinke
          </h1>
          <p style={{ color: "var(--neutral-ash)" }}>
            Unesite email adresu svog računa.
          </p>
        </div>

        {sent ? (
          <p style={{ color: "var(--neutral-graphite)", textAlign: "center" }}>
            Ako račun postoji, email za reset lozinke je poslan. Provjerite
            inbox.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label
              htmlFor="email"
              style={{
                display: "block",
                marginBottom: "var(--space-2)",
                fontWeight: "var(--weight-bold)",
                color: "var(--neutral-graphite)",
              }}
            >
              Email adresa
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="ime@idss.ba"
              style={{
                width: "100%",
                padding: "var(--space-3) var(--space-4)",
                border: "2px solid var(--neutral-border)",
                borderRadius: "var(--radius)",
                fontSize: "var(--text-body)",
                fontFamily: "var(--font-primary)",
                marginBottom: "var(--space-4)",
              }}
            />

            {error && (
              <div
                style={{
                  background: "#ffe0e0",
                  border: "1px solid var(--idss-red)",
                  borderRadius: "var(--radius)",
                  padding: "var(--space-3) var(--space-4)",
                  marginBottom: "var(--space-4)",
                  color: "var(--idss-red)",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ width: "100%" }}
            >
              {loading ? "Slanje..." : "Pošalji link za reset"}
            </button>
          </form>
        )}

        <p
          style={{
            textAlign: "center",
            marginTop: "var(--space-6)",
            fontSize: "var(--text-body)",
          }}
        >
          <Link
            href="/login"
            style={{
              color: "var(--idss-dark-blue)",
              fontWeight: "var(--weight-bold)",
            }}
          >
            Nazad na prijavu
          </Link>
        </p>
      </div>
    </div>
  );
}
