/* GPT PANEL v1 — pure helpers extracted from PX4 SMART v1. See Search_Provenance.json. */
var fc = String.fromCharCode, S = function (v) { return v == null ? '' : String(v); };
var MARKS = new RegExp('[' + fc(1611) + '-' + fc(1631) + fc(1648) + fc(1600) + ']', 'g');
var dig = function (s) { return S(s).replace(/[\u0660-\u0669]/g, function (c) { return String(c.charCodeAt(0) - 1632); }).replace(/[\u06f0-\u06f9]/g, function (c) { return String(c.charCodeAt(0) - 1776); }); };
var fold = function (s) { return dig(s).replace(MARKS, '').replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627').replace(/\u0629/g, '\u0647').replace(/[\u0649\u0626\u06cc]/g, '\u064a').replace(/\u0624/g, '\u0648').replace(/\u06a9/g, '\u0643').toLowerCase().replace(/[^0-9a-z\u0621-\u064a]+/g, ' ').replace(/^ +| +$/g, ''); };
var clean = function (t) { t = S(t).replace(/\s+/g, ' '); var i = 0, j = t.length; while (i < j && !fold(t.charAt(i))) i++; while (j > i && !fold(t.charAt(j - 1))) j--; return t.slice(i, j); };

export {fold as px4Fold, clean as px4Clean, dig as px4Digits};

// Adapted pure form of the observed SMART1 word-prefix predicate (script line 21).
// Autocomplete harvesting, ranking, DOM mutation and TF hash routing are not ported.
export function px4PrefixMatch(query, text) {
  const q = fold(query);
  if (!q) return true;
  const words = fold(text).split(' ');
  return q.split(' ').every(token => words.some(word => word.indexOf(token) === 0));
}
