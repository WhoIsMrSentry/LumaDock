// Grab Robo out of the island: press on him and drag. Let go anywhere on the screen and buddy-main.cjs
// opens a little card next to him ("What do they mean here?", "Check my spelling"…).
// While he is out, the island hides its own Robo (there is only one Robo) and sends his face, with
// all his moods, to the buddy window. Dropping him back on the island just puts him home.
(() => {
  // out: Robo is not in the island (carried or parked somewhere). dragging: the mouse button is still down.
  let down = null, out = false, dragging = false, swallowClick = false, lastFrame = 0;
  const box = 200, face = document.createElement('canvas'), fctx = face.getContext('2d');
  window.__lumadockCarried = () => out;
  // Only while dragging does the island keep the mouse (so letting go anywhere reaches us).
  // Once he is parked, the island goes back to normal and lets your clicks through.
  window.__lumadockDragging = () => dragging;
  window.__lumadockBuddyDrawing = false;

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || out || window.__lumadockHomeEditing?.() || window.__lumadockAppsOff?.().has('buddy') || !hit.ghost || !inside(e.clientX, e.clientY, hit.ghost)) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  canvas.addEventListener('pointermove', e => {
    if (!down || out) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 14) return; // a small wiggle is still a poke
    out = true; dragging = true; swallowClick = true;
    try { canvas.setPointerCapture(down.id); } catch {}
    window.__lumadockFeel?.('happy', 1200);
    window.lumadock.buddyGrab({ lang: window.__lumadockPrefs?.().lang === 'tr' ? 'tr' : 'en' });
  });
  const release = () => { // where he lands comes from Windows (the real cursor), see buddy-main.cjs
    if (!down) return;
    try { canvas.releasePointerCapture(down.id); } catch {}
    down = null;
    if (dragging) { dragging = false; window.lumadock.buddyDrop(); }
  };
  canvas.addEventListener('pointerup', release);
  // (losing the mouse is not letting go: once Robo's layer is up it catches the release itself)
  // a drag is not a poke
  canvas.addEventListener('click', e => { if (swallowClick) { swallowClick = false; e.stopImmediatePropagation(); } }, true);

  window.lumadock.onBuddy?.((kind, data) => {
    if (kind === 'dropped') { if (down) { try { canvas.releasePointerCapture(down.id); } catch {} } down = null; dragging = false; }
    if (kind === 'home') { out = false; dragging = false; down = null; window.__lumadockFeel?.('happy', 900); }
    if (kind === 'collapse' && typeof setMode === 'function' && mode !== 'rest') setMode('rest', false); // fold the island away while he is out
    if (kind === 'mood' && data?.mood) window.__lumadockFeel?.(data.mood, Math.min(120000, +data.ms || 1000));
  });

  // Draw Robo once more in a free corner of the canvas, copy him out, and put the corner back.
  // The screen only updates after this frame, so nobody ever sees it.
  // Two faces: the real Robo while he is out (buddy layer), and the settings app's own Robo, drawn from
  // the settings you are trying out (lumadock-fun.js) so nothing of the real one shows there.
  function sendFace(now) {
    requestAnimationFrame(sendFace);
    const forApp = window.__lumadockFaceForSettings;
    if (!(out || forApp) || now - lastFrame < (dragging ? 33 : 50)) return;
    lastFrame = now;
    if (out) window.lumadock.buddyFrame(drawFace(false));
    if (forApp) window.lumadock.settingsFrame?.(drawFace(true));
  }
  function drawFace(forApp) {
    const dpr = canvas.width / (canvas.clientWidth || canvas.width) || 1, px = Math.ceil(box * dpr);
    if (face.width !== px) { face.width = px; face.height = px; }
    const backup = ctx.getImageData(0, 0, px, px);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, px, px); ctx.restore();
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    window.__lumadockBuddyDrawing = true;
    try { if (forApp) window.__lumadockDrawPreview(() => drawGhost(box / 2, box / 2 + 17, 112)); else drawGhost(box / 2, box / 2 + 17, 112); }
    finally { window.__lumadockBuddyDrawing = false; ctx.restore(); }
    fctx.clearRect(0, 0, px, px); fctx.drawImage(canvas, 0, 0, px, px, 0, 0, px, px);
    ctx.putImageData(backup, 0, 0);
    return face.toDataURL('image/png');
  }
  requestAnimationFrame(sendFace);
})();
