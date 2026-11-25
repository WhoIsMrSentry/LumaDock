'use strict';
// Context-Aware Autopilot, Smart Audio Ducking, Flow Distraction Guard, Caffeine,
// Presentation Shield, 1-Click Workspaces, and Local Standup Recall.
const fs = require('node:fs');
const path = require('node:path');
const i18n = require('../shared/i18n.cjs');

const DEFAULT_RULES = {
  meetingDuck: true,
  aiQuestionDuck: true,
  ideMode: true,
  flowGuard: true,
  autoActionStrip: true,
  presentationShield: false
};

const MEETING_RE = /\b(?:teams|zoom|webex|discord|meet\.google|whereby)\b/i;
const IDE_RE = /^(?:code|cursor|windsurf|idea64|pycharm64|webstorm64|windowsterminal|wt|powershell|pwsh|iterm2|terminal|devenv)$/i;
const DISTRACT_RE = /(?:youtube\.com|youtube\b|\bx\.com\b|twitter\.com|reddit\.com|instagram\.com|tiktok\.com|twitch\.tv|netflix\.com)/i;

function createContextEngine(deps = {}) {
  const readJson = deps.readJson || ((_f, fb) => fb);
  const writeJson = deps.writeJson || (() => {});
  const send = deps.send || (() => {});
  const onDuckChange = deps.onDuckChange || (() => {});
  const onOpenPathOrUrl = deps.onOpenPathOrUrl || (async () => {});

  const cfg = readJson('context-config.json', {});
  let rules = { ...DEFAULT_RULES, ...(cfg?.rules || {}) };
  let workspaces = Array.isArray(cfg?.workspaces) ? cfg.workspaces.slice(0, 8) : [
    { id: 'focus-dev', name: 'Deep Dev', icon: 'DEV', urls: [], apps: [], focusMin: 25, caffeine: true },
    { id: 'meeting', name: 'Meeting Safe', icon: 'MTG', urls: [], apps: [], presentation: true, duck: true }
  ];

  const todayKey = () => new Date().toISOString().slice(0, 10);
  const standupRaw = readJson('standup-log.json', {});
  let standup = standupRaw?.date === todayKey()
    ? standupRaw
    : { date: todayKey(), focusMins: 0, flowInterrupts: 0, projects: [], filesEdited: [], aiTurns: 0, buildsOk: 0, buildsFail: 0 };

  let currentContext = 'general'; // 'general' | 'meeting' | 'ide' | 'distracted'
  let lastWindow = null;
  let distractTimer = null;
  let focusActive = false;
  let undoRecord = null;
  let privacyActive = false;
  let aiAskingActive = false;
  let manualDuckHold = false;
  let ducked = false;
  let caffeineId = null;

  function saveConfig() {
    writeJson('context-config.json', { rules, workspaces });
  }
  function saveStandup() {
    if (standup.date !== todayKey()) {
      standup = { date: todayKey(), focusMins: 0, flowInterrupts: 0, projects: [], filesEdited: [], aiTurns: 0, buildsOk: 0, buildsFail: 0 };
    }
    writeJson('standup-log.json', standup);
  }

  function evaluateDucking() {
    const shouldDuck = manualDuckHold
      || (rules.meetingDuck && (privacyActive || currentContext === 'meeting'))
      || (rules.aiQuestionDuck && aiAskingActive);
    if (shouldDuck !== ducked) {
      ducked = shouldDuck;
      onDuckChange(ducked);
      send('extras:context', getState());
    }
  }

  function setFocusActive(active, addMinutes = 0) {
    focusActive = Boolean(active);
    if (addMinutes > 0) {
      standup.focusMins += Math.round(addMinutes);
      saveStandup();
    }
    if (!focusActive && distractTimer) {
      clearTimeout(distractTimer);
      distractTimer = null;
    }
    send('extras:context', getState());
  }

  function setPrivacyState({ mic, cam }) {
    const prev = privacyActive;
    privacyActive = Boolean(mic || cam);
    if (prev !== privacyActive) evaluateDucking();
  }

  function setAiAskingState(asking) {
    const next = Boolean(asking);
    if (aiAskingActive !== next) {
      aiAskingActive = next;
      evaluateDucking();
    }
  }

  function recordAiActivity({ files = [], branch = '', ok = null } = {}) {
    standup.aiTurns += 1;
    if (branch && !standup.projects.includes(branch)) standup.projects.push(branch);
    for (const f of files) {
      const b = path.basename(String(f || ''));
      if (b && !standup.filesEdited.includes(b)) standup.filesEdited.unshift(b);
    }
    standup.filesEdited = standup.filesEdited.slice(0, 20);
    if (ok === true) standup.buildsOk += 1;
    if (ok === false) standup.buildsFail += 1;
    saveStandup();
  }

  function clearDistractTimer() {
    if (distractTimer) { clearTimeout(distractTimer); distractTimer = null; }
  }

  function onForegroundWindow(win) {
    if (!win || !win.process) return;
    lastWindow = win;
    const label = `${win.process} ${win.title || ''}`;
    let nextCtx = 'general';
    if (MEETING_RE.test(label)) nextCtx = 'meeting';
    else if (IDE_RE.test(win.process)) nextCtx = 'ide';

    clearDistractTimer();
    if (focusActive && rules.flowGuard && DISTRACT_RE.test(label)) {
      const capturedTitle = String(win.title || win.process).slice(0, 64);
      distractTimer = setTimeout(() => {
        if (!focusActive || !rules.flowGuard) return;
        standup.flowInterrupts += 1;
        saveStandup();
        send('extras:flow-alert', { title: capturedTitle, process: win.process, interrupts: standup.flowInterrupts });
      }, 3000);
      distractTimer.unref?.();
    }

    if (nextCtx !== currentContext) {
      const prevCtx = currentContext;
      currentContext = nextCtx;
      if (nextCtx === 'meeting' && rules.meetingDuck) {
        undoRecord = { type: 'duck-meeting', prevCtx, at: Date.now() };
      } else if (nextCtx === 'ide' && rules.ideMode) {
        undoRecord = { type: 'ide-mode', prevCtx, at: Date.now() };
      } else {
        undoRecord = null;
      }
      evaluateDucking();
      send('extras:context', getState());
    }
  }

  function undoAutoAction() {
    if (!undoRecord) return { ok: false };
    const r = undoRecord;
    undoRecord = null;
    if (r.type === 'duck-meeting') {
      manualDuckHold = false;
      ducked = false;
      onDuckChange(false, true);
    }
    currentContext = r.prevCtx || 'general';
    send('extras:context', getState());
    return { ok: true };
  }

  function setRules(nextRules = {}) {
    rules = { ...rules, ...nextRules };
    saveConfig();
    evaluateDucking();
    send('extras:context', getState());
    return rules;
  }

  function setCaffeine(on, blocker) {
    if (on && caffeineId == null && blocker?.start) {
      caffeineId = blocker.start('prevent-display-sleep');
    } else if (!on && caffeineId != null && blocker?.stop) {
      try { if (blocker.isStarted?.(caffeineId)) blocker.stop(caffeineId); } catch {}
      caffeineId = null;
    }
    send('extras:context', getState());
    return caffeineId != null;
  }

  function setPresentationShield(on) {
    rules.presentationShield = Boolean(on);
    saveConfig();
    send('extras:context', getState());
    return rules.presentationShield;
  }

  async function launchWorkspace(id, blocker) {
    const ws = workspaces.find(w => w.id === id);
    if (!ws) return { ok: false };
    for (const u of (ws.urls || []).slice(0, 6)) {
      if (/^https?:\/\//i.test(String(u))) await onOpenPathOrUrl('url', u);
    }
    for (const p of (ws.apps || []).slice(0, 6)) {
      if (p && fs.existsSync(String(p))) await onOpenPathOrUrl('path', p);
    }
    if (ws.caffeine && blocker) setCaffeine(true, blocker);
    if (ws.presentation) setPresentationShield(true);
    if (ws.duck) { manualDuckHold = true; evaluateDucking(); }
    send('extras:context', getState());
    return { ok: true, workspace: ws };
  }

  function saveWorkspace(ws) {
    if (!ws || !String(ws.name || '').trim()) return workspaces;
    const clean = {
      id: ws.id || 'ws-' + Date.now().toString(36),
      name: String(ws.name).trim().slice(0, 32),
      icon: String(ws.icon || 'WS').slice(0, 4),
      urls: Array.isArray(ws.urls) ? ws.urls.filter(u => /^https?:\/\//i.test(String(u))).slice(0, 6) : [],
      apps: Array.isArray(ws.apps) ? ws.apps.filter(p => typeof p === 'string' && p.trim()).slice(0, 6) : [],
      caffeine: Boolean(ws.caffeine),
      presentation: Boolean(ws.presentation),
      duck: Boolean(ws.duck)
    };
    workspaces = [clean, ...workspaces.filter(w => w.id !== clean.id)].slice(0, 8);
    saveConfig();
    send('extras:context', getState());
    return workspaces;
  }

  function deleteWorkspace(id) {
    workspaces = workspaces.filter(w => w.id !== id);
    saveConfig();
    send('extras:context', getState());
    return workspaces;
  }

  function formatStandupMarkdown(lang = i18n.getLanguage()) {
    const isTr = lang === 'tr';
    const lines = [
      isTr ? `### LumaDock Günlük Özet (${standup.date})` : `### LumaDock Daily Standup (${standup.date})`,
      isTr ? `- Odak Süresi: **${standup.focusMins} dk** (Kesinti: ${standup.flowInterrupts})` : `- Focus Time: **${standup.focusMins} min** (Distractions: ${standup.flowInterrupts})`,
      isTr ? `- AI İşlem / Build: **${standup.aiTurns}** AI turu (${standup.buildsOk} OK / ${standup.buildsFail} ERR)` : `- AI & Builds: **${standup.aiTurns}** turns (${standup.buildsOk} OK / ${standup.buildsFail} ERR)`,
      standup.filesEdited.length
        ? (isTr ? `- Düzenlenen Dosyalar: ${standup.filesEdited.map(f => '`' + f + '`').join(', ')}` : `- Edited Files: ${standup.filesEdited.map(f => '`' + f + '`').join(', ')}`)
        : (isTr ? '- Düzenlenen Dosya: henüz yok' : '- Edited Files: none yet')
    ];
    return lines.join('\n');
  }

  function getState() {
    return {
      rules,
      context: currentContext,
      ducked,
      caffeine: caffeineId != null,
      shield: Boolean(rules.presentationShield),
      focusActive,
      undoAvailable: Boolean(undoRecord && Date.now() - undoRecord.at < 20000),
      lastWindow,
      workspaces,
      standup
    };
  }

  return {
    getState,
    setRules,
    onForegroundWindow,
    setPrivacyState,
    setAiAskingState,
    setFocusActive,
    setCaffeine,
    setPresentationShield,
    undoAutoAction,
    launchWorkspace,
    saveWorkspace,
    deleteWorkspace,
    recordAiActivity,
    formatStandupMarkdown
  };
}

module.exports = { createContextEngine, DEFAULT_RULES };
