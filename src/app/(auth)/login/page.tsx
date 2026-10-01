"use client";

import { useState } from "react";
import { loginAction } from "@/features/authentication/actions";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const result = await loginAction(formData);

    if (result.success && result.redirectTo) {
      router.push(result.redirectTo);
    } else {
      setError(result.error ?? "Greška pri prijavi.");
      setLoading(false);
    }
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
          <div
            style={{
              width: "64px",
              height: "64px",
              background: "var(--idss-dark-blue)",
              borderRadius: "var(--radius)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto var(--space-4)",
              color: "white",
              fontWeight: "var(--weight-bold)",
              fontSize: "var(--text-heading-sm)",
            }}
          >
            IDSS
          </div>
          <h1
            style={{
              fontSize: "var(--text-heading)",
              color: "var(--idss-dark-blue)",
              marginBottom: "var(--space-2)",
            }}
          >
            IDSS Handbook
          </h1>
          <p
            style={{
              color: "var(--neutral-ash)",
              fontSize: "var(--text-body)",
            }}
          >
            Prijavite se na vaš račun
          </p>
        </div>

        <form action={handleSubmit}>
          <div style={{ marginBottom: "var(--space-4)" }}>
            <label
              style={{
                display: "block",
                marginBottom: "var(--space-2)",
                fontWeight: "var(--weight-bold)",
                fontSize: "var(--text-body)",
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
                outline: "none",
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
                fontSize: "var(--text-body)",
                color: "var(--neutral-graphite)",
              }}
            >
              Lozinka
            </label>
            <input
              type="password"
              name="password"
              required
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "var(--space-3) var(--space-4)",
                border: "2px solid var(--neutral-border)",
                borderRadius: "var(--radius)",
                fontSize: "var(--text-body)",
                outline: "none",
                fontFamily: "var(--font-primary)",
              }}
            />
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
                fontSize: "var(--text-body)",
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
            {loading ? "Prijavljivanje..." : "Prijavi se"}
          </button>
        </form>

        <p
          style={{
            textAlign: "center",
            marginTop: "var(--space-4)",
            fontSize: "var(--text-body)",
          }}
        >
          <Link
            href="/forgot-password"
            style={{
              color: "var(--idss-dark-blue)",
              fontWeight: "var(--weight-bold)",
            }}
          >
            Zaboravljena lozinka?
          </Link>
        </p>

        <p
          style={{
            textAlign: "center",
            marginTop: "var(--space-6)",
            fontSize: "var(--text-body)",
            color: "var(--neutral-ash)",
          }}
        >
          Nemate račun?{" "}
          <Link
            href="/register"
            style={{
              color: "var(--idss-dark-blue)",
              fontWeight: "var(--weight-bold)",
            }}
          >
            Zatražite pristup
          </Link>
        </p>
      </div>
    </div>
  );
}
