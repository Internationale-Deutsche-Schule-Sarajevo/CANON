# SPRINT_15 — Logo Animation System
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Bring the 3D logo to life. GSAP animations for quiz feedback.
The logo becomes the emotional heart of the learning experience.

---

## Scope — IN

- GSAP `celebrate()`: jump + spin + emissive glow + confetti + sound + bubble
- GSAP `fail()`: shake + scale + red tint + sound + bubble
- Empathy animation: 3 consecutive wrong answers in same session
- Chapter completion: extended celebration + second speech bubble
- Speech bubble CSS component (above logo, not in canvas)
- Hover micro-interaction: logo tilts ±10° toward cursor
- Howler.js: success sound + fail sound
- Auto-reset to idle after 2 seconds

## Scope — OUT

- Nothing — this sprint completes the logo system fully

---

## Acceptance Criteria

- [ ] `celebrate()`: logo jumps to y=1.0 and bounces back, spins 360°,
      all materials flash yellow (`emissiveIntensity: 1.0`), confetti explodes,
      sound plays, speech bubble shows "🎉 Sjajno!" for 1,500ms
- [ ] `fail()`: logo shakes left-right 3 times (z ±0.26), scales to 95%,
      materials flash red, sound plays, bubble shows "😅 Pokušaj ponovo!" for 1,500ms
- [ ] 3 consecutive wrong answers: logo sinks to y=-0.3,
      bubble shows "Teško je, znam. Ali vjerujemo u tebe! 💪" for 2,500ms
- [ ] Chapter 5/5 completion: celebrate() runs, then bubble shows
      "Poglavlje završeno! Nastavi dalje! 🏆" for 3,000ms,
      badge icon animates in (scale 0→1, ease back.out(1.7))
- [ ] Level-up: celebrate() runs, bubble shows "Čestitamo! Novi nivo: {name}! 🎓"
- [ ] Speech bubble above logo container at correct position (top: 148px, left: 20px)
- [ ] Bubble has `.success` (green border) and `.fail` (red border) variants
- [ ] Hover: logo tilts toward cursor, returns to neutral on mouseleave
- [ ] All animations auto-reset to idle after 2 seconds
- [ ] No memory leaks: GSAP tweens killed before new ones start
- [ ] `npx tsc --noEmit` passes

---

## GSAP CDN

```
https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js
```

## Howler.js CDN

```
https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js
```

---

## Files Expected to Change

- `components/logo/IDSSLogo3D.tsx` (add GSAP + Howler)
- `components/logo/LogoBubble.tsx` (new)
- `components/logo/LogoBubble.css` (new)
- `components/logo/confetti.ts` (new — THREE.Points confetti system)
- `public/sounds/success.mp3`
- `public/sounds/fail.mp3`

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
