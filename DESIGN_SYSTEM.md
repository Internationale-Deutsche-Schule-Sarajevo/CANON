# DESIGN_SYSTEM.md — Visual Design Specification
# IDSS Handbook Web Application
# Version 1.0 — June 2026

---

> All CSS values below must be implemented as tokens in `app/globals.css`.
> No hex values, no pixel values in component files — always reference tokens.

---

## Design Philosophy

Two visual zones:
- **Institutional zone** (Handbook reader, Admin, Super Admin): IDSS blues, formal, precise
- **Gamification zone** (quiz, progress, badges, logo screens): Duolingo mechanics with IDSS palette

No box-shadow anywhere. Depth via solid 3px bottom border only.
One border radius: `var(--radius)` = `12px` — applied everywhere.

---

## CSS Custom Properties (globals.css)

```css
:root {
  --idss-dark-blue:    #16558A;
  --idss-light-blue:   #1CC4E6;
  --idss-red:          #E31B23;
  --idss-yellow:       #FFC600;
  --idss-black:        #000000;

  --game-green:        #58cc02;
  --game-green-light:  #d7ffb8;
  --game-green-mid:    #4cae02;
  --game-blue-accent:  #1cb0f6;
  --game-fail-red:     #E31B23;
  --game-fail-dark:    #b00018;

  --neutral-graphite:  #3c3c3c;
  --neutral-charcoal:  #4b4b4b;
  --neutral-ash:       #777777;
  --neutral-paper:     #ffffff;
  --neutral-border:    #e5e5e5;

  --font-primary:  'Nunito', 'DM Sans', ui-sans-serif, system-ui, sans-serif;
  --font-display:  'Inter', ui-sans-serif, system-ui, sans-serif;

  --text-caption:     13px;
  --text-body:        15px;
  --text-heading-sm:  19px;
  --text-heading:     32px;
  --text-display:     48px;

  --tracking-body:    0.053em;
  --tracking-display: -0.02em;
  --weight-medium:    500;
  --weight-bold:      700;

  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-6:24px; --space-8:32px; --space-10:40px; --space-12:48px;
  --space-16:64px; --space-20:80px; --space-24:96px;

  --radius: 12px;

  --depth-default: 3px solid #d0d0d0;
  --depth-correct: 3px solid var(--game-green-mid);
  --depth-fail:    3px solid var(--game-fail-dark);
  --depth-primary: 3px solid #0e3d6a;

  --page-max-width: 1200px;
  --card-padding:   24px;
}
```

---

## Quiz Answer Button States

| State | Background | Border | Bottom depth |
|---|---|---|---|
| Default | `#ffffff` | `2px solid #3c3c3c` | `var(--depth-default)` |
| Hover | `#f0f7ff` | `2px solid #16558A` | `var(--depth-default)` |
| Selected | `#e8f4fd` | `2px solid #1CC4E6` | `var(--depth-default)` |
| Correct | `#d7f5a0` | `2px solid #58cc02` | `var(--depth-correct)` |
| Incorrect | `#ffe0e0` | `2px solid #E31B23` | `var(--depth-fail)` |

Button layout: 2×2 grid on desktop, 1 column on mobile.

---

## IDSSLogo3D — Three.js Specification

Library: three@0.160.0 via importmap CDN
Container: fixed, top 20px, left 20px, 120×120px, z-index 9999, border-radius 12px
Background: transparent (alpha: true)
Click: opens https://idss.edu.ba/ in new tab

Colours:
```javascript
const COLORS = {
  black: 0x000000, red: 0xE31B23, yellow: 0xFFC600,
  darkBlue: 0x16558A, lightBlue: 0x1CC4E6
};
```

Grid data: 16 shapes forming letter D (exact coordinates in SPRINT_14.md)

Camera: PerspectiveCamera(45), position (3.5, 2.5, 6), lookAt (0,0,0)
Lights: AmbientLight(0xffffff, 0.5) + DirectionalLight(1.2) at (5,10,7) + backlight(0.4) at (-5,0,-5)
Controls: OrbitControls, autoRotate: true, autoRotateSpeed: 1.2, enableZoom: false
Orientation: logoGroup.rotation.x = -Math.PI / 2

---

## Animation System

Libraries: GSAP 3.12.5 + Howler.js 2.2.4 (both via CDN)

Idle: y oscillates 0→0.15 sine wave, period 2.5s

celebrate(): jump y=1.0 → bounce back, spin 360°, yellow emissive flash,
             150-particle confetti, success sound, "🎉 Sjajno!" bubble 1500ms

fail(): shake z ±0.26 × 3, scale 95%, red emissive flash,
        fail sound, "😅 Pokušaj ponovo!" bubble 1500ms

Empathy (3× wrong): sink y=-0.3, "Teško je, znam. Ali vjerujemo u tebe! 💪" 2500ms

Chapter complete: celebrate() + "Poglavlje završeno! Nastavi dalje! 🏆" 3000ms

Auto-reset: 2 seconds after any animation completes

Speech bubble:
```css
.logo-bubble {
  position: fixed; top: 148px; left: 20px;
  background: white; border: 2px solid #16558A;
  border-radius: 12px; padding: 8px 14px;
  font-size: 13px; font-weight: 600; color: #16558A;
  z-index: 10000; pointer-events: none; opacity: 0;
  transition: opacity 0.2s ease;
}
.logo-bubble.success { border-color: #58cc02; color: #3a8c00; }
.logo-bubble.fail    { border-color: #E31B23; color: #E31B23; }
.logo-bubble.visible { opacity: 1; }
```

---

## Navigation Bar

Height: 64px | Background: white | Bottom: 1px solid var(--neutral-border)
Left: page title / breadcrumb | Right: user name, level badge, streak, notifications
No logo in nav — IDSSLogo3D in top-left corner serves that role

---

*IDSS Handbook Design System v1.0*
