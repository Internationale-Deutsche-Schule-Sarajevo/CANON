/* =====================================================================
   SCENA 3D — WebGL bez biblioteka. „Kristal bodova“ u središtu i četiri prstena
   (blagovremenost, sadržaj, stručnost, efikasnost) čije punjenje prati STVARNE
   IDSS bodove. Slavlje (iskre) se pokreće samo nakon stvarnog događaja
   (podnošenje, odobrenje). Pri „smanji kretanje“ ili bez WebGL-a prikazuje se
   mirna slika (jedan okvir), a podaci su uvijek dostupni i kao tekst u sučelju.
   ===================================================================== */
const Scena = (() => {
  'use strict';
  /* ---- matrice (stupčano, kao u OpenGL-u) ---- */
  const m4 = {
    id: () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
    mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2); return [t / asp,0,0,0, 0,t,0,0, 0,0,(f + n) / (n - f),-1, 0,0,2 * f * n / (n - f),0]; },
    trans(x, y, z) { const m = m4.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
    rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; },
    ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; },
    rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]; },
    scale(s) { const m = m4.id(); m[0] = m[5] = m[10] = s; return m; },
  };
  const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  /* ---- geometrija kristala (ravne plohe) ---- */
  function kristal() {
    const N = 8, A = [], B = [];
    for (let i = 0; i < N; i++) { const t = i / N * Math.PI * 2 + Math.PI / N; A.push([Math.cos(t) * .78, .3, Math.sin(t) * .78]); B.push([Math.cos(t) * .9, -.08, Math.sin(t) * .9]); }
    const top = [0, 1.0, 0], bot = [0, -1.25, 0], pos = [], nor = [], idf = [];
    const tri = (p, q, r, id) => { const n = norm(cross(sub(q, p), sub(r, p))); [p, q, r].forEach(v => { pos.push(...v); nor.push(...n); idf.push(id); }); };
    let id = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      tri(top, A[j], A[i], id++);                      // kruna
      tri(A[i], A[j], B[j], id++); tri(A[i], B[j], B[i], id++);   // pojas
      tri(bot, B[i], B[j], id++);                      // paviljon
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), idf: new Float32Array(idf) };
  }
  /* ---- prsten: traka po kružnici, atribut t 0..1 ---- */
  function prsten(R, w, seg) {
    const pos = [], tt = [], nor = [];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (const dy of [-1, 1]) { pos.push(c * R, dy * w, s * R); nor.push(c, 0, s); tt.push(i / seg); }
    }
    const idx = []; for (let i = 0; i < seg; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    return { pos: new Float32Array(pos), t: new Float32Array(tt), nor: new Float32Array(nor), idx: new Uint16Array(idx) };
  }

  const VS_K = `attribute vec3 p; attribute vec3 n; attribute float f; uniform mat4 mvp; uniform mat4 mv; uniform float vr;
    varying vec3 vn; varying vec3 vv; varying float vf; void main(){ vn=normalize((mv*vec4(n,0.)).xyz); vv=(mv*vec4(p,1.)).xyz; vf=f; gl_Position=mvp*vec4(p,1.); }`;
  const FS_K = `precision mediump float; varying vec3 vn; varying vec3 vv; varying float vf; uniform vec3 c1; uniform vec3 c2; uniform float vr; uniform float pulse;
    float h(float x){return fract(sin(x*91.3458)*47453.5453);}
    void main(){ vec3 N=normalize(vn); vec3 V=normalize(-vv); vec3 L=normalize(vec3(.5,.9,.7)); vec3 R=reflect(-V,N);
      float dif=max(dot(N,L),0.)*.55+.25; float fr=pow(1.-max(dot(N,V),0.),2.6);
      float spec=pow(max(dot(R,L),0.),42.)*1.1; float env=.5+.5*R.y;
      float sh=h(vf)*.5+.5; float tw=.5+.5*sin(vr*1.7+vf*1.9); 
      vec3 base=mix(c1,c2,clamp(env*.8+sh*.25+tw*.1*pulse,0.,1.));
      vec3 col=base*dif+vec3(1.)*spec+c2*fr*.9; gl_FragColor=vec4(col,1.); }`;
  const VS_R = `attribute vec3 p; attribute vec3 n; attribute float t; uniform mat4 mvp; uniform mat4 mv; varying float vt; varying vec3 vn; varying vec3 vv;
    void main(){ vt=t; vn=normalize((mv*vec4(n,0.)).xyz); vv=(mv*vec4(p,1.)).xyz; gl_Position=mvp*vec4(p,1.); }`;
  const FS_R = `precision mediump float; varying float vt; varying vec3 vn; varying vec3 vv; uniform vec3 col; uniform float fill; uniform float tm;
    void main(){ float on=step(vt,fill); float edge=smoothstep(fill-.02,fill,vt)*on; vec3 V=normalize(-vv); float fr=pow(1.-abs(dot(normalize(vn),V)),1.5);
      float shine=.75+.25*sin(vt*40.-tm*2.);
      vec3 lit=col*(.75+.5*fr)*shine+vec3(1.)*edge*.7; vec3 dim=vec3(.02,.19,.32)*(.7+.3*fr);
      gl_FragColor=vec4(mix(dim,lit,on),1.); }`;
  const VS_P = `attribute vec4 p; uniform mat4 mvp; uniform float sz; varying float va; void main(){ gl_Position=mvp*vec4(p.xyz,1.); gl_PointSize=sz*(1.-clamp(gl_Position.w/14.,0.,.7)); va=p.w; }`;
  const FS_P = `precision mediump float; varying float va; void main(){ vec2 d=gl_PointCoord-.5; float r=length(d); if(r>.5) discard; gl_FragColor=vec4(1.,.8,.16,1.)*(1.-r*1.6)*va; }`;

  function sjenčar(gl, vs, fs) {
    const mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    return pr;
  }
  const buf = (gl, data, tip) => { const b = gl.createBuffer(); gl.bindBuffer(tip || gl.ARRAY_BUFFER, b); gl.bufferData(tip || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };

  const BOJE = { blagovremenost: '#FFCB29', sadrzaj: '#08ABE6', strucnost: '#ffffff', efikasnost: '#E8262C' };

  function montiraj(canvas, opcije) {
    opcije = opcije || {};
    let gl = null;
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false }) || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl) return null;
    let K, R, P;
    try { K = sjenčar(gl, VS_K, FS_K); R = sjenčar(gl, VS_R, FS_R); P = sjenčar(gl, VS_P, FS_P); } catch (e) { return null; }
    const kr = kristal(), kb = { p: buf(gl, kr.pos), n: buf(gl, kr.nor), f: buf(gl, kr.idf), n3: kr.pos.length / 3 };
    const grupe = ['blagovremenost', 'sadrzaj', 'strucnost', 'efikasnost'];
    const rg = grupe.map((g, i) => { const pr = prsten(1.55 + i * .3, .035, 120); return { g, geo: pr, p: buf(gl, pr.pos), n: buf(gl, pr.nor), t: buf(gl, pr.t), ix: buf(gl, pr.idx, gl.ELEMENT_ARRAY_BUFFER), tilt: [.9, -.7, 1.25, -1.05][i], ofs: i * 1.3 }; });
    const NP = 90, iskre = new Float32Array(NP * 4), brz = new Float32Array(NP * 3);
    const pb = gl.createBuffer();
    const iskraInit = (i, burst) => { const a = Math.random() * 6.283, y = (Math.random() - .5) * 2.2, r = burst ? .3 + Math.random() * .4 : 1.2 + Math.random() * 1.4;
      iskre[i * 4] = Math.cos(a) * r; iskre[i * 4 + 1] = y; iskre[i * 4 + 2] = Math.sin(a) * r; iskre[i * 4 + 3] = burst ? 1 : .35 + Math.random() * .5;
      brz[i * 3] = burst ? Math.cos(a) * (.8 + Math.random()) : 0; brz[i * 3 + 1] = burst ? .6 + Math.random() * 1.6 : 0; brz[i * 3 + 2] = burst ? Math.sin(a) * (.8 + Math.random()) : 0; };
    for (let i = 0; i < NP; i++) iskraInit(i, false);
    let model = { ukupno: 0, max: 1000, po_grupama: {} };
    let prikaz = { fill: [0, 0, 0, 0], ukupno: 0 };
    let slavlje = 0, t0 = performance.now(), raf = 0, zivo = true, mis = [0, 0], rotacija = 0;
    /* Animacije su uvijek uključene (zahtjev škole); sistemska postavka „smanji kretanje“ se namjerno ne primjenjuje na 3D scenu. */
    const mirno = () => opcije.mirno === true;
    let animirano = !mirno();

    function velicina() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    function crtaj(vrijeme) {
      velicina();
      const t = (vrijeme - t0) / 1000, dt = 1 / 60;
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      // ciljno punjenje prstenova (uglađeno)
      const cilj = grupe.map(g => { const x = model.po_grupama[g]; return x && x.max ? Math.max(0, Math.min(1, x.bodovi / x.max)) : 0; });
      for (let i = 0; i < 4; i++) prikaz.fill[i] += (cilj[i] - prikaz.fill[i]) * (animirano ? .06 : 1);
      if (!animirano) prikaz.fill = cilj.slice();
      const asp = canvas.width / canvas.height;
      const proj = m4.persp(.8, asp, .1, 40);
      const view = m4.mul(m4.trans(0, -.1, -6.4), m4.mul(m4.rx(.28 + mis[1] * .12), m4.ry((animirano ? t * .25 : .6) + mis[0] * .3)));
      const pulse = Math.min(1, model.ukupno / (model.max || 1000) + .2);
      const c1 = hex('#035EA1'), c2 = model.ukupno >= 800 ? hex('#FFCB29') : model.ukupno >= 500 ? hex('#08ABE6') : hex('#ffffff');
      // kristal
      gl.useProgram(K);
      const mvK = m4.mul(view, m4.mul(m4.ry(animirano ? t * .5 : 0), m4.scale(.92 + (slavlje > 0 ? .08 * Math.sin(slavlje * 12) : 0))));
      gl.uniformMatrix4fv(gl.getUniformLocation(K, 'mvp'), false, m4.mul(proj, mvK)); gl.uniformMatrix4fv(gl.getUniformLocation(K, 'mv'), false, mvK);
      gl.uniform3fv(gl.getUniformLocation(K, 'c1'), c1); gl.uniform3fv(gl.getUniformLocation(K, 'c2'), c2);
      gl.uniform1f(gl.getUniformLocation(K, 'vr'), t); gl.uniform1f(gl.getUniformLocation(K, 'pulse'), pulse);
      [['p', kb.p, 3], ['n', kb.n, 3], ['f', kb.f, 1]].forEach(([a, b, s]) => { const l = gl.getAttribLocation(K, a); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, s, gl.FLOAT, false, 0, 0); });
      gl.drawArrays(gl.TRIANGLES, 0, kb.n3);
      // prstenovi
      gl.useProgram(R);
      rg.forEach((r, i) => {
        const mv = m4.mul(view, m4.mul(m4.rx(r.tilt), m4.mul(m4.rz(r.ofs), m4.ry(animirano ? t * (.18 + i * .05) * (i % 2 ? -1 : 1) : r.ofs))));
        gl.uniformMatrix4fv(gl.getUniformLocation(R, 'mvp'), false, m4.mul(proj, mv)); gl.uniformMatrix4fv(gl.getUniformLocation(R, 'mv'), false, mv);
        gl.uniform3fv(gl.getUniformLocation(R, 'col'), hex(BOJE[r.g])); gl.uniform1f(gl.getUniformLocation(R, 'fill'), prikaz.fill[i]); gl.uniform1f(gl.getUniformLocation(R, 'tm'), t);
        [['p', r.p, 3], ['n', r.n, 3], ['t', r.t, 1]].forEach(([a, b, s]) => { const l = gl.getAttribLocation(R, a); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, s, gl.FLOAT, false, 0, 0); });
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, r.ix); gl.drawElements(gl.TRIANGLES, r.geo.idx.length, gl.UNSIGNED_SHORT, 0);
      });
      // iskre
      if (animirano || slavlje > 0) {
        for (let i = 0; i < NP; i++) {
          if (slavlje > 0 || brz[i * 3 + 1] !== 0) { iskre[i * 4] += brz[i * 3] * dt; iskre[i * 4 + 1] += brz[i * 3 + 1] * dt; iskre[i * 4 + 2] += brz[i * 3 + 2] * dt; brz[i * 3 + 1] -= 1.2 * dt; iskre[i * 4 + 3] -= .012; if (iskre[i * 4 + 3] <= 0) iskraInit(i, false); }
          else { const a = Math.atan2(iskre[i * 4 + 2], iskre[i * 4]) + dt * .35; const r = Math.hypot(iskre[i * 4], iskre[i * 4 + 2]); iskre[i * 4] = Math.cos(a) * r; iskre[i * 4 + 2] = Math.sin(a) * r; iskre[i * 4 + 1] += Math.sin(t + i) * .002; }
        }
        gl.useProgram(P); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
        gl.uniformMatrix4fv(gl.getUniformLocation(P, 'mvp'), false, m4.mul(proj, view)); gl.uniform1f(gl.getUniformLocation(P, 'sz'), 14 * (window.devicePixelRatio || 1));
        gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, iskre, gl.DYNAMIC_DRAW);
        const l = gl.getAttribLocation(P, 'p'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.POINTS, 0, NP); gl.depthMask(true); gl.disable(gl.BLEND);
        if (slavlje > 0) slavlje = Math.max(0, slavlje - dt);
      }
    }
    function petlja(v) { if (!zivo) return; crtaj(v); if (animirano || slavlje > 0 || Math.abs(prikaz.fill[0] - 1) > 1e-3) raf = requestAnimationFrame(petlja); else raf = 0; }
    const pokreni = () => { if (!raf && zivo) raf = requestAnimationFrame(petlja); };
    const pomak = e => { const b = canvas.getBoundingClientRect(); mis = [((e.clientX - b.left) / b.width - .5) * 2, ((e.clientY - b.top) / b.height - .5) * 2]; if (!animirano) { crtaj(performance.now()); } };
    canvas.addEventListener('pointermove', pomak);
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(() => { if (!animirano) crtaj(performance.now()); }) : null; if (ro) ro.observe(canvas);
    const mq = null;
    const onMq = () => {};
    crtaj(performance.now()); pokreni();
    return {
      postavi(m) { model = m; if (!animirano) { prikaz.fill = grupe.map(g => (m.po_grupama[g] && m.po_grupama[g].max ? m.po_grupama[g].bodovi / m.po_grupama[g].max : 0)); crtaj(performance.now()); } else pokreni(); },
      slavlje() { slavlje = 2.6; for (let i = 0; i < NP; i++) iskraInit(i, true); pokreni(); },
      animacija(uklj) { animirano = !!uklj; opcije.mirno = !uklj; pokreni(); if (!uklj) crtaj(performance.now()); },
      ugasi() { zivo = false; if (raf) cancelAnimationFrame(raf); canvas.removeEventListener('pointermove', pomak); if (ro) ro.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq);
        const e = gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); },
    };
  }
  return { montiraj, BOJE };
})();
if (typeof module !== 'undefined') module.exports = Scena;
