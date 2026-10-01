# SPRINT_14 — IDSSLogo3D Persistent Component
# IDSS Handbook Web Application
# Date: 2026-06-28

---

## Goal

Build the 3D IDSS logo as a persistent React component fixed in the top-left corner
of every authenticated page. Auto-rotating. Idle bob. Click opens idss.edu.ba.

---

## Scope — IN

- Three.js scene with exact gridData geometry from DESIGN_SYSTEM.md
- Fixed position: top 20px, left 20px, 120×120px, z-index 9999
- Auto-rotation via OrbitControls (autoRotateSpeed: 1.2)
- Idle bob: y oscillates 0→0.15 via sine wave, period 2.5s
- Click: opens https://idss.edu.ba/ in new tab
- React component: `IDSSLogo3D` with `forwardRef` + `useImperativeHandle`
- Exposes: `celebrate()`, `fail()`, `reset()` (implement as stubs, full in Sprint 15)
- `React.lazy` + `Suspense` wrapper — does not block page load
- Cleanup on unmount (dispose renderer, cancel animation frame)
- Resize via `ResizeObserver`

## Scope — OUT

- GSAP animations (Sprint 15)
- Sound (Sprint 15)
- Speech bubbles (Sprint 15)

---

## Acceptance Criteria

- [ ] Logo renders in exact top-left position on every authenticated page
- [ ] Logo is NOT visible on login/register/pending pages
- [ ] 16 shapes in correct positions with correct colours (verify against DESIGN_SYSTEM.md)
- [ ] Auto-rotation runs smoothly
- [ ] Idle bob animation runs continuously
- [ ] Click opens correct URL in new tab
- [ ] `logoRef.current.celebrate()` callable from quiz (no error, stub logs to console)
- [ ] `logoRef.current.fail()` callable from quiz (no error, stub logs to console)
- [ ] Page loads without Three.js blocking initial render
- [ ] No memory leak: renderer disposed on unmount
- [ ] `npx tsc --noEmit` passes

---

## Exact Grid Data (copy exactly, no modification)

```javascript
const COLORS = {
  black: 0x000000, red: 0xE31B23, yellow: 0xFFC600,
  darkBlue: 0x16558A, lightBlue: 0x1CC4E6,
};
const gridData = [
  { type: 'square',        color: COLORS.black,     x: -1.5,  z: -1.5  },
  { type: 'circle',        color: COLORS.red,        x: -0.5,  z: -1.5  },
  { type: 'ring',          color: COLORS.yellow,     x:  0.5,  z: -1.5  },
  { type: 'small-circle',  color: COLORS.darkBlue,   x:  1.35, z: -1.35 },
  { type: 'circle',        color: COLORS.lightBlue,  x: -1.5,  z: -0.5  },
  { type: 'hollow-square', color: COLORS.darkBlue,   x: -0.5,  z: -0.5  },
  { type: 'circle',        color: COLORS.darkBlue,   x:  0.5,  z: -0.5  },
  { type: 'circle',        color: COLORS.red,        x:  1.5,  z: -0.5  },
  { type: 'circle',        color: COLORS.darkBlue,   x: -1.5,  z:  0.5  },
  { type: 'circle',        color: COLORS.darkBlue,   x: -0.5,  z:  0.5  },
  { type: 'hollow-square', color: COLORS.yellow,     x:  0.5,  z:  0.5  },
  { type: 'circle',        color: COLORS.lightBlue,  x:  1.5,  z:  0.5  },
  { type: 'square',        color: COLORS.lightBlue,  x: -1.5,  z:  1.5  },
  { type: 'ring',          color: COLORS.yellow,     x: -0.5,  z:  1.5  },
  { type: 'circle',        color: COLORS.darkBlue,   x:  0.5,  z:  1.5  },
  { type: 'small-circle',  color: COLORS.darkBlue,   x:  1.35, z:  1.35 },
];
```

Camera: `PerspectiveCamera(45)`, position `(3.5, 2.5, 6)`, lookAt `(0,0,0)`
Orientation: `logoGroup.rotation.x = -Math.PI / 2`

---

## Files Expected to Change

- `components/logo/IDSSLogo3D.tsx`
- `components/logo/IDSSLogo3D.client.tsx`
- `app/(dashboard)/layout.tsx`

---

## Done Checklist Reference

https://raw.githubusercontent.com/IDSS123a/commander/main/DONE_CHECKLIST.md
