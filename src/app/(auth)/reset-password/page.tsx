"use client";

/**
 * /reset-password — korisnik postavlja novu lozinku nakon klika na email link.
 *
 * ARHITEKTURA (usklađeno s Commander A-8 / DL-005 i free-tier realnošću):
 * Supabase free tier šalje implicit-flow linkove (#access_token u hashu).
 * Sesija oporavka tako živi u BROWSER klijentu, ne u cookie-ju, pa
 * updateUser() MORA ići preko createSupabaseBrowserClient() na klijentu —
 * Server Action ne bi vidio ovu sesiju. Ako projekat pređe na plaćeni plan /
 * custom SMTP s token_hash linkovima, migrirati na Server Action + /auth/confirm
 * (cookie sesija). Vidi corrections/SPRINT_LESSONS_AUTH.md.
 *
 * Pravila validacije su u ResetPasswordSchema (lib/validation/schemas.ts),
 * NE inline u ovoj komponenti (E-2, M-7, E-11).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";
import { ResetPasswordSchema } from "@/lib/validation/schemas";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const parsed = ResetPasswordSchema.safeParse({
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      setLoading(false);
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });

      if (updateError) {
        console.error(
          "[reset-password] updateUser failed:",
          updateError.message,
        );
        if (updateError.message.includes("should be different")) {
          setError("Nova lozinka mora biti različita od stare.");
        } else if (updateError.message.includes("session")) {
          setError(
            "Sesija za promjenu lozinke je istekla. Zatražite novi link.",
          );
        } else {
          setError("Greška pri postavljanju lozinke. Zatražite novi link.");
        }
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/handbook"), 2000);
    } catch (err) {
      console.error("[reset-password] unexpected error:", err);
      setError("Neočekivana greška. Pokušajte ponovo.");
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
            Nova lozinka
          </h1>
          <p
            style={{
              color: "var(--neutral-ash)",
              fontSize: "var(--text-body)",
            }}
          >
            Unesite novu lozinku za vaš račun
          </p>
        </div>

        {success ? (
          <div
            style={{
              background: "var(--game-green-light)",
              border: "1px solid var(--game-green-mid)",
              borderRadius: "var(--radius)",
              padding: "var(--space-4)",
              textAlign: "center",
              color: "var(--neutral-graphite)",
              fontSize: "var(--text-body)",
            }}
          >
            <p style={{ fontWeight: "var(--weight-bold)" }}>
              Lozinka uspješno postavljena
            </p>
            <p style={{ marginTop: "var(--space-2)" }}>Preusmjeravanje...</p>
          </div>
        ) : (
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
                Nova lozinka
              </label>
              <input
                type="password"
                name="password"
                required
                placeholder="Najmanje 8 karaktera"
                autoFocus
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
                Potvrdite lozinku
              </label>
              <input
                type="password"
                name="confirmPassword"
                required
                placeholder="Ponovite lozinku"
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
              {loading ? "Postavljanje..." : "Postavi novu lozinku"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
