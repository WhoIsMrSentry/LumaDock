'use strict';
// Switching apps cleanly & immediately: updates currentView on click so hitboxes never drift,
// and uses hardware-friendly opacity/translate motion (zero Chromium software Canvas blur).
(function appSwitch() {
  const IN = 200; // ms
  const ROOTS = '#lumadock-ai-monitor,#lumadock-settings-v2,#lumadock-extras,#lumadock-focus,#lumadock-tools,#lumadock-chat,#lumadock-hub,#lumadock-studio,#lumadock-github,#lumadock-power';
  const style = document.createElement('style');
  style.textContent = `
body.tc-sw-in :is(${ROOTS}){animation:tc-sw-in .2s cubic-bezier(.2,.9,.25,1) both}
@keyframes tc-sw-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){body.tc-sw-in :is(${ROOTS}){animation-duration:.01s}}`;
  document.head.appendChild(style);
  const on = () => window.__lumadockPrefs?.().appAnim !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = v => Math.max(0, Math.min(1, v)), easeOut = v => 1 - (1 - clamp(v)) ** 3;

  let swTimer = null;
  const base = setView;
  setView = function (next) {
    if (!on() || window.__lumadockDragging?.() || mode !== 'expanded' || !introFinished || next === currentView || next === 'project' || currentView === 'project' || transition) {
      return base(next);
    }
    base(next);
    if (swTimer) clearTimeout(swTimer);
    tone(700, 560, 0.035, 0.005);
    document.body.classList.remove('tc-sw-in');
    void document.body.offsetWidth;
    document.body.classList.add('tc-sw-in');
    swTimer = setTimeout(() => { document.body.classList.remove('tc-sw-in'); swTimer = null; }, IN);
  };

  // Lightweight canvas fade without expensive software filter blur
  let canvasSwAt = 0;
  const baseCheck = setView;
  setView = function (next) {
    if (next !== currentView) canvasSwAt = performance.now();
    return baseCheck(next);
  };
  const baseExpanded = drawExpanded;
  drawExpanded = function (alpha) {
    const k = canvasSwAt ? 1 - easeOut((performance.now() - canvasSwAt) / IN) : 0;
    if (k <= 0.01) { canvasSwAt = 0; return baseExpanded(alpha); }
    return baseExpanded(alpha * (1 - k * 0.15));
  };
})();
