export default function PendingPage() {
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
      <div className="card" style={{ maxWidth: "420px", textAlign: "center" }}>
        <div style={{ fontSize: "48px", marginBottom: "var(--space-4)" }}>
          ⏳
        </div>
        <h2
          style={{
            color: "var(--idss-dark-blue)",
            marginBottom: "var(--space-4)",
          }}
        >
          Čeka se odobrenje
        </h2>
        <p style={{ color: "var(--neutral-ash)", lineHeight: "1.6" }}>
          Vaš zahtjev za pristup IDSS Handbook-u je poslan direktoru škole.
          Dobit ćete email obavijest čim bude obrađen.
        </p>
      </div>
    </div>
  );
}
