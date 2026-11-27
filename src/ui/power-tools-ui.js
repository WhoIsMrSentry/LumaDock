'use strict';
// 2FA & Encrypted Vault (TOTP, DPAPI Secrets, Password Gen) + DevTools (HTTP Tester, Webhook Catcher, JWT/JSON/B64/Diff/UUID/SHA256).
(function powerToolsUi() {
  const api = window.lumadock;
  if (!api?.totpList) return;

  const VIEWS = ['vault', 'devtools'];
  const root = document.createElement('section');
  root.id = 'lumadock-power';
  document.body.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
#lumadock-power{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 "Segoe UI Variable Text","Segoe UI",sans-serif;pointer-events:auto}
#lumadock-power *{box-sizing:border-box}
#lumadock-power .pw-tabs{display:flex;gap:5px;margin-top:8px;flex-wrap:wrap}
#lumadock-power .pw-btn{border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#171c17;color:#dfe7da;padding:5px 10px;font:600 11px "Segoe UI",sans-serif;cursor:pointer;white-space:nowrap}
#lumadock-power .pw-btn:hover{background:#232b22;color:#fff}
#lumadock-power .pw-btn.on,#lumadock-power .pw-btn.pri{background:#c6e994;color:#11180d;border-color:#c6e994}
#lumadock-power .pw-btn.bad{background:rgba(255,95,86,.14);border-color:rgba(255,95,86,.35);color:#ffaba3}
#lumadock-power .pw-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;height:calc(100% - 62px)}
#lumadock-power .pw-card{background:#121612;border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-height:0;overflow:auto}
#lumadock-power .pw-card h4{margin:0;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#8f998d;display:flex;align-items:center;justify-content:space-between}
#lumadock-power .pw-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;border-radius:10px;background:rgba(255,255,255,.04)}
#lumadock-power .pw-row b{font-size:12px;color:#f2f5ef}
#lumadock-power .pw-row small{color:#8f998d;font-size:10px}
#lumadock-power .pw-code{font:700 16px/1 Consolas,monospace;letter-spacing:.12em;color:#c6e994}
#lumadock-power input,#lumadock-power select,#lumadock-power textarea{border:1px solid rgba(255,255,255,.11);border-radius:9px;background:#0b0e0b;color:#fff;padding:5px 8px;font:11.5px "Segoe UI",sans-serif;outline:none;user-select:text}
#lumadock-power textarea{resize:none;font-family:Consolas,monospace;font-size:11px}
#lumadock-power pre{margin:0;padding:7px 9px;border-radius:10px;background:#0a0d0a;color:#c8d4c0;font:10.5px/1.35 Consolas,monospace;overflow:auto;user-select:text;white-space:pre-wrap;word-break:break-word;flex:1}`;
  document.head.appendChild(style);

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const t = (k, p) => (window.__lumadockT ? window.__lumadockT(k, p) : k);

  let vaultTab = 'totp';      // totp | secrets | pwgen
  let devTab = 'http';        // http | webhook | kit
  let totpItems = [], secretItems = [];
  let totpUri = '', totpIssuer = '', totpAcct = '', totpSecret = '';
  let secName = '', secCat = 'API Key', secVal = '';
  let genLen = 20, genSym = true, genPassphrase = false, genOutput = '';

  let httpMethod = 'GET', httpUrl = 'https://httpbin.org/get', httpBody = '', httpRes = null, httpBusy = false;
  let webhook = { running: false, url: '', events: [] };
  let kitMode = 'jwt', kitInA = '', kitInB = '', kitOut = '';

  const refreshTotp = () => api.totpList?.().then(r => { if (r?.ok) totpItems = r.items || []; }).catch(() => {});
  const refreshSecrets = () => api.secretList?.().then(r => { if (r?.ok) secretItems = r.items || []; }).catch(() => {});
  const refreshWebhook = () => api.webhookStatus?.().then(r => { if (r?.ok) webhook = r; }).catch(() => {});

  api.onWebhookEvent?.(evt => {
    if (!evt) return;
    webhook.events = [evt, ...(webhook.events || [])].slice(0, 25);
    if (currentView === 'devtools' && devTab === 'webhook') render();
  });

  // Live 1s countdown tick + step refresh when on 2FA tab
  let lastStep = Math.floor(Date.now() / 30000);
  setInterval(() => {
    if (currentView !== 'vault' || vaultTab !== 'totp' || mode !== 'expanded') return;
    const step = Math.floor(Date.now() / 30000);
    if (step !== lastStep) { lastStep = step; refreshTotp().then(render); }
    else {
      const rem = 30 - (Math.floor(Date.now() / 1000) % 30);
      root.querySelectorAll('[data-totp-rem]').forEach(el => { el.textContent = `${rem}s`; });
    }
  }, 1000);

  async function runKitTransform() {
    const a = kitInA.trim();
    try {
      if (kitMode === 'jwt') {
        const parts = a.split('.');
        if (parts.length < 2) { kitOut = 'Invalid JWT'; return; }
        const dec = b64 => JSON.parse(decodeURIComponent(escape(atob(b64.replace(/-/g, '+').replace(/_/g, '/')))));
        kitOut = JSON.stringify({ header: dec(parts[0]), payload: dec(parts[1]) }, null, 2);
      } else if (kitMode === 'json') {
        kitOut = JSON.stringify(JSON.parse(a), null, 2);
      } else if (kitMode === 'b64e') {
        kitOut = btoa(unescape(encodeURIComponent(kitInA)));
      } else if (kitMode === 'b64d') {
        kitOut = decodeURIComponent(escape(atob(a)));
      } else if (kitMode === 'uuid') {
        kitOut = crypto.randomUUID ? crypto.randomUUID() : '';
      } else if (kitMode === 'sha256') {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(kitInA));
        kitOut = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      } else if (kitMode === 'ts') {
        if (/^\d{10,13}$/.test(a)) {
          const ms = a.length === 10 ? Number(a) * 1000 : Number(a);
          kitOut = new Date(ms).toISOString();
        } else {
          const d = a ? new Date(a) : new Date();
          kitOut = `${Math.floor(d.getTime() / 1000)} (${d.toISOString()})`;
        }
      } else if (kitMode === 'diff') {
        const la = kitInA.split('\n'), lb = kitInB.split('\n');
        const max = Math.max(la.length, lb.length), out = [];
        for (let i = 0; i < max; i++) {
          if (la[i] === lb[i]) out.push(`  ${la[i] ?? ''}`);
          else {
            if (la[i] !== undefined) out.push(`- ${la[i]}`);
            if (lb[i] !== undefined) out.push(`+ ${lb[i]}`);
          }
        }
        kitOut = out.join('\n');
      }
    } catch (e) {
      kitOut = String(e?.message || e);
    }
  }

  function render() {
    const view = typeof currentView !== 'undefined' ? currentView : '';
    if (!VIEWS.includes(view)) return;
    const keepFocusId = document.activeElement?.id;
    const keepStart = document.activeElement?.selectionStart;

    if (view === 'vault') {
      const rem = 30 - (Math.floor(Date.now() / 1000) % 30);
      const tabs = `<div class="pw-tabs">
        <button type="button" class="pw-btn ${vaultTab === 'totp' ? 'on' : ''}" data-vtab="totp">2FA (${totpItems.length})</button>
        <button type="button" class="pw-btn ${vaultTab === 'secrets' ? 'on' : ''}" data-vtab="secrets">${esc(t('powerTools.secretsTab'))} (${secretItems.length})</button>
        <button type="button" class="pw-btn ${vaultTab === 'pwgen' ? 'on' : ''}" data-vtab="pwgen">${esc(t('powerTools.pwGenTab'))}</button>
      </div>`;
      let body = '';
      if (vaultTab === 'totp') {
        const list = totpItems.map(it => `<div class="pw-row">
          <div><b>${esc(it.issuer || it.account)}</b><small style="display:block">${esc(it.account || '')}</small></div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="pw-code">${esc(it.code)}</span>
            <small data-totp-rem="1">${rem}s</small>
            <button type="button" class="pw-btn pri" data-tcopy="${esc(it.id)}">${esc(t('common.copy'))}</button>
            <button type="button" class="pw-btn bad" data-tdel="${esc(it.id)}">x</button>
          </div>
        </div>`).join('') || `<small style="color:#8f998d">${esc(t('powerTools.totpEmpty'))}</small>`;
        body = `<div class="pw-cols">
          <div class="pw-card"><h4>${esc(t('powerTools.totpCodes'))}</h4>${list}</div>
          <div class="pw-card"><h4>${esc(t('powerTools.totpAdd'))}</h4>
            <input id="pw-t-uri" placeholder="otpauth://totp/..." value="${esc(totpUri)}">
            <small style="color:#8f998d">${esc(t('powerTools.orManual'))}</small>
            <input id="pw-t-issuer" placeholder="GitHub / AWS" value="${esc(totpIssuer)}">
            <input id="pw-t-acct" placeholder="user@domain.com" value="${esc(totpAcct)}">
            <input id="pw-t-sec" placeholder="BASE32SECRET" value="${esc(totpSecret)}">
            <button type="button" class="pw-btn pri" data-tadd="1">${esc(t('common.add'))}</button>
          </div>
        </div>`;
      } else if (vaultTab === 'secrets') {
        const sList = secretItems.map(s => `<div class="pw-row">
          <div><b>${esc(s.name)}</b> <small>${esc(s.category)}</small></div>
          <div style="display:flex;gap:5px"><button type="button" class="pw-btn pri" data-scopy="${esc(s.id)}">${esc(t('common.copy'))}</button><button type="button" class="pw-btn bad" data-sdel="${esc(s.id)}">x</button></div>
        </div>`).join('') || `<small style="color:#8f998d">${esc(t('powerTools.secretsEmpty'))}</small>`;
        body = `<div class="pw-cols">
          <div class="pw-card"><h4>${esc(t('powerTools.secretsTab'))} (DPAPI · 30s auto-clear)</h4>${sList}</div>
          <div class="pw-card"><h4>${esc(t('common.add'))}</h4>
            <input id="pw-s-name" placeholder="Name (e.g. OPENAI_KEY)" value="${esc(secName)}">
            <input id="pw-s-cat" placeholder="Category (API / SSH / ENV)" value="${esc(secCat)}">
            <input id="pw-s-val" type="password" placeholder="Secret value..." value="${esc(secVal)}">
            <button type="button" class="pw-btn pri" data-sadd="1">${esc(t('common.save'))}</button>
          </div>
        </div>`;
      } else {
        body = `<div class="pw-card" style="height:calc(100% - 62px)">
          <h4>${esc(t('powerTools.pwGenTab'))}</h4>
          <div class="pw-row">
            <span>${esc(t('powerTools.lengthLabel'))}: <b>${genLen}</b></span>
            <input type="range" id="pw-g-len" min="8" max="64" value="${genLen}" style="flex:1;accent-color:#c6e994">
            <button type="button" class="pw-btn ${genSym ? 'on' : ''}" data-gsym="1">!@#</button>
            <button type="button" class="pw-btn ${genPassphrase ? 'on' : ''}" data-gpass="1">Passphrase</button>
            <button type="button" class="pw-btn pri" data-ggen="1">${esc(t('common.generate'))}</button>
          </div>
          <pre style="font-size:13px;color:#dff8ba;min-height:48px">${esc(genOutput || '...')}</pre>
          <div style="display:flex;gap:6px"><button type="button" class="pw-btn pri" data-gcopy="1">${esc(t('common.copy'))}</button></div>
        </div>`;
      }
      root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('appsDir.vaultName'))}</p><p class="tc-page-sub">${esc(t('powerTools.vaultSub'))}</p></div>${tabs}</div>${body}`;
    } else if (view === 'devtools') {
      const tabs = `<div class="pw-tabs">
        <button type="button" class="pw-btn ${devTab === 'http' ? 'on' : ''}" data-dtab="http">HTTP / API</button>
        <button type="button" class="pw-btn ${devTab === 'webhook' ? 'on' : ''}" data-dtab="webhook">Webhook</button>
        <button type="button" class="pw-btn ${devTab === 'kit' ? 'on' : ''}" data-dtab="kit">JWT / JSON / Kit</button>
      </div>`;
      let body = '';
      if (devTab === 'http') {
        body = `<div class="pw-cols">
          <div class="pw-card">
            <div style="display:flex;gap:5px">
              <select id="pw-h-meth">${['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => `<option ${m === httpMethod ? 'selected' : ''}>${m}</option>`).join('')}</select>
              <input id="pw-h-url" style="flex:1" value="${esc(httpUrl)}" placeholder="https://...">
              <button type="button" class="pw-btn pri" data-hsend="1" ${httpBusy ? 'disabled' : ''}>${httpBusy ? '...' : esc(t('common.send'))}</button>
            </div>
            <textarea id="pw-h-body" style="flex:1" placeholder='{"key":"value"}'>${esc(httpBody)}</textarea>
          </div>
          <div class="pw-card">
            <h4>Response ${httpRes ? `<span>${httpRes.status || 'ERR'} · ${httpRes.ms || 0}ms</span>` : ''}</h4>
            <pre>${esc(httpRes ? (httpRes.ok ? httpRes.body : httpRes.error) : '...')}</pre>
          </div>
        </div>`;
      } else if (devTab === 'webhook') {
        body = `<div class="pw-card" style="height:calc(100% - 62px)">
          <div class="pw-row">
            <div><b>${webhook.running ? esc(webhook.url) : esc(t('powerTools.webhookOff'))}</b><small style="display:block">${esc(t('powerTools.webhookSub'))}</small></div>
            <div style="display:flex;gap:5px">
              ${webhook.running ? `<button type="button" class="pw-btn" data-whcopy="1">${esc(t('common.copy'))}</button><button type="button" class="pw-btn bad" data-whstop="1">Stop</button>` : `<button type="button" class="pw-btn pri" data-whstart="1">Start</button>`}
            </div>
          </div>
          <pre>${(webhook.events || []).map(ev => `[${ev.at}] ${ev.method} ${ev.path}\n${ev.body || ''}`).join('\n---\n') || esc(t('powerTools.webhookEmpty'))}</pre>
        </div>`;
      } else {
        const modes = [['jwt', 'JWT'], ['json', 'JSON'], ['b64e', 'B64 Enc'], ['b64d', 'B64 Dec'], ['diff', 'Diff'], ['uuid', 'UUID'], ['sha256', 'SHA-256'], ['ts', 'Time']];
        body = `<div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap">${modes.map(([k, l]) => `<button type="button" class="pw-btn ${kitMode === k ? 'on' : ''}" data-kmode="${k}">${l}</button>`).join('')}<button type="button" class="pw-btn pri" data-kcopy="1" style="margin-left:auto">${esc(t('common.copy'))}</button></div>
          <div class="pw-cols" style="height:calc(100% - 92px)">
            <div class="pw-card">
              <textarea id="pw-k-a" style="flex:1" placeholder="Input...">${esc(kitInA)}</textarea>
              ${kitMode === 'diff' ? `<textarea id="pw-k-b" style="flex:1" placeholder="Compare B...">${esc(kitInB)}</textarea>` : ''}
            </div>
            <div class="pw-card"><pre>${esc(kitOut || '...')}</pre></div>
          </div>`;
      }
      root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('appsDir.devtoolsName'))}</p><p class="tc-page-sub">${esc(t('powerTools.devtoolsSub'))}</p></div>${tabs}</div>${body}`;
    }

    if (keepFocusId) {
      const el = root.querySelector('#' + keepFocusId);
      if (el) { el.focus(); try { if (el.setSelectionRange) el.setSelectionRange(keepStart, keepStart); } catch {} }
    }
  }

  root.addEventListener('input', async e => {
    const id = e.target.id;
    if (id === 'pw-t-uri') totpUri = e.target.value;
    if (id === 'pw-t-issuer') totpIssuer = e.target.value;
    if (id === 'pw-t-acct') totpAcct = e.target.value;
    if (id === 'pw-t-sec') totpSecret = e.target.value;
    if (id === 'pw-s-name') secName = e.target.value;
    if (id === 'pw-s-cat') secCat = e.target.value;
    if (id === 'pw-s-val') secVal = e.target.value;
    if (id === 'pw-g-len') { genLen = Number(e.target.value) || 20; render(); }
    if (id === 'pw-h-url') httpUrl = e.target.value;
    if (id === 'pw-h-body') httpBody = e.target.value;
    if (id === 'pw-k-a') { kitInA = e.target.value; await runKitTransform(); render(); }
    if (id === 'pw-k-b') { kitInB = e.target.value; await runKitTransform(); render(); }
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'pw-h-meth') httpMethod = e.target.value;
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.vtab) {
      vaultTab = b.dataset.vtab;
      if (vaultTab === 'totp') await refreshTotp();
      if (vaultTab === 'secrets') await refreshSecrets();
      if (vaultTab === 'pwgen' && !genOutput) { const r = await api.passwordGen?.({ length: genLen, symbols: genSym, passphrase: genPassphrase }); if (r?.ok) genOutput = r.value; }
      render(); return;
    }
    if (b.dataset.dtab) {
      devTab = b.dataset.dtab;
      if (devTab === 'webhook') await refreshWebhook();
      render(); return;
    }
    if (b.dataset.tadd) {
      const r = await api.totpAdd?.({ uri: totpUri.trim(), issuer: totpIssuer.trim(), account: totpAcct.trim(), secret: totpSecret.trim() });
      if (r?.ok) { totpItems = r.items || []; totpUri = ''; totpIssuer = ''; totpAcct = ''; totpSecret = ''; }
      else window.__lumadockFlash?.(r?.error || 'Error', 1800);
      render(); return;
    }
    if (b.dataset.tcopy) { await api.totpCopy?.(b.dataset.tcopy); window.__lumadockFlash?.(t('common.copiedCheck'), 1400); return; }
    if (b.dataset.tdel) { const r = await api.totpDel?.(b.dataset.tdel); if (r?.ok) totpItems = r.items || []; render(); return; }
    if (b.dataset.sadd && secName.trim() && secVal) {
      const r = await api.secretAdd?.({ name: secName.trim(), category: secCat.trim(), value: secVal });
      if (r?.ok) { secretItems = r.items || []; secName = ''; secVal = ''; }
      render(); return;
    }
    if (b.dataset.scopy) { await api.secretCopy?.(b.dataset.scopy); window.__lumadockFlash?.(t('common.copiedCheck'), 1400); return; }
    if (b.dataset.sdel) { const r = await api.secretDel?.(b.dataset.sdel); if (r?.ok) secretItems = r.items || []; render(); return; }
    if (b.dataset.gsym) { genSym = !genSym; render(); return; }
    if (b.dataset.gpass) { genPassphrase = !genPassphrase; render(); return; }
    if (b.dataset.ggen) { const r = await api.passwordGen?.({ length: genLen, symbols: genSym, passphrase: genPassphrase }); if (r?.ok) genOutput = r.value; render(); return; }
    if (b.dataset.gcopy && genOutput) { await api.copyText?.(genOutput); window.__lumadockFlash?.(t('common.copiedCheck'), 1400); return; }
    if (b.dataset.hsend) {
      httpBusy = true; render();
      try { httpRes = await api.httpSend?.({ method: httpMethod, url: httpUrl.trim(), body: httpBody }); }
      finally { httpBusy = false; render(); }
      return;
    }
    if (b.dataset.whstart) { const r = await api.webhookStart?.(); if (r?.ok) webhook = r; render(); return; }
    if (b.dataset.whstop) { const r = await api.webhookStop?.(); if (r?.ok) webhook = r; render(); return; }
    if (b.dataset.whcopy && webhook.url) { await api.copyText?.(webhook.url); window.__lumadockFlash?.(t('common.copiedCheck'), 1200); return; }
    if (b.dataset.kmode) { kitMode = b.dataset.kmode; await runKitTransform(); render(); return; }
    if (b.dataset.kcopy && kitOut) { await api.copyText?.(kitOut); window.__lumadockFlash?.(t('common.copiedCheck'), 1200); return; }
  });

  root.addEventListener('focusin', () => { projectInputFocused = true; sendInteractive(true); });
  root.addEventListener('focusout', () => { setTimeout(() => { if (!root.contains(document.activeElement)) projectInputFocused = false; }, 0); });
  window.__lumadockI18n?.onChange?.(() => render());

  const baseExpanded = drawExpanded;
  drawExpanded = function (alpha) {
    if (typeof currentView !== 'undefined' && VIEWS.includes(currentView)) { drawHeader(alpha); return; }
    return baseExpanded(alpha);
  };

  let shownView = '';
  (function position() {
    const view = typeof currentView !== 'undefined' ? currentView : '';
    const show = VIEWS.includes(view) && typeof mode !== 'undefined' && mode === 'expanded' && visual.width > 600 && visual.height > 245;
    const disp = show ? 'block' : 'none';
    if (root.style.display !== disp) root.style.display = disp;
    if (show) {
      window.__lumadockPage.place(root, contentRect());
      if (shownView !== view) {
        shownView = view;
        if (view === 'vault') Promise.all([refreshTotp(), refreshSecrets()]).then(render);
        else render();
      }
    } else shownView = '';
    requestAnimationFrame(position);
  })();
})();
