// Calculator, unit conversion, and web-search fallback.
// No eval/Function anywhere — calculator uses a hand-rolled recursive-descent
// parser. No network calls happen at typing time: web search only opens a URL
// when the user activates the result (Enter), never during search().

// ---------------------------------------------------------------------------
// Calculator — supports + - * / ^ % and parentheses, hand-rolled parser.
// ---------------------------------------------------------------------------
const CALC_GATE = /^[\d\s+\-*/().^%]+$/;
const HAS_DIGIT = /\d/;
const HAS_OPERATOR = /[+\-*/^%]/;

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === ' ') { i++; continue; }
    if (/\d|\./.test(c)) {
      let j = i;
      while (j < expr.length && /[\d.]/.test(expr[j])) j++;
      tokens.push({ t: 'num', v: parseFloat(expr.slice(i, j)) });
      i = j;
    } else if ('+-*/^%()'.includes(c)) {
      tokens.push({ t: c });
      i++;
    } else {
      throw new Error('bad char');
    }
  }
  return tokens;
}

// Recursive-descent: expr -> term (('+'|'-') term)*
//                     term -> pow  (('*'|'/'|'%') pow)*
//                     pow  -> unary ('^' pow)?      (right-assoc)
//                     unary -> '-' unary | atom
//                     atom -> number | '(' expr ')'
function parseExpr(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function atom() {
    const tok = peek();
    if (!tok) throw new Error('unexpected end');
    if (tok.t === 'num') { next(); return tok.v; }
    if (tok.t === '(') {
      next();
      const v = expr();
      if (!peek() || peek().t !== ')') throw new Error('missing )');
      next();
      return v;
    }
    throw new Error('unexpected token');
  }

  function unary() {
    if (peek() && peek().t === '-') { next(); return -unary(); }
    if (peek() && peek().t === '+') { next(); return unary(); }
    return atom();
  }

  function pow() {
    const base = unary();
    if (peek() && peek().t === '^') { next(); return Math.pow(base, pow()); }
    return base;
  }

  function term() {
    let v = pow();
    while (peek() && (peek().t === '*' || peek().t === '/' || peek().t === '%')) {
      const op = next().t;
      const rhs = pow();
      if (op === '*') v *= rhs;
      else if (op === '/') v /= rhs;
      else v %= rhs;
    }
    return v;
  }

  function expr() {
    let v = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = next().t;
      const rhs = term();
      v = op === '+' ? v + rhs : v - rhs;
    }
    return v;
  }

  const result = expr();
  if (pos !== tokens.length) throw new Error('trailing tokens');
  return result;
}

function tryCalculator(q) {
  const trimmed = q.trim();
  if (!CALC_GATE.test(trimmed) || !HAS_DIGIT.test(trimmed) || !HAS_OPERATOR.test(trimmed)) return null;
  try {
    const tokens = tokenize(trimmed);
    const value = parseExpr(tokens);
    if (!Number.isFinite(value)) return null;
    const display = Number.isInteger(value) ? String(value) : String(Math.round(value * 1e10) / 1e10);
    return {
      type: 'calc',
      id: 'calc:' + trimmed,
      title: display,
      subtitle: 'Calculator · ' + trimmed + ' =',
      score: 1100,
      icon: null,
      actions: ['copy'],
      data: { text: display },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Unit conversion — static tables, no network/currency lookups.
// ---------------------------------------------------------------------------
const UNIT_TABLES = {
  length: { m: 1, meter: 1, meters: 1, km: 1000, kilometer: 1000, kilometers: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, mile: 1609.344, miles: 1609.344, yd: 0.9144, yard: 0.9144, yards: 0.9144, ft: 0.3048, feet: 0.3048, foot: 0.3048, in: 0.0254, inch: 0.0254, inches: 0.0254 },
  mass: { kg: 1, kilogram: 1, kilograms: 1, g: 0.001, gram: 0.001, grams: 0.001, mg: 0.000001, lb: 0.453592, lbs: 0.453592, pound: 0.453592, pounds: 0.453592, oz: 0.0283495, ounce: 0.0283495, ounces: 0.0283495 },
  volume: { l: 1, liter: 1, liters: 1, litre: 1, litres: 1, ml: 0.001, gal: 3.78541, gallon: 3.78541, gallons: 3.78541, qt: 0.946353, quart: 0.946353, quarts: 0.946353, cup: 0.236588, cups: 0.236588, floz: 0.0295735 },
  data: { b: 1, byte: 1, bytes: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 },
};

function findTable(unit) {
  const u = unit.toLowerCase();
  for (const table of Object.values(UNIT_TABLES)) {
    if (Object.prototype.hasOwnProperty.call(table, u)) return table;
  }
  return null;
}

const CONVERT_RE = /^([\d.]+)\s*([a-zA-Z°]+)\s+(?:to|in)\s+([a-zA-Z°]+)$/;

function tryUnitConvert(q) {
  const m = CONVERT_RE.exec(q.trim());
  if (!m) return null;
  const [, numStr, fromU, toU] = m;
  const value = parseFloat(numStr);
  if (!Number.isFinite(value)) return null;

  const fromLower = fromU.toLowerCase();
  const toLower = toU.toLowerCase();

  // Temperature is special-cased (non-linear conversions).
  const TEMP_UNITS = new Set(['c', 'celsius', 'f', 'fahrenheit', 'k', 'kelvin']);
  if (TEMP_UNITS.has(fromLower) && TEMP_UNITS.has(toLower)) {
    const toCelsius = (v, u) => (u.startsWith('f') ? (v - 32) * 5 / 9 : u.startsWith('k') ? v - 273.15 : v);
    const fromCelsius = (c, u) => (u.startsWith('f') ? c * 9 / 5 + 32 : u.startsWith('k') ? c + 273.15 : c);
    const celsius = toCelsius(value, fromLower);
    const result = fromCelsius(celsius, toLower);
    return makeConvertResult(q, value, fromU, result, toU);
  }

  const fromTable = findTable(fromLower);
  const toTable = findTable(toLower);
  if (!fromTable || fromTable !== toTable) return null;
  if (!(fromLower in fromTable) || !(toLower in toTable)) return null;
  const base = value * fromTable[fromLower];
  const result = base / toTable[toLower];
  return makeConvertResult(q, value, fromU, result, toU);
}

function makeConvertResult(q, fromVal, fromU, toVal, toU) {
  const display = Number.isInteger(toVal) ? String(toVal) : String(Math.round(toVal * 1e6) / 1e6);
  return {
    type: 'convert',
    id: 'convert:' + q.trim().toLowerCase(),
    title: display + ' ' + toU,
    subtitle: 'Convert · ' + fromVal + ' ' + fromU + ' = ' + display + ' ' + toU,
    score: 1090,
    icon: null,
    actions: ['copy'],
    data: { text: display + ' ' + toU },
  };
}

// ---------------------------------------------------------------------------
// Web search fallback — always available, lowest priority, never fetches
// anything until the user activates it.
// ---------------------------------------------------------------------------
function tryWebSearch(q, engineTemplate) {
  const trimmed = q.trim();
  if (!trimmed) return null;
  const url = engineTemplate.replace('%s', encodeURIComponent(trimmed));
  return {
    type: 'websearch',
    id: 'websearch:' + trimmed,
    title: 'Search the web for "' + trimmed + '"',
    subtitle: url,
    score: 10,
    icon: null,
    actions: ['open-external'],
    data: { url },
  };
}

function search(ctx) {
  const { q, config } = ctx;
  const qa = config.quickActions;
  const results = [];

  if (qa.calculator) {
    const r = tryCalculator(q);
    if (r) results.push(r);
  }
  if (qa.unitConvert) {
    const r = tryUnitConvert(q);
    if (r) results.push(r);
  }
  if (qa.webSearch) {
    const r = tryWebSearch(q, qa.webSearchEngine);
    if (r) results.push(r);
  }
  return results;
}

module.exports = { search, tryCalculator, tryUnitConvert, tryWebSearch };
