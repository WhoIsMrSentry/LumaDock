'use strict';
const { createHash } = require('node:crypto');
const { t } = require('../shared/i18n.cjs');
const PROVIDERS = Object.freeze({
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  claude: { name: 'Claude', url: 'https://claude.ai/' }
});
const NATIVE_ERROR_KEYS = Object.freeze({
  'The connected window was closed.': 'monitor.errors.native.windowClosed',
  'This window no longer belongs to the same app.': 'monitor.errors.native.wrongApp',
  'The app was restarted. Please reconnect the window.': 'monitor.errors.native.appRestarted',
  'Password fields are never read.': 'monitor.errors.native.passwordProtected',
  'The input box cannot be read safely.': 'monitor.errors.native.inputUnreadable',
  'The active tab does not show a recognized ChatGPT or Claude conversation. Keep the chat in its own window.': 'monitor.errors.native.unrecognizedTab',
  'The browser does not expose this conversation to Windows.': 'monitor.errors.native.browserNotExposed',
  'The conversation changed. Reply was not sent.': 'monitor.errors.native.conversationChanged',
  'The question is no longer recognizable.': 'monitor.errors.native.questionUnrecognizable',
  'The question changed meanwhile. Reopen the conversation.': 'monitor.errors.native.questionChanged',
  'Unable to verify the conversation.': 'monitor.errors.native.verifyFailed',
  'A new message or prompt appeared. Check the conversation.': 'monitor.errors.native.newMessageAppeared',
  'The conversation changed meanwhile. Check the conversation.': 'monitor.errors.native.conversationChangedCheck',
  'Use a reply between 1 and 5000 characters.': 'monitor.errors.replyRangeError',
  'Unable to verify the conversation safely. Reopen the conversation.': 'monitor.errors.native.verifySafelyFailed',
  'The AI is already working again. Reply was not sent.': 'monitor.errors.native.aiAlreadyWorking',
  'The target input box is no longer available.': 'monitor.errors.native.targetInputUnavailable',
  'There is already text in the input box. It will not be overwritten.': 'monitor.errors.native.inputNotEmpty',
  'Focus changed. Check the input box; reply was not sent.': 'monitor.errors.native.focusChanged',
  'Windows interrupted text input. Check the conversation.': 'monitor.errors.native.textInputInterrupted',
  'The entered text was not confirmed. Check the conversation.': 'monitor.errors.native.textNotConfirmed',
  'The conversation is no longer readable. Check your entered reply.': 'monitor.errors.native.conversationUnreadableReply',
  'Multiple send buttons found. Send your reply in the app.': 'monitor.errors.native.multipleSendButtons',
  'The reply is typed in the chat, but sending is not supported. Click Send there.': 'monitor.errors.native.sendUnsupported',
  'Unknown command.': 'monitor.errors.native.unknownCommand'
});
/** Strip PowerShell MethodInvocationException wrappers and map native errors to i18n keys. */
function resolveNativeError(raw) {
  let msg = String(raw || '').trim();
  const psWrap = /^Exception calling "[^"]+" with "\d+" argument\(s\):\s*"([\s\S]*)"$/i.exec(msg);
  if (psWrap) msg = psWrap[1].trim();
  const key = NATIVE_ERROR_KEYS[msg] || null;
  return { key, text: key ? t(key) : msg };
}
const hash = text => createHash('sha256').update(text || '').digest('hex');
const clean = text => String(text || '').replace(/\r/g, '').trim();
const STOP = /^(stop( generating| response| streaming| answering)?|durdur|yan[ıi]t[ıi] durdur|üretimi durdur|akışı durdur)$/i;
const SEND = /^(send( message| prompt)?|send now|gönder|mesaj[ıi] gönder|şimdi gönder|istemi gönder)$/i;
const LOGIN = /^(log in|login|sign in|giriş yap|oturum aç)$/i;
const ERROR = /^(something went wrong|an error occurred|bir hata oluştu|bir şeyler ters gitti|yanıt oluşturulamadı|failed to generate|network error|ağ hatası|usage limit reached|you.ve reached your limit|kullanım limitine ulaşıldı|limite ulaşıldı)/i;
const HALTED = /^(stopped generating|response stopped|üretim durduruldu|yanıt durduruldu|generation cancelled)$/i;
const ASSISTANT = /^(ChatGPT (said|dedi)|Claude (said|dedi)|Claude.s response|Claude yanıtı|Assistant|Asistan)\s*:?\s*$/i;
const USER = /^(You (said|dediniz)|Sen dedin|Siz dediniz|User|Kullanıcı)\s*:?\s*$/i;
const RESPONSE_CLASS = /(?:^|[\s_-])(font-claude-message|assistant-message|assistant-response|agent-message)(?:$|[\s_-])/i;
const COMPOSER = /^(prompt-textarea|chat-input|message-input|composer)/i;
// Localized chat composer labels (English and Turkish ChatGPT/Claude UI).
const INPUT_LABEL = /(message (ChatGPT|Claude)|reply to Claude|ask (anything|Claude|ChatGPT)|herhangi bir şey sor|ChatGPT.?e sor|Claude.?a (mesaj|yanıt)|mesaj( yaz| gönder)|yanıtla|how can (I|Claude) help|nasıl yardımcı|write (a|your) (message|reply)|reply\.\.\.)/i;

// Current claude.ai: each turn is a group "Message 52 of 52" that starts with a summary text
// "Claude responded: …" or "You said: …".
const MESSAGE = /^(message|mesaj|ileti) \d+ (of|\/) \d+$/i;
const ROLE_ASSISTANT = /^(Claude responded|Claude yanıtladı|Claude said|ChatGPT said)\s*:/i;
const ROLE_USER = /^(You said|Sen dedin|Siz dediniz)\s*:/i;

function descendants(nodes, parent) {
  const ids = new Set([parent]);
  return nodes.filter(n => { if (ids.has(n.parent)) { ids.add(n.index); return true; } return false; });
}
// Joins inline pieces ("Press ", "Ctrl+O", " and …") into one line per paragraph or list item.
function blockText(nodes, scope) {
  const byIndex = new Map(nodes.map(n => [n.index, n]));
  const block = n => { let p = byIndex.get(n.parent); while (p && p.type === 'Text') p = byIndex.get(p.parent); return p?.index; };
  const lines = [], guards = []; let lastBlock;
  for (const n of scope) {
    const name = String(n.name || '').replace(/\r/g, '');
    if (!name.trim() || n.type !== 'Text' || nodes.some(child => child.parent === n.index && clean(child.name))) continue;
    const b = block(n);
    if (lines.length && b === lastBlock) lines[lines.length - 1] += name; else lines.push(name);
    lastBlock = b; guards.push({ id: n.id, name: n.name });
  }
  return { text: lines.map(clean).filter(Boolean).join('\n').slice(0, 40000), guards };
}
function lastMessageTurn(nodes) {
  const turns = nodes.filter(n => n.type === 'Group' && MESSAGE.test(clean(n.name)));
  if (!turns.length) return undefined;
  const anchor = turns.at(-1), inside = descendants(nodes, anchor.index);
  if (inside.some(n => ROLE_USER.test(clean(n.name)))) return null; // Newest turn is yours: no reply yet.
  if (!inside.some(n => ROLE_ASSISTANT.test(clean(n.name)))) return undefined;
  // Skip the summary line, the thinking status and the action toolbar.
  const skip = new Set();
  for (const n of inside) {
    if (skip.has(n.parent) || ROLE_ASSISTANT.test(clean(n.name)) || ['ToolBar', 'StatusBar', 'Button'].includes(n.type)) skip.add(n.index);
  }
  const { text, guards } = blockText(nodes, inside.filter(n => !skip.has(n.index)));
  if (!text) return null;
  return { text, fingerprint: hash(text), guards, anchor: anchor.index };
}
function lastAssistant(nodes) {
  const turn = lastMessageTurn(nodes);
  if (turn !== undefined) return turn;
  const groups = nodes.filter(n => RESPONSE_CLASS.test(n.className || '') && ['Group', 'Pane', 'Document'].includes(n.type));
  let scope, anchor;
  if (groups.length) {
    anchor = groups.at(-1); scope = descendants(nodes, anchor.index);
  } else {
    const markers = nodes.filter(n => ASSISTANT.test(clean(n.name)) && n.type !== 'Button');
    anchor = markers.at(-1);
    if (!anchor) return null;
    scope = nodes.filter(n => n.index > anchor.index);
  }
  const parts = [], guards = [];
  if (!scope.length && clean(anchor.name) && !ASSISTANT.test(clean(anchor.name))) scope = [anchor];
  for (const n of scope) {
    const name = clean(n.name);
    if (USER.test(name)) return null; // A newer user turn: the old reply is no longer awaiting input.
    if (n.type === 'Edit' || COMPOSER.test(n.automationId || '')) break;
    if (!name || ASSISTANT.test(name) || !['Text', 'Group', 'Pane'].includes(n.type)) continue;
    if (nodes.some(child => child.parent === n.index && clean(child.name))) continue;
    if (/^(ChatGPT can make mistakes|ChatGPT hata yapabilir|Claude can make mistakes|Claude hata yapabilir|check important info|önemli bilgileri kontrol et)/i.test(name)) continue;
    if (parts.at(-1) !== name) { parts.push(name); guards.push({ id: n.id, name: n.name }); }
  }
  const text = parts.join('\n').slice(0, 40000);
  if (!text) return null;
  return { text, fingerprint: hash(text), guards, anchor: anchor.index };
}
function questionFrom(text) {
  // Conservative text recognition; examples, quotes and code do not prove an input request.
  // Only the closing lines count: a real question near the end ("Do you want A or B?"),
  // or a last line that asks you to answer ("Type 1 or 2.", "Let me know.").
  let fenced = false;
  const lines = clean(text).split(/\n+/).map(l => l.trim()).filter(l => {
    if (l.startsWith('```')) { fenced = !fenced; return false; }
    return l && !fenced;
  });
  const plain = l => l.replace(/[*_`]/g, '').trim();
  const asks = l => /\?\s*[*_]*$/.test(l) && !/^([>`]|\*?example|örnek|soru \d)/i.test(l) &&
    /\b(you|your|would|which|what|how|can|should|do you|sen|senin|sizin|mi|mı|mu|mü|misin|mısın|musun|müsün|misiniz|mısınız|musunuz|müsünüz|hangi|hangisi|hangisini|ne|nedir|neden|niçin|nerede|nereye|kaç|nasıl|istersin|ister\s*misin(?:iz)?)\b/i.test(l);
  const invites = l => /^(type|pick|choose|reply|let me know|tell me|yaz|yazın|seç|seçin|yanıtla|cevapla|söyle|bildir)\b/i.test(plain(l)) ||
    /\b(let me know|tell me|haber ver|bildir)[.!]?$/i.test(plain(l));
  const tail = lines.slice(-3), last = tail.at(-1) || '';
  if (!tail.some(asks) && !invites(last)) return '';
  return text.slice(-6000);
}
function observe(snapshot, provider) {
  if (!snapshot?.ok) {
    if (!snapshot?.error) return { valid: false, detail: t('monitor.errors.windowUnavailable'), detailKey: 'monitor.errors.windowUnavailable' };
    const resolved = resolveNativeError(snapshot.error);
    return { valid: false, detail: resolved.text, detailKey: resolved.key };
  }
  if (!PROVIDERS[provider] || snapshot.provider !== provider) return { valid: false, detail: t('monitor.errors.wrongChatWindow'), detailKey: 'monitor.errors.wrongChatWindow' };
  if (snapshot.truncated) return { valid: false, detail: t('monitor.errors.windowTruncated'), detailKey: 'monitor.errors.windowTruncated' };
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const buttons = nodes.filter(n => n.type === 'Button' && n.enabled !== false);
  const login = buttons.find(n => LOGIN.test(clean(n.name)));
  if (login) {
    const params = { name: PROVIDERS[provider].name };
    return { valid: false, login: true, detail: t('monitor.errors.loginFirst', params), detailKey: 'monitor.errors.loginFirst', detailParams: params };
  }
  const richEditors = nodes.filter(n => !n.password && n.type === 'Edit' && /(?:^|\s)ProseMirror(?:\s|$)/.test(n.className || ''));
  const edits = nodes.filter(n => !n.password && n.enabled !== false &&
    (n.type === 'Edit' || COMPOSER.test(n.automationId || '')) &&
    (COMPOSER.test(n.automationId || '') || INPUT_LABEL.test(clean(n.name)) || INPUT_LABEL.test(clean(n.helpText)) ||
      (richEditors.length === 1 && n.id === richEditors[0].id))); // the one rich text box of the chat (claude.ai and chatgpt.com)
  // Never guess an arbitrary edit field, search box or address bar.
  const composer = edits.length === 1 ? edits[0] : null;
  // claude.ai also announces streaming in a status line, e.g. "Claude is responding".
  const stop = buttons.find(n => STOP.test(clean(n.name))) ||
    nodes.find(n => n.type === 'Text' && /^Claude is (responding|thinking|writing)\b/i.test(clean(n.name)));
  const send = buttons.find(n => SEND.test(clean(n.name)));
  const assistant = lastAssistant(nodes);
  const tail = assistant ? nodes.filter(n => n.index > assistant.anchor) : [];
  const error = tail.find(n => n.type === 'Text' && ERROR.test(clean(n.name)));
  const halted = tail.find(n => n.type === 'Text' && HALTED.test(clean(n.name)));
  const completed = Boolean(assistant && composer && tail.some(n => n.type === 'Button' &&
    /^(copy( response| message)?|kopyala|yan[ıi]t[ıi] kopyala|good response|bad response|iyi yan[ıi]t|kötü yan[ıi]t|retry|regenerate|yeniden oluştur|tekrar dene)$/i.test(clean(n.name))));
  const phase = nodes.find(n => n.type === 'Text' && /^(thinking|düşünüyor|searching the web|web'de arıyor|writing|yazıyor|researching|araştırıyor)(\.{0,3})$/i.test(clean(n.name)));
  return { valid: Boolean(composer || stop),
    detail: composer || stop ? '' : t('monitor.errors.composerNotFound'),
    detailKey: composer || stop ? null : 'monitor.errors.composerNotFound',
    contextKey: snapshot.contextKey, stop: Boolean(stop), composer, send, assistant, completed,
    error: error?.name || '', halted: Boolean(halted), question: assistant ? questionFrom(assistant.text) : '',
    activity: phase?.name || t('monitor.session.generatingReply'),
    activityKey: phase?.name ? null : 'monitor.session.generatingReply',
    snapshot };
}
// "Ideas for my site - Google Chrome" → "Ideas for my site"
function chatTitle(title) {
  return String(title || '').replace(/\s+[-–—]\s+(Google Chrome|Microsoft​? Edge|Mozilla Firefox|Brave|Opera|Vivaldi|Arc)$/i, '')
    .replace(/^(ChatGPT|Claude)\s+[-–—]\s+/i, '').trim();
}
class Session {
  constructor(provider, target) {
    this.provider = provider; this.target = target; this.contextKey = null; this.state = 'connecting';
    this._setDetail('monitor.session.checkingConnection'); this.run = null; this.last = null; this.stable = 0;
    this.baseline = null; this.completions = 0;
    this.question = ''; this.questionId = ''; this.startedAt = null; this.endedAt = null; this.notification = null;
  }
  _setDetail(key, params) {
    this._detailKey = key || null;
    this._detailParams = params || null;
    this.detail = key ? t(key, params) : '';
  }
  _setRawDetail(text) {
    this._detailKey = null;
    this._detailParams = null;
    this.detail = String(text || '');
  }
  accept(obs, now = Date.now()) {
    this.notification = null; this.last = obs;
    if (!obs.valid) {
      this.state = obs.login ? 'login' : 'unavailable';
      if (obs.detailKey) this._setDetail(obs.detailKey, obs.detailParams); else this._setRawDetail(obs.detail);
      this.run = null; this.baseline = null; this.stable = 0; this.question = ''; this.questionId = ''; return this.public(now);
    }
    if (this.contextKey && this.contextKey !== obs.contextKey) {
      const isNewChat = this.run && /:https:\/\/(chatgpt\.com|claude\.ai)\/?$/.test(this.contextKey);
      if (!isNewChat) {
        // Another chat is open now: Robo simply follows that one (nothing to reconnect).
        // Its current answer is the starting point, so an old answer never counts as "done".
        this.contextKey = obs.contextKey; this.run = null; this.stable = 0; this.startedAt = null; this.endedAt = null;
        this.baseline = obs.assistant?.fingerprint || ''; this.preview = obs.assistant?.text || '';
        this.state = 'ready'; this._setDetail('monitor.session.followingChat'); this.question = ''; this.questionId = '';
        this.title = chatTitle(obs.snapshot?.title || this.target.title); return this.public(now);
      }
    }
    this.contextKey = obs.contextKey; this.title = chatTitle(obs.snapshot?.title || this.target.title);
    if (obs.assistant?.text) this.preview = obs.assistant.text;
    const previousReply = this.baseline;
    this.baseline = obs.assistant?.fingerprint || '';
    if (obs.error || obs.halted) {
      this.state = obs.halted ? 'stopped' : 'error';
      if (obs.halted) this._setDetail('monitor.session.replyStopped'); else this._setRawDetail(obs.error);
      this.run = null; this.question = ''; this.questionId = ''; return this.public(now);
    }
    if (obs.stop) {
      if (!this.run) { this.run = { baseline: obs.assistant?.fingerprint || '', last: '', began: now }; this.startedAt = now; }
      // Keep the observed streaming fingerprint to require final action controls and a stable reply.
      this.run.latest = obs.assistant?.fingerprint || '';
      this.state = 'running';
      if (obs.activityKey) this._setDetail(obs.activityKey); else this._setRawDetail(obs.activity || t('monitor.session.generatingReply'));
      this.stable = 0; this.endedAt = null;
      this.question = ''; this.questionId = ''; return this.public(now);
    }
    if (!this.run && previousReply !== null && this.baseline && this.baseline !== previousReply && obs.completed) {
      // A very short response may finish between polls. Require a changed reply, final controls and stability.
      this.run = { baseline: previousReply, last: this.baseline, began: now, settlingAt: now };
      this.startedAt = now; this.endedAt = null; this.stable = 0;
      this.state = 'running'; this._setDetail('monitor.session.verifyingReply'); return this.public(now);
    }
    if (this.run) {
      const fingerprint = obs.assistant?.fingerprint || '';
      this.stable = fingerprint && this.run.last === fingerprint ? this.stable + 1 : 0;
      this.run.last = fingerprint;
      if (!obs.completed || this.stable < 1) {
        this.state = 'running'; this._setDetail('monitor.session.confirmingEnd');
        this.run.settlingAt ||= now;
        if (now - this.run.settlingAt > 20000 && !obs.completed) {
          this.state = 'unavailable'; this._setDetail('monitor.session.endNotConfirmed'); this.run = null;
        }
        return this.public(now);
      }
      this.run = null; this.endedAt = now;
      this.state = obs.question ? 'question' : 'done';
      this._setDetail(obs.question ? 'status.hasQuestionForYou' : 'monitor.session.replyReady');
      this.question = obs.question; this.questionId = obs.question ? fingerprint : '';
      this.completions++;
      this.notification = this.state; return this.public(now);
    }
    if (obs.question && obs.completed) {
      this.state = 'question'; this._setDetail('monitor.session.questionInLast');
      this.question = obs.question; this.questionId = obs.assistant.fingerprint;
    } else if (this.state !== 'done') {
      this.state = 'ready'; this._setDetail('monitor.session.readyConnected'); this.question = ''; this.questionId = '';
    }
    return this.public(now);
  }
  public(now = Date.now()) {
    const detail = this._detailKey ? t(this._detailKey, this._detailParams) : this.detail;
    return { provider: this.provider, name: PROVIDERS[this.provider].name, connected: true,
      state: this.state, detail, question: this.question, questionId: this.questionId,
      elapsed: this.startedAt ? Math.floor(((this.endedAt || now) - this.startedAt) / 1000) : 0,
      canReply: this.state === 'question' && Boolean(this.last?.composer),
      source: { title: this.title || chatTitle(this.target.title), process: this.target.process }, targetId: this.target.id,
      preview: String(this.preview || '').slice(-1200) };
  }
}
module.exports = { PROVIDERS, observe, Session, questionFrom, hash, resolveNativeError };
