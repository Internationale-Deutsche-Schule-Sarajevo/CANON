(function(){
if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var tx=0,ty=0,cx=0,cy=0,raf=0;
function cil(){return document.querySelector('.hero')||document.querySelector('.prijava');}
function sidro(el){var b=el.getBoundingClientRect(),m=innerWidth<=760,p=el.classList.contains('hero');
 if(p&&m)return[b.right-12.8-51,b.top+9.6+41];
 if(p)return[b.right-19.2-107,b.bottom-165];
 return[b.left+b.width/2,b.top+70];}
function prim(){var e=cil();if(!e)return;
 e.style.setProperty('--mx',cx.toFixed(3));e.style.setProperty('--my',cy.toFixed(3));
 e.style.setProperty('--ex',(cx*2).toFixed(2)+'px');e.style.setProperty('--ey',(cy<0?cy:cy*2).toFixed(2)+'px');}
function korak(){cx+=(tx-cx)*.12;cy+=(ty-cy)*.12;prim();
 if(Math.abs(tx-cx)>.002||Math.abs(ty-cy)>.002)raf=requestAnimationFrame(korak);else raf=0;}
function pokreni(){if(!raf)raf=requestAnimationFrame(korak);}
addEventListener('pointermove',function(ev){var e=cil();if(!e)return;var a=sidro(e);
 tx=Math.max(-1,Math.min(1,(ev.clientX-a[0])/(innerWidth*.45)));
 ty=Math.max(-1,Math.min(1,(ev.clientY-a[1])/(innerHeight*.45)));pokreni();},{passive:true});
document.documentElement.addEventListener('mouseleave',function(){tx=0;ty=0;pokreni();});
})();
