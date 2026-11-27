'use strict';
// GitHub Hub + Local Git + Uptime Monitor view.
(function githubUiPage() {
  const api = window.lumadock;
  if (!api?.githubSummary) return;

  const VIEW = 'github';
  const root = document.createElement('section');
  root.id = 'lumadock-github';
  document.body.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
#lumadock-github{position:absolute;z-index:60;display:none;color:#f4f7ef;font:12px/1.4 "Segoe UI Variable Text","Segoe UI",sans-serif;pointer-events:auto}
#lumadock-github *{box-sizing:border-box}
#lumadock-github .gh-tabs{display:flex;gap:5px;margin-top:8px;flex-wrap:wrap}
#lumadock-github .gh-btn{border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#171c17;color:#dfe7da;padding:5px 10px;font:600 11px "Segoe UI",sans-serif;cursor:pointer;white-space:nowrap}
#lumadock-github .gh-btn:hover{background:#232b22;color:#fff}
#lumadock-github .gh-btn.on,#lumadock-github .gh-btn.pri{background:#c6e994;color:#11180d;border-color:#c6e994}
#lumadock-github .gh-btn.bad{background:rgba(255,95,86,.14);border-color:rgba(255,95,86,.35);color:#ffaba3}
#lumadock-github .gh-cols{display:grid;grid-template-columns:1.25fr 1fr;gap:10px;height:calc(100% - 62px)}
#lumadock-github .gh-card{background:#121612;border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-height:0;overflow:auto}
#lumadock-github .gh-card h4{margin:0;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#8f998d;display:flex;align-items:center;justify-content:space-between}
#lumadock-github .gh-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
#lumadock-github .gh-kpi{background:rgba(255,255,255,.04);border-radius:10px;padding:6px 8px}
#lumadock-github .gh-kpi small{display:block;font-size:9.5px;color:#8f998d}
#lumadock-github .gh-kpi b{font-size:15px;color:#c6e994}
#lumadock-github .gh-heat{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,9px);gap:3px;overflow-x:auto;padding:4px 0}
#lumadock-github .gh-c{width:9px;height:9px;border-radius:2px;background:rgba(255,255,255,.07)}
#lumadock-github .gh-c[data-l="1"]{background:#1e4a2b}#lumadock-github .gh-c[data-l="2"]{background:#2c7a43}#lumadock-github .gh-c[data-l="3"]{background:#42ad5d}#lumadock-github .gh-c[data-l="4"]{background:#7ee787}
#lumadock-github .gh-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;border-radius:10px;background:rgba(255,255,255,.04);cursor:pointer}
#lumadock-github .gh-row:hover{background:rgba(255,255,255,.08)}
#lumadock-github .gh-row b{font-size:11.5px;color:#f2f5ef}
#lumadock-github .gh-row small{color:#8f998d;font-size:10px}
#lumadock-github input{border:1px solid rgba(255,255,255,.11);border-radius:9px;background:#0b0e0b;color:#fff;padding:5px 8px;font:11.5px "Segoe UI",sans-serif;outline:none;user-select:text}`;
  document.head.appendChild(style);

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const t = (k, p) => (window.__lumadockT ? window.__lumadockT(k, p) : k);

  let ghTab = 'overview'; // overview | prs | social | ci
  let ghData = null;
  let gitLocal = null;
  let uptimeList = [];
  let upName = '', upUrl = '';
  let loading = false;

  window.__lumadockGitHubData = () => ghData;

  async function refresh(force = false) {
    loading = true;
    render();
    try {
      const [g, l, u] = await Promise.all([
        api.githubSummary(force).catch(() => null),
        api.gitStatus?.().catch(() => null),
        api.uptimeList?.().catch(() => null)
      ]);
      if (g) {
        ghData = g;
        if (g.ok) window.dispatchEvent(new CustomEvent('lumadock:github-stats', { detail: g }));
      }
      if (l?.ok) gitLocal = l.git || null;
      if (u?.ok) uptimeList = u.monitors || [];
    } finally {
      loading = false;
      render();
    }
  }

  api.onUptimeAlert?.(a => {
    if (!a) return;
    window.__lumadockBuddyBurst?.(a.up ? 'happy' : 'surprised', `${a.name}: ${a.up ? 'UP' : 'DOWN'}`, 5000, a.up ? '#22e05a' : '#ff3b3b');
  });

  setTimeout(() => refresh(false), 3000);
  setInterval(() => { if (!document.hidden) refresh(false); }, 4 * 60000);

  function render() {
    if ((typeof currentView !== 'undefined' ? currentView : '') !== VIEW) return;
    const g = ghData;
    const tabs = `<div class="gh-tabs">
      <button type="button" class="gh-btn ${ghTab === 'overview' ? 'on' : ''}" data-gtab="overview">${esc(t('githubPage.tabOverview'))}</button>
      <button type="button" class="gh-btn ${ghTab === 'prs' ? 'on' : ''}" data-gtab="prs">PR / Issue</button>
      <button type="button" class="gh-btn ${ghTab === 'social' ? 'on' : ''}" data-gtab="social">${esc(t('githubPage.tabActivity'))}</button>
      <button type="button" class="gh-btn ${ghTab === 'ci' ? 'on' : ''}" data-gtab="ci">CI / Uptime</button>
      <button type="button" class="gh-btn" data-grefresh="1" ${loading ? 'disabled' : ''}>${loading ? '...' : esc(t('common.refresh'))}</button>
    </div>`;

    let body = '';
    if (!g || !g.ok) {
      body = `<div class="gh-card" style="height:calc(100% - 62px)">
        <p style="margin:6px 0;color:#cfd6cb">${esc(g?.error === 'no_username' ? t('githubPage.connectHint') : (g?.error || t('common.loading')))}</p>
        <div><button type="button" class="gh-btn pri" data-open-settings="connect">${esc(t('githubPage.openSettings'))}</button></div>
      </div>`;
    } else if (ghTab === 'overview') {
      const days = (g.days || []).slice(-140);
      const gitBox = gitLocal?.available
        ? `<div class="gh-row"><div><b>${esc(gitLocal.branch)}</b> <small>${esc(gitLocal.repo)}${gitLocal.ahead ? ` · +${gitLocal.ahead}` : ''}${gitLocal.behind ? ` · -${gitLocal.behind}` : ''}</small></div><b>${gitLocal.dirty ? esc(t('devPage.dirtyCount', { count: gitLocal.dirty })) : esc(t('devPage.clean'))}</b></div>
           ${(gitLocal.files || []).slice(0, 4).map(f => `<div class="gh-row"><small>${esc(f.file)}</small><b>${esc(f.status)}</b></div>`).join('')}`
        : `<small style="color:#8f998d">${esc(t('devPage.noGit'))}</small>`;
      body = `<div class="gh-cols">
        <div class="gh-card">
          <h4>@${esc(g.username)} · ${esc(t('githubPage.contributionsTitle'))}</h4>
          <div class="gh-kpis">
            <div class="gh-kpi"><small>${esc(t('githubPage.currentStreak'))}</small><b>${g.currentStreak || 0}d</b></div>
            <div class="gh-kpi"><small>${esc(t('githubPage.longestStreak'))}</small><b>${g.longestStreak || 0}d</b></div>
            <div class="gh-kpi"><small>${esc(t('githubPage.yearTotal'))}</small><b>${g.totalContributions || 0}</b></div>
            <div class="gh-kpi"><small>PR / Issue</small><b>${(g.prs || []).length} / ${(g.issues || []).length}</b></div>
          </div>
          <div class="gh-heat">${days.map(d => `<i class="gh-c" data-l="${d.level || 0}" title="${esc(d.date)}: ${esc(String(d.count || 0))}"></i>`).join('')}</div>
        </div>
        <div class="gh-card">
          <h4>${esc(t('devPage.gitTitle'))}</h4>
          ${gitBox}
        </div>
      </div>`;
    } else if (ghTab === 'prs') {
      const prsHtml = (g.prs || []).slice(0, 12).map(p => `<div class="gh-row" data-url="${esc(p.url)}"><div style="min-width:0;flex:1"><b>#${esc(String(p.number || ''))} ${esc(p.title)}</b><small>${esc(p.repo)}${p.draft ? ' · draft' : ''}</small></div><small>${esc(t('common.open'))}</small></div>`).join('') || `<small style="color:#8f998d">${esc(t('githubPage.noPrs'))}</small>`;
      const issHtml = (g.issues || []).slice(0, 12).map(i => `<div class="gh-row" data-url="${esc(i.url)}"><div style="min-width:0;flex:1"><b>#${esc(String(i.number || ''))} ${esc(i.title)}</b><small>${esc(i.repo)}</small></div><small>${esc(t('common.open'))}</small></div>`).join('') || `<small style="color:#8f998d">${esc(t('githubPage.noIssues'))}</small>`;
      body = `<div class="gh-cols"><div class="gh-card"><h4>Pull Requests (${(g.prs || []).length})</h4>${prsHtml}</div><div class="gh-card"><h4>Issues (${(g.issues || []).length})</h4>${issHtml}</div></div>`;
    } else if (ghTab === 'social') {
      const starsHtml = (g.stargazers || []).slice(0, 15).map(s => `<div class="gh-row" data-url="${esc(s.url)}"><div><b>${esc(s.user)}</b> <small>${esc(s.repo)}</small></div><small>STAR</small></div>`).join('') || `<small style="color:#8f998d">${esc(t('githubPage.noStars'))}</small>`;
      const folHtml = (g.followingEvents || g.following || []).slice(0, 15).map(f => `<div class="gh-row" data-url="${esc(f.url)}"><div style="min-width:0;flex:1"><b>${esc(f.actor)}</b> <small>${esc(f.detail || f.action)} · ${esc(f.repo)}</small></div></div>`).join('') || `<small style="color:#8f998d">${esc(t('githubPage.noFollowing'))}</small>`;
      body = `<div class="gh-cols"><div class="gh-card"><h4>${esc(t('githubPage.recentStars'))}</h4>${starsHtml}</div><div class="gh-card"><h4>${esc(t('githubPage.followingTitle'))}</h4>${folHtml}</div></div>`;
    } else {
      const runsHtml = (g.workflowRuns || []).slice(0, 8).map(w => `<div class="gh-row" data-url="${esc(w.url)}"><div><b>${esc(w.repo)}</b> <small>${esc(w.name)}</small></div><b style="color:${w.conclusion === 'success' ? '#8fd65a' : w.conclusion === 'failure' ? '#ff8a8a' : '#ffd28a'}">${esc(w.conclusion || w.status)}</b></div>`).join('') || `<small style="color:#8f998d">${esc(t('githubPage.noCi'))}</small>`;
      const upHtml = uptimeList.map(u => `<div class="gh-row"><div><b>${esc(u.name)}</b> <small>${esc(u.url)} (${u.latencyMs || 0}ms)</small></div><div style="display:flex;align-items:center;gap:5px"><b style="color:${u.lastOk ? '#8fd65a' : '#ff8a8a'}">${u.lastStatus || (u.lastOk ? 'UP' : 'ERR')}</b><button type="button" class="gh-btn bad" data-up-del="${esc(u.id)}">x</button></div></div>`).join('') || `<small style="color:#8f998d">${esc(t('powerTools.uptimeEmpty'))}</small>`;
      body = `<div class="gh-cols">
        <div class="gh-card"><h4>GitHub Actions</h4>${runsHtml}</div>
        <div class="gh-card">
          <h4>Uptime Monitor <button type="button" class="gh-btn" data-up-check="1">${esc(t('common.refresh'))}</button></h4>
          ${upHtml}
          <div style="display:flex;gap:5px;margin-top:auto"><input id="gh-up-name" placeholder="API" value="${esc(upName)}" style="width:74px"><input id="gh-up-url" placeholder="https://..." value="${esc(upUrl)}" style="flex:1"><button type="button" class="gh-btn pri" data-up-add="1">+</button></div>
        </div>
      </div>`;
    }

    root.innerHTML = `<div class="tc-page-head"><div><p class="tc-page-title">${esc(t('appsDir.githubName'))}</p><p class="tc-page-sub">${esc(t('githubPage.sub'))}</p></div>${tabs}</div>${body}`;
  }

  root.addEventListener('input', e => {
    if (e.target.id === 'gh-up-name') upName = e.target.value;
    if (e.target.id === 'gh-up-url') upUrl = e.target.value;
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (b) {
      if (b.dataset.gtab) { ghTab = b.dataset.gtab; render(); return; }
      if (b.dataset.grefresh) { await refresh(true); return; }
      if (b.dataset.openSettings) { api.settingsOpen?.(b.dataset.openSettings); return; }
      if (b.dataset.upDel) { const r = await api.uptimeDel?.(b.dataset.upDel); if (r?.ok) uptimeList = r.monitors || []; render(); return; }
      if (b.dataset.upCheck) { const r = await api.uptimeCheck?.(); if (r?.ok) uptimeList = r.monitors || []; render(); return; }
      if (b.dataset.upAdd && upName.trim() && upUrl.trim()) {
        const r = await api.uptimeAdd?.({ name: upName.trim(), url: upUrl.trim() });
        upName = ''; upUrl = '';
        if (r?.ok) uptimeList = r.monitors || [];
        render(); return;
      }
      return;
    }
    const row = e.target.closest('[data-url]');
    if (row?.dataset.url) api.openUrl?.(row.dataset.url);
  });
  root.addEventListener('focusin', () => { projectInputFocused = true; sendInteractive(true); });
  root.addEventListener('focusout', () => { setTimeout(() => { if (!root.contains(document.activeElement)) projectInputFocused = false; }, 0); });
  window.__lumadockI18n?.onChange?.(() => render());

  const baseExpanded = drawExpanded;
  drawExpanded = function (alpha) {
    if (typeof currentView !== 'undefined' && currentView === VIEW) { drawHeader(alpha); return; }
    return baseExpanded(alpha);
  };

  let shown = false;
  (function position() {
    const show = typeof currentView !== 'undefined' && currentView === VIEW && typeof mode !== 'undefined' && mode === 'expanded' && visual.width > 600 && visual.height > 245;
    const disp = show ? 'block' : 'none';
    if (root.style.display !== disp) root.style.display = disp;
    if (show) {
      window.__lumadockPage.place(root, contentRect());
      if (!shown) { shown = true; refresh(false); }
    } else shown = false;
    requestAnimationFrame(position);
  })();
})();
