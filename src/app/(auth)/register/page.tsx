"use client";

import { useState } from "react";
import { registerAction } from "@/features/authentication/actions";
import Link from "next/link";

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const result = await registerAction(formData);

    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error ?? "Greška pri registraciji.");
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-6)",
        }}
      >
        <div
          className="card"
          style={{ maxWidth: "420px", textAlign: "center" }}
        >
          <div style={{ fontSize: "48px", marginBottom: "var(--space-4)" }}>
            ✅
          </div>
          <h2
            style={{
              color: "var(--idss-dark-blue)",
              marginBottom: "var(--space-4)",
            }}
          >
            Zahtjev poslan
          </h2>
          <p style={{ color: "var(--neutral-ash)" }}>
            Vaš zahtjev za pristup je poslan direktoru škole. Dobit ćete email
            obavijest čim bude obrađen.
          </p>
        </div>
      </div>
    );
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
            Zatražite pristup
          </h1>
          <p style={{ color: "var(--neutral-ash)" }}>
            IDSS Handbook — P.U. IDSS Sarajevo
          </p>
        </div>

        <form action={handleSubmit}>
          <div style={{ marginBottom: "var(--space-4)" }}>
            <label
              style={{
                display: "block",
                marginBottom: "var(--space-2)",
                fontWeight: "var(--weight-bold)",
                color: "var(--neutral-graphite)",
              }}
            >
              Ime i prezime
            </label>
            <input
              type="text"
              name="full_name"
              required
              placeholder="Vaše ime i prezime"
              style={{
                width: "100%",
                padding: "var(--space-3) var(--space-4)",
                border: "2px solid var(--neutral-border)",
                borderRadius: "var(--radius)",
                fontSize: "var(--text-body)",
                fontFamily: "var(--font-primary)",
              }}
            />
          </div>

          <div style={{ marginBottom: "var(--space-4)" }}>
            <label
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
              type="email"
              name="email"
              required
              placeholder="ime@idss.ba"
              style={{
                width: "100%",
                padding: "var(--space-3) var(--space-4)",
                border: "2px solid var(--neutral-border)",
                borderRadius: "var(--radius)",
                fontSize: "var(--text-body)",
                fontFamily: "var(--font-primary)",
              }}
            />
          </div>

          <div style={{ marginBottom: "var(--space-4)" }}>
            <label
              style={{
                display: "block",
                marginBottom: "var(--space-2)",
                fontWeight: "var(--weight-bold)",
                color: "var(--neutral-graphite)",
              }}
            >
              Lozinka
            </label>
            <input
              type="password"
              name="password"
              required
              placeholder="Minimum 8 karaktera"
              style={{
                width: "100%",
                padding: "var(--space-3) var(--space-4)",
                border: "2px solid var(--neutral-border)",
                borderRadius: "var(--radius)",
                fontSize: "var(--text-body)",
                fontFamily: "var(--font-primary)",
              }}
            />
          </div>

          <div style={{ marginBottom: "var(--space-6)" }}>
            <label
              style={{
                display: "block",
                marginBottom: "var(--space-2)",
                fontWeight: "var(--weight-bold)",
                color: "var(--neutral-graphite)",
              }}
            >
              Uloga
            </label>
            <select
              name="role_requested"
              style={{
                width: "100%",
                padding: "var(--space-3) var(--space-4)",
                border: "2px solid var(--neutral-border)",
                borderRadius: "var(--radius)",
                fontSize: "var(--text-body)",
                fontFamily: "var(--font-primary)",
                background: "white",
              }}
            >
              <option value="user">Nastavnik / Zaposlenik</option>
              <option value="admin">Admin (Pedagog / Sekretar)</option>
            </select>
          </div>

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
            {loading ? "Slanje..." : "Pošalji zahtjev"}
          </button>
        </form>

        <p
          style={{
            textAlign: "center",
            marginTop: "var(--space-6)",
            color: "var(--neutral-ash)",
          }}
        >
          Već imate račun?{" "}
          <Link
            href="/login"
            style={{
              color: "var(--idss-dark-blue)",
              fontWeight: "var(--weight-bold)",
            }}
          >
            Prijavite se
          </Link>
        </p>
      </div>
    </div>
  );
}
