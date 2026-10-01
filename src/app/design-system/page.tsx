/**
 * Sprint 03 design-token showcase (buttons, quiz options, badges, palette),
 * moved here from "/" on 2026-09-21: as the root page it showed logged-in
 * users fake demo data (streak 7, "Chapter 3 of 12") instead of the app. Kept
 * on purpose as a visual reference while the palette and VFX layer change.
 * Internal only: the proxy still requires login for this route.
 */
export default function DesignSystemShowcase() {
  return (
    <div className="container" style={{ paddingTop: 'var(--space-16)' }}>

      {/* Logo placeholder — replaced with 3D logo in Sprint 14 */}
      <a
        href="https://idss.edu.ba/"
        target="_blank"
        rel="noopener noreferrer"
        className="logo-placeholder"
        aria-label="IDSS škola"
      >
        IDSS
      </a>

      {/* Navigation */}
      <nav className="nav" style={{ marginBottom: 'var(--space-8)' }}>
        <span style={{
          fontWeight: 'var(--weight-bold)',
          color: 'var(--idss-dark-blue)',
          fontSize: 'var(--text-heading-sm)'
        }}>
          IDSS Handbook
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div className="streak-display">
            🔥 <span>7</span>
          </div>
        </div>
      </nav>

      <h1 style={{
        color: 'var(--idss-dark-blue)',
        marginBottom: 'var(--space-8)'
      }}>
        Design System — Sprint 03
      </h1>

      {/* Buttons */}
      <section style={{ marginBottom: 'var(--space-12)' }}>
        <h2 style={{ marginBottom: 'var(--space-6)', color: 'var(--neutral-graphite)' }}>
          Dugmad
        </h2>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <button className="btn-primary">Primarna akcija</button>
          <button className="btn-success">Tačan odgovor ✓</button>
          <button className="btn-ghost">Sekundarna akcija</button>
          <button className="btn-primary" disabled>Onemogućeno</button>
        </div>
      </section>

      {/* Progress bars */}
      <section style={{ marginBottom: 'var(--space-12)' }}>
        <h2 style={{ marginBottom: 'var(--space-6)', color: 'var(--neutral-graphite)' }}>
          Progress trake
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '480px' }}>
          <div>
            <p style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-caption)' }}>
              Priručnik — Poglavlje 3 od 12
            </p>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: '25%' }} />
            </div>
          </div>
          <div>
            <p style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-caption)' }}>
              Kviz — Pitanje 2 od 5
            </p>
            <div className="progress-bar-track" style={{ height: '12px' }}>
              <div className="progress-bar-fill quiz" style={{ width: '40%' }} />
            </div>
          </div>
        </div>
      </section>

      {/* Quiz options */}
      <section style={{ marginBottom: 'var(--space-12)' }}>
        <h2 style={{ marginBottom: 'var(--space-6)', color: 'var(--neutral-graphite)' }}>
          Kviz opcije
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'var(--space-3)',
          maxWidth: '640px'
        }}>
          <button className="quiz-option">A. Tačan odgovor (default)</button>
          <button className="quiz-option selected">B. Odabrana opcija</button>
          <button className="quiz-option correct">C. Tačno ✓</button>
          <button className="quiz-option incorrect">D. Netačno ✗</button>
        </div>
      </section>

      {/* Badges */}
      <section style={{ marginBottom: 'var(--space-12)' }}>
        <h2 style={{ marginBottom: 'var(--space-6)', color: 'var(--neutral-graphite)' }}>
          Bedževi
        </h2>
        <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
          <div className="badge-icon" title="Prvo poglavlje">📖</div>
          <div className="badge-icon" title="Polovina puta">🎯</div>
          <div className="badge-icon" title="Priručnik savladan">🏆</div>
          <div className="badge-icon locked" title="Zaključano">🔒</div>
          <div className="badge-icon locked" title="Zaključano">🔒</div>
        </div>
      </section>

      {/* Colour palette */}
      <section style={{ marginBottom: 'var(--space-12)' }}>
        <h2 style={{ marginBottom: 'var(--space-6)', color: 'var(--neutral-graphite)' }}>
          IDSS paleta boja
        </h2>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {[
            { name: 'Dark Blue', var: '--idss-dark-blue' },
            { name: 'Light Blue', var: '--idss-light-blue' },
            { name: 'Red', var: '--idss-red' },
            { name: 'Yellow', var: '--idss-yellow' },
            { name: 'Game Green', var: '--game-green' },
            { name: 'Fail Red', var: '--game-fail-red' },
          ].map((colour) => (
            <div key={colour.var} style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: 'var(--radius)',
                background: `var(${colour.var})`,
                marginBottom: 'var(--space-2)',
                border: '1px solid var(--neutral-border)'
              }} />
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--neutral-ash)' }}>
                {colour.name}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="card" style={{ maxWidth: '480px' }}>
        <h3 style={{ marginBottom: 'var(--space-3)', color: 'var(--idss-dark-blue)' }}>
          Sprint 03 završen ✅
        </h3>
        <p style={{ color: 'var(--neutral-ash)' }}>
          Svi CSS tokeni su postavljeni. Nema hardkodiranih vrijednosti u komponentama.
          Sve boje, razmaci i tipografija dolaze iz CSS custom properties.
        </p>
      </div>

    </div>
  )
}
