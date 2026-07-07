// Export a deck to a single self-contained .html file that plays offline like a
// mini slideshow — no reveal.js, no network, no dependencies. It inlines the
// theme + slide CSS and a tiny vanilla player (keyboard / click / swipe nav,
// the same overflow-fit logic as the app). Abstract backgrounds are inline data
// URIs so they work fully offline; stock photos stay as remote URLs (they need
// a connection to show, but the deck still plays).

import type { Deck } from '../types'
import { renderDeckSlides } from '../render/renderDeck'
import { customThemeStyleAttr } from '../render/customTheme'
import { escapeHtml } from '../lib/markdown'
import { downloadText } from '../lib/backup'
import themesCss from '../render/themes.css?raw'
import slidesCss from '../render/slides.css?raw'

// Self-sufficient layout: no reveal.css. Scales a 1280×720 stage to the
// viewport and shows one slide at a time.
const EXPORT_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; }
body { background: var(--bg); font-family: var(--font-body); }
.reveal.deck { position: absolute; inset: 0; }
.reveal.deck .slides {
  position: absolute; left: 50%; top: 50%;
  width: 1280px; height: 720px;
  transform: translate(-50%, -50%);
  transform-origin: center center;
}
.reveal.deck .slides > section {
  position: absolute; inset: 0;
  opacity: 0; visibility: hidden;
  transition: opacity .3s ease;
}
.reveal.deck .slides > section.active { opacity: 1; visibility: visible; }
.reveal.deck .fragment { opacity: 1; visibility: visible; transform: none; }
@media (prefers-reduced-motion: no-preference) {
  .reveal.deck .slides > section.active .s > * {
    animation: deck-enter .5s cubic-bezier(.2,.7,.3,1) both;
  }
  .reveal.deck .slides > section.active .s > *:nth-child(2) { animation-delay: 70ms; }
  .reveal.deck .slides > section.active .s > *:nth-child(3) { animation-delay: 140ms; }
  .reveal.deck .slides > section.active .s > *:nth-child(n+4) { animation-delay: 200ms; }
  .reveal.deck .slides > section.active .fragment {
    animation: deck-enter .5s cubic-bezier(.2,.7,.3,1) both;
    animation-delay: calc(180ms + var(--i, 0) * 70ms);
  }
}
@keyframes deck-enter {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}
/* Speaker notes are for the presenter view, never rendered on the slide. */
.reveal.deck .notes { display: none !important; }
.exp-nav {
  position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 20;
  display: flex; align-items: center; gap: 10px;
  font: 14px/1 var(--font-mono); color: var(--fg);
  opacity: .5; transition: opacity .2s;
}
.exp-nav:hover { opacity: 1; }
.exp-nav button {
  width: 34px; height: 34px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--card-border); background: var(--card); color: var(--fg);
  font-size: 20px; line-height: 1; display: grid; place-items: center;
}
@media print {
  @page { size: 1280px 720px; margin: 0; }
  html, body { overflow: visible; height: auto; background: #fff !important; }
  /* Chrome skips backgrounds by default — dark themes would print as blank
     white pages without this. */
  body, body * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    animation: none !important;
  }
  .exp-nav { display: none !important; }
  .reveal.deck { position: static; }
  .reveal.deck .slides {
    position: static; transform: none !important; width: 1280px; height: auto;
  }
  .reveal.deck .slides > section {
    position: relative; inset: auto; opacity: 1 !important; visibility: visible !important;
    width: 1280px; height: 720px; background: var(--bg);
    page-break-after: always; break-after: page; overflow: hidden;
  }
}`

// Tiny inline player. Plain ES5-ish JS (runs in the exported file, no bundler).
const PLAYER_JS = `(function(){
var stage=document.querySelector('.slides');if(!stage)return;
var secs=[].slice.call(stage.querySelectorAll(':scope > section'));var total=secs.length;var i=0;
var posEl=document.querySelector('[data-pos]');
var TARGETS=[['.s-cover__title',3,0.45],['.s-cover__subtitle',2,0.6],['.s-section__title',3,0.45],['.s-section__subtitle',2,0.6],['.s-title',3,0.5],['.s-end__title',2,0.5],['.s-end__subtitle',2,0.6],['.s-big__value',2,0.4],['.s-big__caption',2,0.6],['.s-quote__text',5,0.55]];
function fitOne(el,maxLines,minScale){el.style.fontSize='';el.style.maxWidth='';var base=parseFloat(getComputedStyle(el).fontSize);if(!base)return;var min=base*minScale;
function fits(){var cs=getComputedStyle(el);var lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.2;var pad=(parseFloat(cs.paddingTop)||0)+(parseFloat(cs.paddingBottom)||0);return el.scrollHeight<=lh*maxLines+pad+2;}
function shrink(){var size=base;for(var k=0;k<40;k++){if(fits())return true;size=Math.max(min,size-base*0.045);el.style.fontSize=size+'px';if(size<=min)break;}return fits();}
if(shrink())return;if(getComputedStyle(el).maxWidth!=='none'){el.style.maxWidth='none';el.style.fontSize='';shrink();}}
function fitSlide(root){for(var t=0;t<TARGETS.length;t++){var els=root.querySelectorAll(TARGETS[t][0]);for(var j=0;j<els.length;j++)fitOne(els[j],TARGETS[t][1],TARGETS[t][2]);}
var s=root.querySelector('.s');if(!s)return;s.style.transform='';s.style.transformOrigin='';var availH=s.clientHeight,availW=s.clientWidth;if(!availH||!availW)return;var pj=s.style.justifyContent;s.style.justifyContent='flex-start';var ch=s.scrollHeight,cw=s.scrollWidth;s.style.justifyContent=pj;var scale=Math.min(availH/ch,availW/cw,1);if(scale<0.995){s.style.transformOrigin='center center';s.style.transform='scale('+Math.max(scale,0.4)+')';}}
function layout(){var s=Math.min(innerWidth/1280,innerHeight/720);stage.style.transform='translate(-50%,-50%) scale('+s+')';}
function show(n){i=Math.max(0,Math.min(total-1,n));for(var k=0;k<total;k++)secs[k].classList.toggle('active',k===i);fitSlide(secs[i]);if(posEl)posEl.textContent=(i+1)+' / '+total;try{history.replaceState(null,'','#'+(i+1));}catch(e){}}
function next(){show(i+1);}function prev(){show(i-1);}
var blackout=document.createElement('div');blackout.style.cssText='position:fixed;inset:0;background:#000;z-index:99;display:none';document.body.appendChild(blackout);
addEventListener('keydown',function(e){var k=e.key;if(k==='ArrowRight'||k==='ArrowDown'||k==='PageDown'||k===' '){next();e.preventDefault();}else if(k==='ArrowLeft'||k==='ArrowUp'||k==='PageUp'){prev();e.preventDefault();}else if(k==='Home'){show(0);}else if(k==='End'){show(total-1);}else if(k==='b'||k==='B'||k==='.'){blackout.style.display=blackout.style.display==='none'?'block':'none';}else if(k==='f'||k==='F'){var d=document;if(d.fullscreenElement){d.exitFullscreen();}else if(d.documentElement.requestFullscreen){d.documentElement.requestFullscreen();}}});
var nx=document.querySelector('[data-next]');if(nx)nx.addEventListener('click',function(e){e.stopPropagation();next();});
var pv=document.querySelector('[data-prev]');if(pv)pv.addEventListener('click',function(e){e.stopPropagation();prev();});
addEventListener('click',function(e){if(e.target.closest('a')||e.target.closest('.exp-nav'))return;if(e.clientX<innerWidth*0.33)prev();else next();});
var sx=null;addEventListener('touchstart',function(e){sx=e.touches[0].clientX;},{passive:true});
addEventListener('touchend',function(e){if(sx==null)return;var dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)>40){if(dx<0)next();else prev();}});
addEventListener('resize',layout);layout();
var start=(parseInt((location.hash||'').slice(1),10)||1)-1;show(isFinite(start)&&start>=0?start:0);
})();`

/** Build the full self-contained HTML document for a deck. */
export function standaloneHtml(deck: Deck): string {
  const slides = renderDeckSlides(deck)
  // `.player` carries the shared typography + --pos/--neg vars (themes.css only
  // scopes those to `.player`, not `.theme-*`), so the export renders with the
  // app's fonts. A custom theme adds its derived palette as inline vars.
  const customStyle = deck.customTheme ? ` style="${escapeHtml(customThemeStyleAttr(deck.customTheme))}"` : ''
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escapeHtml(deck.title)}</title>
<style>
${themesCss}
${slidesCss}
${EXPORT_CSS}
</style>
</head>
<body class="player theme-${escapeHtml(deck.theme)}"${customStyle}>
<div class="reveal deck"><div class="slides">
${slides}
</div></div>
<div class="exp-nav">
  <button data-prev type="button" aria-label="Previous">&lsaquo;</button>
  <span class="exp-pos" data-pos></span>
  <button data-next type="button" aria-label="Next">&rsaquo;</button>
</div>
<script>${PLAYER_JS}</script>
</body>
</html>`
}

/** A safe, dated filename for the exported deck, e.g. `我的课件-2026-07-06.html`. */
export function exportFilename(deck: Deck, now: number): string {
  const base = (deck.title || 'deck').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) || 'deck'
  const iso = new Date(now).toISOString().slice(0, 10)
  return `${base}-${iso}.html`
}

/** Build + trigger a download of the standalone deck. */
export function downloadStandalone(deck: Deck, now: number): void {
  downloadText(exportFilename(deck, now), standaloneHtml(deck), 'text/html;charset=utf-8')
}
