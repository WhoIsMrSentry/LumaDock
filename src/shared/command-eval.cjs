'use strict';
// Safe math expression evaluator, unit converter, and FX currency converter (zero eval()).

const MATH_CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };
const MATH_FUNCS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, exp: Math.exp
};

function tokenizeMath(expr) {
  const s = String(expr || '').trim().replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/');
  if (!s || s.length > 160) return null;
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    if (/[+\-*/^%()]/.test(s[i])) { tokens.push({ t: 'op', v: s[i++] }); continue; }
    if (/^0x[0-9a-f]+/i.test(s.slice(i))) {
      const m = /^0x([0-9a-f]+)/i.exec(s.slice(i));
      tokens.push({ t: 'num', v: Number.parseInt(m[1], 16) });
      i += m[0].length;
      continue;
    }
    if (/^\d+(?:\.\d+)?/.test(s.slice(i)) || /^\.\d+/.test(s.slice(i))) {
      const m = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(s.slice(i));
      tokens.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/^[a-zA-Z]+/.test(s.slice(i))) {
      const m = /^[a-zA-Z]+/.exec(s.slice(i));
      const word = m[0].toLowerCase();
      if (word in MATH_CONSTS) tokens.push({ t: 'num', v: MATH_CONSTS[word] });
      else if (word in MATH_FUNCS) tokens.push({ t: 'fn', v: word });
      else return null;
      i += m[0].length;
      continue;
    }
    return null;
  }
  return tokens;
}

function evaluateMath(expr) {
  const tokens = tokenizeMath(expr);
  if (!tokens || !tokens.length) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];

  function parsePrimary() {
    const tk = peek();
    if (!tk) throw new Error('unexpected end');
    if (tk.t === 'num') { take(); return tk.v; }
    if (tk.t === 'fn') {
      const fn = MATH_FUNCS[take().v];
      if (peek()?.v !== '(') throw new Error('expected (');
      take();
      const val = parseExpr();
      if (take()?.v !== ')') throw new Error('expected )');
      return fn(val);
    }
    if (tk.v === '(') {
      take();
      const val = parseExpr();
      if (take()?.v !== ')') throw new Error('expected )');
      return val;
    }
    if (tk.v === '-' || tk.v === '+') {
      const sign = take().v === '-' ? -1 : 1;
      return sign * parsePrimary();
    }
    throw new Error('bad token');
  }

  function parsePower() {
    let left = parsePrimary();
    if (peek()?.v === '%') {
      take();
      left = left / 100;
    }
    if (peek()?.v === '^') {
      take();
      left = Math.pow(left, parsePower());
    }
    return left;
  }

  function parseTerm() {
    let val = parsePower();
    while (peek() && ['*', '/', '%'].includes(peek().v)) {
      const op = take().v;
      const rhs = parsePower();
      if (op === '*') val *= rhs;
      else if (op === '/') { if (rhs === 0) throw new Error('div0'); val /= rhs; }
      else val %= rhs;
    }
    return val;
  }

  function parseExpr() {
    let val = parseTerm();
    while (peek() && ['+', '-'].includes(peek().v)) {
      const op = take().v;
      const rhs = parseTerm();
      val = op === '+' ? val + rhs : val - rhs;
    }
    return val;
  }

  try {
    const val = parseExpr();
    if (pos !== tokens.length || !Number.isFinite(val)) return null;
    const rounded = Math.abs(val) < 1e12 ? Number(val.toPrecision(12)) : val;
    return {
      value: rounded,
      formatted: Number.isInteger(rounded) ? String(rounded) : Number(rounded.toFixed(6)).toString()
    };
  } catch {
    return null;
  }
}

const LENGTH_TO_M = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 };
const MASS_TO_G = { mg: 0.001, g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237, lbs: 453.59237 };
const DATA_TO_B = { b: 1, kb: 1024, mb: 1048576, gb: 1073741824, tb: 1099511627776 };
const TIME_TO_S = { ms: 0.001, s: 1, sec: 1, min: 60, m2: 60, h: 3600, hr: 3600, d: 86400, day: 86400 };
const PIXEL_TO_PX = { px: 1, rem: 16, em: 16, pt: 4 / 3 };

const CURRENCY_ALIASES = {
  tl: 'TRY', try: 'TRY', lira: 'TRY',
  usd: 'USD', dollar: 'USD', dolar: 'USD', $: 'USD',
  eur: 'EUR', euro: 'EUR', '€': 'EUR',
  gbp: 'GBP', pound: 'GBP', sterlin: 'GBP', '£': 'GBP',
  jpy: 'JPY', yen: 'JPY',
  chf: 'CHF',
  btc: 'BTC', bitcoin: 'BTC',
  eth: 'ETH', ethereum: 'ETH'
};

const TEMP_UNITS = new Set(['c', 'celsius', 'f', 'fahrenheit', 'k', 'kelvin']);

function convertTemperature(val, from, to) {
  const norm = u => u[0]; // c, f, k
  const f = norm(from), t = norm(to);
  if (f === t) return val;
  const c = f === 'c' ? val : f === 'f' ? (val - 32) * 5 / 9 : val - 273.15;
  return t === 'c' ? c : t === 'f' ? c * 9 / 5 + 32 : c + 273.15;
}

function formatNum(v) {
  if (!Number.isFinite(v)) return '';
  if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(v) >= 1) return Number(v.toFixed(4)).toString();
  return Number(v.toPrecision(4)).toString();
}

function evaluateConversion(query, rates = {}) {
  const s = String(query || '').trim();
  const m = /^(-?\d+(?:[.,]\d+)?)\s*([a-zA-Z$€£]+)\s+(?:to|in|->|=>|as)?\s*([a-zA-Z$€£]+)$/i.exec(s);
  if (!m) return null;
  const amount = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(amount)) return null;
  const u1 = m[2].toLowerCase(), u2 = m[3].toLowerCase();

  if (TEMP_UNITS.has(u1) && TEMP_UNITS.has(u2)) {
    const out = convertTemperature(amount, u1, u2);
    return { value: out, formatted: `${formatNum(out)} °${u2[0].toUpperCase()}`, from: u1.toUpperCase(), to: u2[0].toUpperCase(), kind: 'unit' };
  }

  for (const [table, unitNames] of [
    [LENGTH_TO_M, null],
    [MASS_TO_G, null],
    [DATA_TO_B, null],
    [TIME_TO_S, null],
    [PIXEL_TO_PX, null]
  ]) {
    if (u1 in table && u2 in table) {
      const out = (amount * table[u1]) / table[u2];
      return { value: out, formatted: `${formatNum(out)} ${m[3]}`, from: m[2], to: m[3], kind: 'unit' };
    }
    void unitNames;
  }

  const c1 = CURRENCY_ALIASES[u1];
  const c2 = CURRENCY_ALIASES[u2];
  if (c1 && c2 && rates && rates[c1] && rates[c2]) {
    // rates map is USD-per-1-unit? Or units-per-1-USD (`rates.TRY = 34.5`, `rates.USD = 1`, `rates.BTC = 0.0000105`).
    const usdAmount = amount / rates[c1];
    const out = usdAmount * rates[c2];
    return { value: out, formatted: `${formatNum(out)} ${c2}`, from: c1, to: c2, kind: 'currency' };
  }
  return null;
}

module.exports = { evaluateMath, evaluateConversion };
