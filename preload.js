(function preloadBridge() {
  'use strict';

  const { contextBridge, ipcRenderer, webUtils } = require('electron');

  function subscribe(channel, callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, data) => callback(data);

    ipcRenderer.on(channel, listener);

    return () => ipcRenderer.removeListener(channel, listener);
  }

  contextBridge.exposeInMainWorld('lumadock', {
    i18nBundle: () => ipcRenderer.sendSync('i18n:get-bundle'),
    i18nSetLang: lang => ipcRenderer.invoke('i18n:set-lang', lang),
    onI18nChanged: callback => subscribe('i18n:lang-changed', callback),
    connect: () => ipcRenderer.invoke('lumadock:connect'),
    getConnection: () => ipcRenderer.invoke('lumadock:get-connection'),
    getState: () => ipcRenderer.invoke('lumadock:get-state'),

    spotifyConnect: options => ipcRenderer.invoke('spotify:connect', options),
    spotifyReconnect: () => ipcRenderer.invoke('spotify:connect', { force: true }),
    spotifyGetState: () => ipcRenderer.invoke('spotify:get-state'),
    spotifyControl: action =>
      ipcRenderer.invoke('spotify:control', action),
    spotifyDevices: () => ipcRenderer.invoke('spotify:devices'),
    spotifyTransfer: id => ipcRenderer.invoke('spotify:transfer', id),
    spotifyPlaylists: force => ipcRenderer.invoke('spotify:playlists', force),
    spotifyPlaylistTracks: (id, force) => ipcRenderer.invoke('spotify:playlist-tracks', id, Boolean(force)),
    spotifyPlayPlaylist: (uri, url, offsetUri) => ipcRenderer.invoke('spotify:play-playlist', { uri, url, offsetUri }),
    spotifyAddPlaylistUrl: payload => ipcRenderer.invoke('spotify:add-playlist-url', payload),
    spotifyRemoveCustomPlaylist: id => ipcRenderer.invoke('spotify:remove-custom-playlist', id),
    spotifyLyrics: query => ipcRenderer.invoke('spotify:lyrics', query),
    spotifyGetConfig: () => ipcRenderer.invoke('spotify:get-config'),
    spotifySetClientId: clientId => ipcRenderer.invoke('spotify:set-client-id', clientId),
    spotifySeek: positionMs =>
      ipcRenderer.invoke('spotify:seek', positionMs),
    spotifyDisconnect: () =>
      ipcRenderer.invoke('spotify:disconnect'),
    onMediaStateChanged: callback => subscribe('media:state-changed', callback),
    onMediaArtworkLoaded: callback => subscribe('media:artwork-loaded', callback),
    onSpotifyAuthUpdated: callback => subscribe('spotify:auth-updated', callback),

    projectGet: () => ipcRenderer.invoke('project:get'),
    projectChoose: () => ipcRenderer.invoke('project:choose'),
    projectRescan: () => ipcRenderer.invoke('project:rescan'),
    projectSearch: query =>
      ipcRenderer.invoke('project:search', { query }),
    projectRead: (file, line = 1) =>
      ipcRenderer.invoke('project:read', { file, line }),

    projectAgentGet: () => ipcRenderer.invoke('project-agent:get'),
  projectAgentOpen: () => ipcRenderer.invoke('project-agent:open'),
  projectAgentSend: message => ipcRenderer.invoke('project-agent:send', { message }),
  projectAgentUndo: () => ipcRenderer.invoke('project-agent:undo'),
  onProjectAgentProgress: callback => subscribe('project-agent:progress', callback),
  projectEditorOpen: file => ipcRenderer.invoke('project-editor:open', { file }),
  projectEditorSend: (file, message) => ipcRenderer.invoke('project-editor:edit', { file, message }),
  projectEditorUndo: file => ipcRenderer.invoke('project-editor:undo', { file }),
  onProjectEditorProgress: callback => subscribe('project-editor:progress', callback),
  projectV2Get: () => ipcRenderer.invoke('projectv2:get'),
    projectV2Choose: () => ipcRenderer.invoke('projectv2:choose'),
    projectV2ListFiles: () =>
      ipcRenderer.invoke('projectv2:list-files'),
    projectV2AiStatus: () =>
      ipcRenderer.invoke('projectv2:ai-status'),
    projectV2ChatGet: file =>
      ipcRenderer.invoke('projectv2:chat-get', { file }),
    projectV2ChatSend: (file, message) =>
      ipcRenderer.invoke('projectv2:chat-send', { file, message }),
    projectV2ChatReset: file =>
      ipcRenderer.invoke('projectv2:chat-reset', { file }),

    aiSettingsGet: () => ipcRenderer.invoke('ai-settings:get'),
    aiSettingsSetProvider: provider =>
      ipcRenderer.invoke('ai-settings:set-provider', provider),
    aiSettingsSetKey: (type, key) =>
      ipcRenderer.invoke('ai-settings:set-key', { type, key }),
    aiSettingsClearKey: type =>
      ipcRenderer.invoke('ai-settings:clear-key', type),
    aiSettingsSetModel: model =>
      ipcRenderer.invoke('ai-settings:set-model', model),
    aiSettingsSetBaseUrl: baseUrl =>
      ipcRenderer.invoke('ai-settings:set-base-url', baseUrl),
    aiSettingsTest: () =>
      ipcRenderer.invoke('ai-settings:test'),
    aiSettingsChatGPTLogin: () =>
      ipcRenderer.invoke('ai-settings:chatgpt-login'),
    aiSettingsChatGPTCancel: () =>
      ipcRenderer.invoke('ai-settings:chatgpt-cancel'),
    aiSettingsChatGPTLogout: () =>
      ipcRenderer.invoke('ai-settings:chatgpt-logout'),

    aiMonitorGet: () => ipcRenderer.invoke('ai-monitor:get'),
    aiMonitorWindows: () => ipcRenderer.invoke('ai-monitor:windows'),
    aiMonitorConnect: (provider, targetId) => ipcRenderer.invoke('ai-monitor:connect', { provider, targetId }),
    aiMonitorDisconnect: provider => ipcRenderer.invoke('ai-monitor:disconnect', { provider }),
    aiMonitorOpenSource: provider => ipcRenderer.invoke('ai-monitor:open-source', { provider }),
    aiMonitorHooksInstall: agent => ipcRenderer.invoke('ai-monitor:hooks-install', { agent }),
    aiMonitorHooksUninstall: agent => ipcRenderer.invoke('ai-monitor:hooks-uninstall', { agent }),
    // Extras: file tray, calendar, weather, volume, Bluetooth battery
    pathForFile: file => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
    trayGet: () => ipcRenderer.invoke('extras:tray-get'),
    trayAdd: paths => ipcRenderer.invoke('extras:tray-add', { paths }),
    trayPickFiles: () => ipcRenderer.invoke('extras:tray-pick-files'),
    trayRemove: filePath => ipcRenderer.invoke('extras:tray-remove', { path: filePath }),
    trayOpen: filePath => ipcRenderer.invoke('extras:tray-open', { path: filePath }),
    trayDrag: filePath => ipcRenderer.send('extras:tray-drag', filePath),
    extrasConfig: config => ipcRenderer.invoke('extras:config', config),
    calendarNext: () => ipcRenderer.invoke('extras:calendar'),
    weatherNow: () => ipcRenderer.invoke('extras:weather'),
    onVolume: callback => subscribe('extras:volume', callback),
    onAudioPeak: callback => subscribe('extras:audio-peak', callback),
    volumeSet: level => ipcRenderer.invoke('extras:volume-set', level),
    volumeStep: delta => ipcRenderer.invoke('extras:volume-step', delta),
    volumeMute: () => ipcRenderer.invoke('extras:volume-mute'),
    onPrivacy: callback => subscribe('extras:privacy', callback),
    onFullscreen: callback => subscribe('extras:fullscreen', callback),
    onDownloads: callback => subscribe('extras:downloads', callback),
    downloadOpen: filePath => ipcRenderer.invoke('extras:download-open', { path: filePath }),
    systemStats: () => ipcRenderer.invoke('extras:system-stats'),
    windowDisplays: () => ipcRenderer.invoke('island:displays'),
    setWindowPrefs: prefs => ipcRenderer.send('island:window-prefs', prefs),
    openExternalUrl: url => ipcRenderer.invoke('lumadock:open-external', url),
    buddyPickColor: () => ipcRenderer.invoke('buddy:pick-color'),
    clipsGet: () => ipcRenderer.invoke('extras:clips-get'),
    clipsCopy: index => ipcRenderer.invoke('extras:clips-copy', { index }),
    clipsClear: () => ipcRenderer.invoke('extras:clips-clear'),
    clipsOcr: (index, copy = true) => ipcRenderer.invoke('extras:clip-ocr', { index, copy }),
    clipsSetQr: (index, qrText) => ipcRenderer.invoke('extras:clip-set-qr', { index, qrText }),
    ocrImage: (dataUrl, copy = true) => ipcRenderer.invoke('extras:ocr-image', { dataUrl, copy }),
    colorsGet: () => ipcRenderer.invoke('extras:colors-get'),
    colorsAdd: (hex, rgb) => ipcRenderer.invoke('extras:colors-add', { hex, rgb }),
    colorsClear: () => ipcRenderer.invoke('extras:colors-clear'),
    telemetryGet: () => ipcRenderer.invoke('extras:telemetry'),
    portsGet: () => ipcRenderer.invoke('extras:ports'),
    portKill: pid => ipcRenderer.invoke('extras:port-kill', { pid }),
    gitStatus: () => ipcRenderer.invoke('extras:git-status'),
    lanShareStart: paths => ipcRenderer.invoke('extras:lan-share-start', { paths }),
    lanShareStop: () => ipcRenderer.invoke('extras:lan-share-stop'),
    lanShareStatus: () => ipcRenderer.invoke('extras:lan-share-status'),
    marketGet: force => ipcRenderer.invoke('extras:market', { force: Boolean(force) }),
    onMarketUpdate: callback => subscribe('extras:market', callback),
    vaultGet: () => ipcRenderer.invoke('extras:vault-get'),
    vaultPin: (text, id) => ipcRenderer.invoke('extras:vault-pin', { text, id }),
    vaultPromptSave: prompt => ipcRenderer.invoke('extras:vault-prompt-save', prompt),
    vaultPromptDel: id => ipcRenderer.invoke('extras:vault-prompt-del', { id }),
    vaultTodoAdd: text => ipcRenderer.invoke('extras:vault-todo-add', { text }),
    vaultTodoToggle: id => ipcRenderer.invoke('extras:vault-todo-toggle', { id }),
    vaultTodoDel: id => ipcRenderer.invoke('extras:vault-todo-del', { id }),
    audioSessions: force => ipcRenderer.invoke('extras:audio-sessions', { force: Boolean(force) }),
    audioSetApp: (pid, volume) => ipcRenderer.invoke('extras:audio-set-app', { pid, volume }),
    audioMuteApp: (pid, muted) => ipcRenderer.invoke('extras:audio-mute-app', { pid, muted }),
    audioSetDevice: id => ipcRenderer.invoke('extras:audio-set-device', { id }),
    winList: () => ipcRenderer.invoke('extras:win-list'),
    winPin: (hwnd, mode, value) => ipcRenderer.invoke('extras:win-pin', { hwnd, mode, value }),
    snipStart: opts => ipcRenderer.invoke('extras:snip-start', opts || {}),
    eyedropperStart: mode => ipcRenderer.invoke('extras:eyedropper-start', { mode: mode || 'picker' }),
    ocrFilePick: () => ipcRenderer.invoke('extras:ocr-file-pick'),
    onOcrResult: callback => subscribe('extras:ocr-result', callback),
    screenSourceGet: () => ipcRenderer.invoke('extras:screen-source-get'),
    recordingSave: base64 => ipcRenderer.invoke('extras:recording-save', { base64 }),
    pinsList: () => ipcRenderer.invoke('extras:pins-list'),
    pinsClear: () => ipcRenderer.invoke('extras:pins-clear'),
    mediaZip: paths => ipcRenderer.invoke('extras:media-zip', { paths }),
    mediaConvert: (filePath, mode) => ipcRenderer.invoke('extras:media-convert', { path: filePath, mode }),
    mediaWriteWebp: (filePath, dataUrl) => ipcRenderer.invoke('extras:media-write-webp', { filePath, dataUrl }),
    contextGet: () => ipcRenderer.invoke('extras:context-get'),
    contextRules: rules => ipcRenderer.invoke('extras:context-rules', rules),
    contextUndo: () => ipcRenderer.invoke('extras:context-undo'),
    caffeineSet: on => ipcRenderer.invoke('extras:caffeine-set', { on: Boolean(on) }),
    shieldSet: on => ipcRenderer.invoke('extras:shield-set', { on: Boolean(on) }),
    focusSync: (active, addMinutes = 0) => ipcRenderer.invoke('extras:focus-sync', { active: Boolean(active), addMinutes }),
    workspaceLaunch: id => ipcRenderer.invoke('extras:workspace-launch', { id }),
    workspaceSave: ws => ipcRenderer.invoke('extras:workspace-save', ws),
    workspaceDelete: id => ipcRenderer.invoke('extras:workspace-delete', { id }),
    standupCopy: () => ipcRenderer.invoke('extras:standup-copy'),
    aiTimeline: () => ipcRenderer.invoke('extras:ai-timeline'),
    aiRelaySend: (target, text) => ipcRenderer.invoke('extras:ai-relay-send', { target, text }),
    watchdogList: () => ipcRenderer.invoke('extras:watchdog-list'),
    watchdogSave: job => ipcRenderer.invoke('extras:watchdog-save', job),
    watchdogDelete: id => ipcRenderer.invoke('extras:watchdog-delete', { id }),
    watchdogRun: (cmd, name, id) => ipcRenderer.invoke('extras:watchdog-run', { cmd, name, id }),
    watchdogStop: () => ipcRenderer.invoke('extras:watchdog-stop'),
    onActionStrip: callback => subscribe('extras:action-strip', callback),
    onContext: callback => subscribe('extras:context', callback),
    onFlowAlert: callback => subscribe('extras:flow-alert', callback),
    onWatchdog: callback => subscribe('extras:watchdog', callback),
    onWindowUpdate: callback => subscribe('extras:window', callback),
    onWindowState: callback => subscribe('extras:window-state', callback),
    onToast: callback => subscribe('extras:toast', callback),
    onPins: callback => subscribe('extras:pins', callback),
    onSnipAi: callback => subscribe('extras:snip-ai', callback),
    commandEval: query => ipcRenderer.invoke('extras:eval', { query }),
    translateText: (text, from, to) => ipcRenderer.invoke('extras:translate', { text, from, to }),
    copyText: text => ipcRenderer.invoke('extras:copy-text', { text }),
    onClips: callback => subscribe('extras:clips', callback),
    noteGet: () => ipcRenderer.invoke('extras:note-get'),
    noteSet: text => ipcRenderer.invoke('extras:note-set', { text }),
    onShortcut: callback => subscribe('extras:shortcut', callback),
    onBluetooth: callback => subscribe('extras:bluetooth', callback),
    aiMonitorHooksAnswer:(sessionId, answers) => ipcRenderer.invoke('ai-monitor:hooks-answer', { sessionId, answers }),
    aiMonitorHooksPlan: (sessionId, approve, feedback) => ipcRenderer.invoke('ai-monitor:hooks-plan', { sessionId, approve, feedback }),
    aiMonitorHooksJump: sessionId => ipcRenderer.invoke('ai-monitor:hooks-jump', { sessionId }),
    aiMonitorHooksModel: model => ipcRenderer.invoke('ai-monitor:hooks-model', { model }),
    aiMonitorHooksTest: (kind, command) => ipcRenderer.invoke('ai-monitor:hooks-test', { kind, command }),
    aiMonitorSetNotify:enabled => ipcRenderer.invoke('ai-monitor:set-notify', { enabled }),
    aiMonitorHooksReply:(sessionId, text) => ipcRenderer.invoke('ai-monitor:hooks-reply', { sessionId, text }),
    aiMonitorHooksSeen:() => ipcRenderer.invoke('ai-monitor:hooks-seen'),
    aiMonitorHooksDecide:(sessionId, behavior) => ipcRenderer.invoke('ai-monitor:hooks-decide', { sessionId, behavior }),
    aiMonitorReply:(provider, questionId, text) => ipcRenderer.invoke('ai-monitor:reply', { provider, questionId, text }),
    onAiMonitorState: callback => subscribe('ai-monitor:state', callback),
    onAiMonitorOpen: callback => subscribe('ai-monitor:open', callback),

    setIslandInteractive: interactive =>
      ipcRenderer.send('island:set-interactive', interactive),
    setIslandState: state =>
      ipcRenderer.send('island:set-state', state),
    setMode: mode =>
      ipcRenderer.send('window:set-mode', mode),
    openUrl: url =>
      ipcRenderer.send('lumadock:open-url', url),
    close: () =>
      ipcRenderer.send('window:close'),
    restart: () =>
      ipcRenderer.send('app:restart'),
    loginGet: () =>
      ipcRenderer.invoke('app:login-get'),
    loginSet: on =>
      ipcRenderer.invoke('app:login-set', Boolean(on)),
    onLoginChanged: callback => subscribe('app:login-changed', callback),
    notify: (title, body, url) =>
      ipcRenderer.send('lumadock:notify', { title, body, url }),
    onPointer: callback =>
      subscribe('companion:pointer', callback),
    onGoodbye: callback =>
      subscribe('lumadock:goodbye', callback),
    // Robo the buddy (buddy-main.cjs): grab him out of the island and drop him on the screen
    settingsOpen: tab => ipcRenderer.send('settings-app:open', typeof tab === 'string' ? tab : ''), // the LumaDock app, its own window
    buddyGrab: info => ipcRenderer.send('buddy:grab', info),
    buddyDrop: () => ipcRenderer.send('buddy:drop'),
    buddyFrame: url => ipcRenderer.send('buddy:frame', url),
    // Robo's chat in the island (chat-ui.js)
    buddyAsk: (kind, text, history, lang) => ipcRenderer.invoke('buddy:ask', { kind, text, history, lang }),
    buddyOcr: (copy = true) => ipcRenderer.invoke('buddy:ocr', { copy }),
    buddyApply: () => ipcRenderer.invoke('buddy:apply'),
    buddyForget: () => ipcRenderer.send('buddy:forget'),
    buddyAi: () => ipcRenderer.invoke('buddy:ai'),
    buddyUseAi: id => ipcRenderer.invoke('buddy:use-ai', id),
    buddyLogin: () => ipcRenderer.invoke('buddy:login'),
    buddyApplyFix: () => ipcRenderer.invoke('buddy:apply-fix'),
    buddyCancelFix: () => ipcRenderer.send('buddy:cancel-fix'),
    onBuddyChat: callback => subscribe('buddy:chat', callback),
    githubSummary: force => ipcRenderer.invoke('github:summary', { force: Boolean(force) }),
    githubConfigGet: () => ipcRenderer.invoke('github:config-get'),
    githubConfigSet: payload => ipcRenderer.invoke('github:config-set', payload),
    totpList: () => ipcRenderer.invoke('power:totp-list'),
    totpAdd: payload => ipcRenderer.invoke('power:totp-add', payload),
    totpDel: id => ipcRenderer.invoke('power:totp-del', { id }),
    totpCopy: id => ipcRenderer.invoke('power:totp-copy', { id }),
    secretList: () => ipcRenderer.invoke('power:secret-list'),
    secretAdd: payload => ipcRenderer.invoke('power:secret-add', payload),
    secretDel: id => ipcRenderer.invoke('power:secret-del', { id }),
    secretCopy: id => ipcRenderer.invoke('power:secret-copy', { id }),
    passwordGen: opts => ipcRenderer.invoke('power:password-gen', opts || {}),
    qrGenerate: text => ipcRenderer.invoke('power:qr-generate', { text }),
    brightnessList: () => ipcRenderer.invoke('power:brightness-list'),
    brightnessSet: (id, value) => ipcRenderer.invoke('power:brightness-set', { id, value }),
    topProcs: () => ipcRenderer.invoke('power:top-procs'),
    procKill: pid => ipcRenderer.invoke('power:proc-kill', { pid }),
    fileLocks: filePath => ipcRenderer.invoke('power:file-locks', { path: filePath }),
    fileLocksPick: () => ipcRenderer.invoke('power:file-locks-pick'),
    dockerList: () => ipcRenderer.invoke('power:docker-list'),
    dockerAction: (id, action) => ipcRenderer.invoke('power:docker-action', { id, action }),
    dockerLogs: id => ipcRenderer.invoke('power:docker-logs', { id }),
    uptimeList: () => ipcRenderer.invoke('power:uptime-list'),
    uptimeAdd: payload => ipcRenderer.invoke('power:uptime-add', payload),
    uptimeDel: id => ipcRenderer.invoke('power:uptime-del', { id }),
    uptimeCheck: () => ipcRenderer.invoke('power:uptime-check'),
    onUptimeAlert: callback => subscribe('power:uptime-alert', callback),
    httpSend: payload => ipcRenderer.invoke('power:http-send', payload),
    webhookStatus: () => ipcRenderer.invoke('power:webhook-status'),
    webhookStart: () => ipcRenderer.invoke('power:webhook-start'),
    webhookStop: () => ipcRenderer.invoke('power:webhook-stop'),
    onWebhookEvent: callback => subscribe('power:webhook-event', callback),
    netPing: () => ipcRenderer.invoke('power:net-ping'),
    speedTest: () => ipcRenderer.invoke('power:speedtest'),
    launcherIndex: () => ipcRenderer.invoke('power:launcher-index'),
    launcherRun: payload => ipcRenderer.invoke('power:launcher-run', payload),
    settingsFrame: url => ipcRenderer.send('settings-app:frame', url), // the settings app's own Robo
    // packs (license-main.cjs): which paid apps are open
    licenseGet: () => ipcRenderer.invoke('license:get'),
    onLicense: callback => subscribe('license:changed', callback),
    onBuddy: callback => {
      subscribe('buddy:home', () => callback('home'));
      subscribe('buddy:mood', data => callback('mood', data));
      subscribe('buddy:collapse', () => callback('collapse'));
      subscribe('buddy:dropped', () => callback('dropped'));
    }
  });
})();
