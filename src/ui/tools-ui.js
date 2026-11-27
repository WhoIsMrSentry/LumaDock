'use strict';
// Small tools in the island: persistent Vault & smart clipboard history, multi-ToDo,
// custom AI prompt templates, OCR/QR, and keyboard shortcuts Ctrl+Alt+1..8 & Ctrl+Alt+Space.
(function toolsPages() {
  const api = window.lumadock;
  if (!api?.clipsGet) return;
  const root = document.createElement('section'); root.id = 'lumadock-tools'; document.body.appendChild(root);
  const style = document.createElement('style'); style.textContent = `
#lumadock-tools{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 "Segoe UI Variable Text","Segoe UI",sans-serif;pointer-events:auto}
#lumadock-tools *{box-sizing:border-box}
#lumadock-tools .tl-head-btn{margin-top:10px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:#151715;color:#c9d0c6;padding:6px 12px;font:600 11px "Segoe UI",sans-serif;cursor:pointer}
#lumadock-tools .tl-head-btn:hover{background:#1e211e;color:#fff}
#lumadock-tools .tl-list{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:calc(100% - 66px);overflow:auto;padding-right:4px}
#lumadock-tools .tl-clip{position:relative;text-align:left;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:#121412;color:#e8ece6;padding:9px 11px;font:11px/1.4 "Cascadia Code",Consolas,monospace;cursor:pointer;white-space:pre-wrap;overflow:hidden;min-height:84px;display:flex;flex-direction:column;justify-content:space-between;transition:border-color .15s,background .15s,transform .1s}
#lumadock-tools .tl-clip:hover{border-color:rgba(198,233,148,.45);background:#161a15}
#lumadock-tools .tl-clip:active{transform:scale(.98)}
#lumadock-tools .tl-clip.done{border-color:#c6e994}
#lumadock-tools .tl-clip b.tl-tag{position:absolute;right:8px;top:7px;font:700 9.5px "Segoe UI",sans-serif;color:#c6e994;background:#1f2a18;border-radius:7px;padding:2px 6px;z-index:2}
#lumadock-tools .tl-img{display:flex;flex-direction:row;align-items:center;gap:10px;padding:8px 10px;font-family:"Segoe UI Variable Text","Segoe UI",sans-serif}
#lumadock-tools .tl-img img{width:86px;height:62px;object-fit:cover;border-radius:9px;background:#0a0c0a;flex:none;border:1px solid rgba(255,255,255,.08)}
#lumadock-tools .tl-meta{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}
#lumadock-tools .tl-meta small{color:#8f998d;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lumadock-tools .tl-acts{display:flex;gap:5px;flex-wrap:wrap}
#lumadock-tools .tl-pill{border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#1b201c;color:#dbe4d6;padding:3px 8px;font:600 10px "Segoe UI",sans-serif;cursor:pointer}
#lumadock-tools .tl-pill:hover{border-color:#c6e994;color:#fff}
#lumadock-tools .tl-pill.on{background:#c6e994;color:#10180c;border-color:#c6e994}
#lumadock-tools .tl-pill.qr{border-color:rgba(127,216,255,.45);color:#9ce3ff}
#lumadock-tools .tl-empty{height:calc(100% - 70px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#8f998d;border:1.5px dashed rgba(255,255,255,.1);border-radius:16px}
#lumadock-tools .tl-empty strong{color:#f2f5ed;font-size:13px}
#lumadock-tools textarea{width:100%;height:calc(100% - 70px);resize:none;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:#101210;color:#f2f5ed;padding:14px 16px;font:13px/1.55 "Segoe UI Variable Text","Segoe UI",sans-serif;outline:none}
#lumadock-tools textarea:focus{border-color:rgba(198,233,148,.4)}
#lumadock-tools .tl-tabs{display:flex;gap:5px;margin-top:9px}
#lumadock-tools .tl-tab{border:1px solid rgba(255,255,255,.1);border-radius:9px;background:#141814;color:#cbd4c6;padding:4px 10px;font:600 10.5px "Segoe UI",sans-serif;cursor:pointer}
#lumadock-tools .tl-tab.on{background:#c6e994;color:#10180c;border-color:#c6e994}
#lumadock-tools .tl-row{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:11px;background:#131613;border:1px solid rgba(255,255,255,.07);margin-bottom:6px}
#lumadock-tools .tl-row input{flex:1;min-width:0;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#0c0f0c;color:#fff;padding:5px 8px;font-size:11.5px;outline:none;user-select:text}`;
  document.head.appendChild(style);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));
  const t = (key, params) => (window.__lumadockT ? window.__lumadockT(key, params) : key);

  let qrDetector = null;
  try { if (typeof window.BarcodeDetector === 'function') qrDetector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { }
  async function scanQrOnClips() {
    if (!qrDetector) return;
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      if (c.kind !== 'image' || c.qrScanned || c.qrText || !c.thumbUrl) continue;
      c.qrScanned = true;
      try {
        const img = new Image();
        img.src = c.thumbUrl;
        await img.decode();
        const found = await qrDetector.detect(img);
        const val = found?.[0]?.rawValue;
        if (val) {
          c.qrText = val;
          await api.clipsSetQr?.(i, val).catch(() => { });
          render(true);
        }
      } catch { }
    }
  }

  let clips = [], vault = { pinned: [], prompts: [], todos: [] };
  let clipsTab = 'recent', noteTab = 'note', todoInput = '';
  let prTag = '', prTitle = '', prBody = '';
  let qrInput = '', qrDataUrl = '', ocrResultText = '', ocrResultSource = '';
  let copied = -1, ocrBusy = -1, lastRender = '';

  api.onOcrResult?.(res => {
    if (!res) return;
    ocrResultText = res.text || '';
    ocrResultSource = 'Screen Snip';
    if (res.text) {
      window.dispatchEvent(new CustomEvent('lumadock:badge', { detail: 'snip_ocr' }));
      window.__lumadockFlash?.(t('toolsPage.ocrCopied'), 2200);
    }
    clipsTab = 'ocr';
    setMode('expanded');
    setView('clips');
    render(true);
  });

  const loadVault = () => api.vaultGet?.().then(r => { if (r?.ok && r.vault) vault = r.vault; }).catch(() => { });
  const loadClips = () => Promise.all([api.clipsGet().then(r => { if (r.ok) { clips = r.clips; scanQrOnClips(); } }), loadVault()]).then(() => render(true)).catch(() => { });
  api.onClips?.(r => { clips = r.clips || []; scanQrOnClips(); render(true); });
  loadVault();

  let note = null, saveTimer = null;
  api.noteGet().then(r => { note = r.ok ? r.text : ''; render(true); }).catch(() => { note = ''; });

  function render(force) {
    const view = currentView;
    const keepFocusId = document.activeElement?.id;
    const keepStart = document.activeElement?.selectionStart;
    const sig = clips.map(c => (c.hash || c.text) + ':' + (c.ocrText ? '1' : '0') + ':' + (c.qrText || '')).join('|');
    const vsig = `${clipsTab}:${noteTab}:${(vault.pinned || []).length}:${(vault.todos || []).map(x => x.id + x.done).join(',')}:${(vault.prompts || []).map(p => p.id).join(',')}:${qrDataUrl.length}:${ocrResultText.length}`;
    const key = `${view}:${sig}:${vsig}:${copied}:${ocrBusy}:${note === null}`;
    if (!force && key === lastRender) return; lastRender = key;

    if (view === 'clips') {
      const pinnedSet = new Set((vault.pinned || []).map(p => p.text));
      const headBtns = `<div class="tl-tabs">
        <button type="button" class="tl-tab ${clipsTab === 'recent' ? 'on' : ''}" data-ctab="recent">${esc(t('toolsPage.recentTab'))}</button>
        <button type="button" class="tl-tab ${clipsTab === 'pinned' ? 'on' : ''}" data-ctab="pinned">${esc(t('toolsPage.vaultTab'))} (${(vault.pinned || []).length})</button>
        <button type="button" class="tl-tab ${clipsTab === 'qr' ? 'on' : ''}" data-ctab="qr">QR</button>
        <button type="button" class="tl-tab ${clipsTab === 'ocr' ? 'on' : ''}" data-ctab="ocr">OCR</button>
        ${clips.length ? `<button class="tl-tab" data-clear="1">${esc(t('common.clear'))}</button>` : ''}
      </div>`;
      const detectedQr = clips.filter(c => c.qrText).map((c, idx) => `<div class="tl-row"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.qrText)}</span><button type="button" class="tl-pill qr" data-copy-str="${esc(c.qrText)}">${esc(t('common.copy'))}</button></div>`).join('');
      const body = clipsTab === 'qr'
        ? `<div class="tl-row"><input id="tl-qr-in" type="text" placeholder="${esc(t('toolsPage.qrGenPh'))}" value="${esc(qrInput)}"><button type="button" class="tl-tab on" data-qr-gen="1">${esc(t('common.generate'))}</button></div>
           <div style="display:flex;gap:12px;align-items:center;padding:8px;border-radius:14px;background:#121512;border:1px solid rgba(255,255,255,.08);min-height:132px">
             ${qrDataUrl ? `<img src="${esc(qrDataUrl)}" alt="QR" style="width:116px;height:116px;border-radius:10px;background:#fff;padding:4px">` : `<div style="width:116px;height:116px;border-radius:10px;border:1px dashed rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;color:#7f8a7a;font-size:11px">QR</div>`}
             <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px"><b>${esc(t('toolsPage.qrAlwaysTitle'))}</b><small style="color:#8f998d">${esc(t('toolsPage.qrAlwaysSub'))}</small>${detectedQr}</div>
           </div>`
        : clipsTab === 'ocr'
        ? `<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
             <button type="button" class="tl-tab on" data-ocr-snip="1">${esc(t('toolsPage.ocrSnipBtn'))}</button>
             <button type="button" class="tl-tab" data-ocr-file="1">${esc(t('toolsPage.ocrPickFileBtn'))}</button>
             ${ocrResultText ? `<button type="button" class="tl-tab" data-copy-str="${esc(ocrResultText)}">${esc(t('common.copy'))}</button>` : ''}
           </div>
           <textarea readonly style="height:calc(100% - 106px)" placeholder="${esc(t('toolsPage.ocrEmptyPlaceholder'))}">${esc(ocrResultText || '')}</textarea>`
        : clipsTab === 'pinned'
        ? ((vault.pinned || []).length ? `<div class="tl-list">${vault.pinned.map((p, i) => `<div class="tl-clip" data-vp="${i}">
            ${p.badge ? `<b class="tl-tag">${esc(p.badge)}</b>` : ''}
            <div style="overflow:hidden;height:40px">${esc(p.text)}</div>
            <div class="tl-acts" style="margin-top:4px"><button type="button" class="tl-pill" data-vcopy="${i}">${esc(t('common.copy'))}</button><button type="button" class="tl-pill" data-vunpin="${esc(p.id)}">x</button></div>
          </div>`).join('')}</div>` : `<div class="tl-empty"><strong>${esc(t('toolsPage.vaultEmpty'))}</strong><span>${esc(t('toolsPage.vaultEmptySub'))}</span></div>`)
        : (clips.length ? `<div class="tl-list">${clips.map((c, i) => {
          if (c.kind === 'image') {
            return `<div class="tl-clip tl-img ${i === copied ? 'done' : ''}" data-i="${i}" role="button" tabindex="0">
              ${i === copied ? `<b class="tl-tag">${esc(t('common.copiedCheck'))}</b>` : ''}
              <img src="${esc(c.thumbUrl)}" alt="">
              <div class="tl-meta">
                <small>${esc(t('toolsPage.imageLabel'))} · ${esc(c.text)}</small>
                ${c.ocrText ? `<small style="color:#c6e994">${esc(c.ocrText)}</small>` : ''}
                <div class="tl-acts">
                  <button type="button" class="tl-pill" data-ocr="${i}">${ocrBusy === i ? '...' : esc(t('toolsPage.ocrBtn'))}</button>
                  ${c.qrText ? `<button type="button" class="tl-pill qr" data-qr="${i}" title="${esc(c.qrText)}">QR</button>` : ''}
                </div>
              </div>
            </div>`;
          }
          const isPin = pinnedSet.has(c.text);
          return `<div class="tl-clip ${i === copied ? 'done' : ''}" data-i="${i}">
            ${i === copied ? `<b class="tl-tag">${esc(t('common.copiedCheck'))}</b>` : c.kindTag ? `<b class="tl-tag">${esc(c.kindTag)}</b>` : ''}
            <div style="overflow:hidden;height:40px">${esc(c.text)}</div>
            <div class="tl-acts" style="margin-top:4px;position:relative;z-index:3"><button type="button" class="tl-pill ${isPin ? 'on' : ''}" data-pin="${i}">${isPin ? 'Pinned' : 'Pin'}</button></div>
          </div>`;
        }).join('')}</div>` : `<div class="tl-empty"><strong>${esc(t('toolsPage.clipboardEmptyTitle'))}</strong><span>${esc(t('toolsPage.clipboardEmptySub'))}</span></div>`);
      root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('toolsPage.clipboardTitle'))}</p><p class="tc-page-sub">${esc(t('toolsPage.clipboardSub'))}</p></div>${headBtns}</div>${body}`;
    } else if (view === 'note') {
      const head = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('toolsPage.noteTitle'))}</p><p class="tc-page-sub">${esc(t('toolsPage.noteSub'))}</p></div><div class="tl-tabs">
        <button type="button" class="tl-tab ${noteTab === 'note' ? 'on' : ''}" data-ntab="note">${esc(t('toolsPage.noteTab'))}</button>
        <button type="button" class="tl-tab ${noteTab === 'todo' ? 'on' : ''}" data-ntab="todo">To-Do (${(vault.todos || []).filter(x => !x.done).length})</button>
        <button type="button" class="tl-tab ${noteTab === 'prompts' ? 'on' : ''}" data-ntab="prompts">${esc(t('toolsPage.promptsTab'))}</button>
      </div></div>`;
      if (noteTab === 'note') {
        const existing = root.querySelector('textarea#tl-note');
        if (existing) {
          const titleEl = root.querySelector('.tc-page-title');
          const subEl = root.querySelector('.tc-page-sub');
          if (titleEl) titleEl.textContent = t('toolsPage.noteTitle');
          if (subEl) subEl.textContent = t('toolsPage.noteSub');
          existing.placeholder = t('toolsPage.notePlaceholder');
          return;
        }
        root.innerHTML = `${head}<textarea id="tl-note" placeholder="${esc(t('toolsPage.notePlaceholder'))}" maxlength="20000">${esc(note || '')}</textarea>`;
        const area = root.querySelector('textarea');
        area.addEventListener('focus', () => { projectInputFocused = true; sendInteractive(true); });
        area.addEventListener('blur', () => { projectInputFocused = false; });
        area.addEventListener('input', () => { note = area.value; clearTimeout(saveTimer); saveTimer = setTimeout(() => api.noteSet(note).catch(() => { }), 400); });
      } else if (noteTab === 'todo') {
        root.innerHTML = `${head}<div class="tl-row"><input id="tl-todo-in" type="text" placeholder="${esc(t('toolsPage.todoPh'))}" value="${esc(todoInput)}"><button type="button" class="tl-tab on" data-todo-add="1">+</button></div>
          <div style="max-height:calc(100% - 110px);overflow:auto">${(vault.todos || []).map(x => `<div class="tl-row">
            <button type="button" class="tl-pill ${x.done ? 'on' : ''}" data-todo-tog="${esc(x.id)}">${x.done ? 'OK' : '  '}</button>
            <span style="flex:1;${x.done ? 'text-decoration:line-through;opacity:.55' : ''}">${esc(x.text)}</span>
            <button type="button" class="tl-pill" data-todo-del="${esc(x.id)}">x</button>
          </div>`).join('')}</div>`;
      } else {
        root.innerHTML = `${head}
          <div class="tl-row">
            <input id="tl-pr-tag" type="text" placeholder="/tag" value="${esc(prTag)}" style="max-width:64px">
            <input id="tl-pr-title" type="text" placeholder="${esc(t('studio.cmdNamePh'))}" value="${esc(prTitle)}" style="max-width:120px">
            <input id="tl-pr-body" type="text" placeholder="${esc(t('toolsPage.promptBodyPh'))}" value="${esc(prBody)}">
            <button type="button" class="tl-tab on" data-pr-save="1">+</button>
          </div>
          <div class="tl-list" style="max-height:calc(100% - 110px)">${(vault.prompts || []).map((pr, idx) => `<div class="tl-clip">
            <b class="tl-tag">${esc(pr.tag)}</b>
            <div style="font-weight:700;margin-bottom:3px;padding-right:48px">${esc(pr.title)}</div>
            <div style="opacity:.75;height:28px;overflow:hidden">${esc(pr.body)}</div>
            <div class="tl-acts" style="margin-top:4px;position:relative;z-index:3"><button type="button" class="tl-pill" data-prcopy="${idx}">${esc(t('common.copy'))}</button><button type="button" class="tl-pill" data-prai="${idx}">AI</button><button type="button" class="tl-pill" data-prdel="${esc(pr.id)}">x</button></div>
          </div>`).join('')}</div>`;
      }
      if (keepFocusId) {
        const el = root.querySelector('#' + keepFocusId);
        if (el) { el.focus(); try { el.setSelectionRange(keepStart, keepStart); } catch { } }
      }
    }
  }
  window.__lumadockI18n?.onChange?.(() => { lastRender = ''; if (shown) render(true); });

  root.addEventListener('input', e => {
    if (e.target.id === 'tl-todo-in') todoInput = e.target.value;
    if (e.target.id === 'tl-pr-tag') prTag = e.target.value;
    if (e.target.id === 'tl-pr-title') prTitle = e.target.value;
    if (e.target.id === 'tl-pr-body') prBody = e.target.value;
    if (e.target.id === 'tl-qr-in') qrInput = e.target.value;
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'tl-todo-in') { e.preventDefault(); root.querySelector('[data-todo-add]')?.click(); }
    if (e.key === 'Enter' && e.target.id === 'tl-pr-body') { e.preventDefault(); root.querySelector('[data-pr-save]')?.click(); }
    if (e.key === 'Enter' && e.target.id === 'tl-qr-in') { e.preventDefault(); root.querySelector('[data-qr-gen]')?.click(); }
  });
  root.addEventListener('focusin', e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') { projectInputFocused = true; sendInteractive(true); } });
  root.addEventListener('focusout', () => { setTimeout(() => { if (!root.contains(document.activeElement)) projectInputFocused = false; }, 0); });

  root.addEventListener('click', async e => {
    const ctab = e.target.closest('[data-ctab]'); if (ctab) { clipsTab = ctab.dataset.ctab; await loadVault(); render(true); return; }
    if (e.target.closest('[data-qr-gen]') && qrInput.trim()) {
      const r = await api.qrGenerate?.(qrInput.trim());
      if (r?.ok) { qrDataUrl = r.dataUrl; render(true); }
      return;
    }
    if (e.target.closest('[data-ocr-snip]')) { setMode('rest'); setTimeout(() => api.snipStart?.({ autoAction: 'ocr' }), 90); return; }
    if (e.target.closest('[data-ocr-file]')) {
      const r = await api.ocrFilePick?.();
      if (r?.ok) { ocrResultText = r.text || ''; ocrResultSource = r.fileName || ''; if (r.text) window.dispatchEvent(new CustomEvent('lumadock:badge', { detail: 'snip_ocr' })); render(true); }
      return;
    }
    const copyStr = e.target.closest('[data-copy-str]');
    if (copyStr) { await api.copyText?.(copyStr.dataset.copyStr); window.__lumadockFlash?.(t('common.copiedCheck'), 1400); return; }
    const ntab = e.target.closest('[data-ntab]'); if (ntab) { noteTab = ntab.dataset.ntab; await loadVault(); render(true); return; }
    const pinBtn = e.target.closest('[data-pin]');
    if (pinBtn) { e.stopPropagation(); const item = clips[Number(pinBtn.dataset.pin)]; if (item?.text) { const r = await api.vaultPin?.(item.text); if (r?.vault) vault = r.vault; render(true); } return; }
    const unpinBtn = e.target.closest('[data-vunpin]');
    if (unpinBtn) { e.stopPropagation(); const r = await api.vaultPin?.('x', unpinBtn.dataset.vunpin); if (r?.vault) vault = r.vault; render(true); return; }
    const vcopy = e.target.closest('[data-vcopy]');
    if (vcopy) { e.stopPropagation(); const p = vault.pinned?.[Number(vcopy.dataset.vcopy)]; if (p) { await api.copyText?.(p.text); window.__lumadockFlash?.(t('common.copiedCheck'), 1200); } return; }
    if (e.target.closest('[data-todo-add]') && todoInput.trim()) { const r = await api.vaultTodoAdd?.(todoInput.trim()); todoInput = ''; if (r?.vault) vault = r.vault; render(true); return; }
    const ttog = e.target.closest('[data-todo-tog]');
    if (ttog) { const r = await api.vaultTodoToggle?.(ttog.dataset.todoTog); if (r?.vault) vault = r.vault; render(true); return; }
    const tdel = e.target.closest('[data-todo-del]');
    if (tdel) { const r = await api.vaultTodoDel?.(tdel.dataset.todoDel); if (r?.vault) vault = r.vault; render(true); return; }
    if (e.target.closest('[data-pr-save]') && prTitle.trim() && prBody.trim()) {
      const r = await api.vaultPromptSave?.({ tag: prTag.trim(), title: prTitle.trim(), body: prBody });
      prTag = ''; prTitle = ''; prBody = '';
      if (r?.vault) vault = r.vault;
      render(true);
      return;
    }
    const prdel = e.target.closest('[data-prdel]');
    if (prdel) { const r = await api.vaultPromptDel?.(prdel.dataset.prdel); if (r?.vault) vault = r.vault; render(true); return; }
    const prcopy = e.target.closest('[data-prcopy]');
    if (prcopy) { const pr = vault.prompts?.[Number(prcopy.dataset.prcopy)]; if (pr) { await api.copyText?.(pr.body); window.__lumadockFlash?.(t('common.copiedCheck'), 1200); } return; }
    const prai = e.target.closest('[data-prai]');
    if (prai) { const pr = vault.prompts?.[Number(prai.dataset.prai)]; if (pr) { await api.aiRelaySend?.('claudecode', pr.body); } return; }
    const ocrBtn = e.target.closest('[data-ocr]');
    if (ocrBtn) {
      e.stopPropagation();
      const idx = Number(ocrBtn.dataset.ocr);
      ocrBusy = idx; render(true);
      try {
        const r = await api.clipsOcr(idx, true);
        if (r?.clips) clips = r.clips;
        window.__lumadockFlash?.(r?.ok && r.text ? t('toolsPage.ocrCopied') : (r?.error || t('toolsPage.ocrEmpty')), 2000);
      } finally { ocrBusy = -1; render(true); }
      return;
    }
    const qrBtn = e.target.closest('[data-qr]');
    if (qrBtn) {
      e.stopPropagation();
      const val = clips[Number(qrBtn.dataset.qr)]?.qrText;
      if (val) {
        if (/^https?:\/\//i.test(val)) api.openUrl?.(val);
        await api.copyText?.(val);
        window.__lumadockFlash?.('QR: ' + val, 2400);
      }
      return;
    }
    const clip = e.target.closest('[data-i]');
    if (clip) {
      api.clipsCopy(Number(clip.dataset.i)).then(r => {
        if (r.ok) { clips = r.clips; copied = 0; render(true); sound('click'); setTimeout(() => { copied = -1; render(true); }, 1400); }
      });
      return;
    }
    if (e.target.closest('[data-clear]')) api.clipsClear().then(r => { if (r.ok) { clips = []; render(true); } });
  });

  let shown = '';
  (function position() {
    const view = currentView, show = ['clips', 'note'].includes(view) && mode === 'expanded' && visual.width > 600 && visual.height > 220;
    const display = show ? 'block' : 'none'; if (root.style.display !== display) root.style.display = display;
    if (show) {
      window.__lumadockPage.place(root, contentRect());
      if (shown !== view) { shown = view; lastRender = ''; root.innerHTML = ''; if (view === 'clips') loadClips(); render(true); }
    } else shown = '';
    requestAnimationFrame(position);
  })();

  api.onShortcut?.(view => {
    if (view === 'claude') { window.__lumadockMonitor?.open('claudecode'); return; }
    setMode('expanded');
    setView(view);
  });
  canvas.addEventListener('click', e => {
    if (mode !== 'expanded' || !['home', 'apps', 'shortcuts'].includes(currentView)) return;
    for (const [key, view] of [['clipsApp', 'clips'], ['noteApp', 'note']]) if (inside(e.clientX, e.clientY, hit[key])) { e.preventDefault(); e.stopImmediatePropagation(); setView(view); return; }
  }, true);
  window.__lumadockTools = {
    open: (view, tab) => {
      if (tab) {
        if (view === 'clips') clipsTab = tab;
        if (view === 'note') noteTab = tab;
      }
      setView(view);
      loadVault().then(() => render(true));
    }
  };
})();
