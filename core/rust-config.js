'use strict';

/**
 * core/rust-config.js
 * ---------------------------------------------------------------------------
 * Framework-agnostic logic for reading and safely editing Rust's client.cfg.
 *
 * Rust stores client convars one-per-line in the form:
 *     graphics.quality "5"
 *     effects.aa "1"
 *
 * The golden rule of this module: NEVER blow away the user's existing config.
 * We parse the file, replace only the convars a preset touches, preserve every
 * other line (including comments, blanks and unknown convars) exactly, and
 * append any brand-new convars at the end under a labelled section.
 *
 * This file has zero dependencies on Electron so it can be unit-tested with
 * plain Node (see core/test.js).
 * ---------------------------------------------------------------------------
 */

// Matches a convar line:  key "value"   (value may contain escaped quotes)
const CONVAR_LINE = /^(\s*)([A-Za-z_][\w]*\.[\w]+)\s+"((?:[^"\\]|\\.)*)"\s*$/;
// Fallback: key value   (unquoted, legacy / hand-edited lines)
const CONVAR_LINE_UNQUOTED = /^(\s*)([A-Za-z_][\w]*\.[\w]+)\s+(\S.*?)\s*$/;

/**
 * Parse client.cfg text into an ordered list of convars and a quick-lookup map.
 * @param {string} text
 * @returns {{ order: string[], values: Object<string,string> }}
 */
function parseClientCfg(text) {
  const order = [];
  const values = {};
  if (typeof text !== 'string' || text.length === 0) {
    return { order, values };
  }
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(CONVAR_LINE) || line.match(CONVAR_LINE_UNQUOTED);
    if (m) {
      const key = m[2];
      const value = m[3];
      if (!(key in values)) order.push(key);
      values[key] = value; // last write wins, mirroring how Rust loads the file
    }
  }
  return { order, values };
}

/**
 * Produce a single convar line in canonical form.
 * @param {string} key
 * @param {string|number|boolean} value
 */
function formatConvarLine(key, value) {
  return `${key} "${normaliseValue(value)}"`;
}

/**
 * Normalise a JS value into the string Rust expects.
 * Booleans become True/False (Rust's casing); numbers/strings pass through.
 */
function normaliseValue(value) {
  if (value === true) return 'True';
  if (value === false) return 'False';
  return String(value);
}

/**
 * Safely merge a preset (map of convar -> value) into existing client.cfg text.
 *
 * - Existing convar lines that the preset overrides are rewritten IN PLACE,
 *   preserving their original indentation and position.
 * - Lines the preset does not touch (comments, blanks, unrelated convars) are
 *   preserved byte-for-byte.
 * - Convars in the preset that did not exist in the file are appended at the
 *   end under a "# Settinger" banner.
 *
 * @param {string} originalText  Current file contents ('' if file is new).
 * @param {Object<string,(string|number|boolean)>} convars  Preset to apply.
 * @param {{ presetLabel?: string, stamp?: string }} [opts]
 * @returns {{ text: string, changed: string[], added: string[], unchanged: string[] }}
 */
function mergeClientCfg(originalText, convars, opts = {}) {
  const presetLabel = opts.presetLabel || 'Preset';
  const stamp = opts.stamp || new Date().toISOString();

  const keys = Object.keys(convars);
  const seen = new Set();
  const changed = [];
  const unchanged = [];

  const srcLines = (originalText || '').split(/\r?\n/);
  // Avoid a trailing empty element creating a phantom blank line on round-trip.
  if (srcLines.length && srcLines[srcLines.length - 1] === '') srcLines.pop();

  const outLines = srcLines.map((line) => {
    const m = line.match(CONVAR_LINE) || line.match(CONVAR_LINE_UNQUOTED);
    if (m) {
      const indent = m[1] || '';
      const key = m[2];
      const oldValue = m[3];
      if (key in convars) {
        seen.add(key);
        const newValue = normaliseValue(convars[key]);
        if (oldValue === newValue) {
          unchanged.push(key);
          return line; // identical, leave untouched
        }
        changed.push(key);
        return `${indent}${formatConvarLine(key, convars[key])}`;
      }
    }
    return line;
  });

  const added = keys.filter((k) => !seen.has(k));
  if (added.length > 0) {
    if (outLines.length && outLines[outLines.length - 1].trim() !== '') {
      outLines.push('');
    }
    outLines.push(`# Settinger :: ${presetLabel} :: added ${stamp}`);
    for (const k of added) {
      outLines.push(formatConvarLine(k, convars[k]));
    }
  }

  // Rust expects a trailing newline.
  const text = outLines.join('\n') + '\n';
  return { text, changed, added, unchanged };
}

/**
 * Clamp / validate a value against a spec descriptor. Returns the corrected
 * value plus a flag if it had to be adjusted. Used to keep presets in legal
 * ranges even if someone hand-edits the preset data.
 * @param {string|number|boolean} value
 * @param {{ type:'bool'|'int'|'float'|'enum', min?:number, max?:number, options?:Array }} spec
 */
function clampValue(value, spec) {
  if (!spec) return { value, adjusted: false };
  if (spec.type === 'bool') {
    const v = value === true || value === 'True' || value === 'true' || value === 1 || value === '1';
    return { value: v, adjusted: false };
  }
  if (spec.type === 'int' || spec.type === 'float') {
    let n = Number(value);
    if (Number.isNaN(n)) return { value, adjusted: false };
    let adjusted = false;
    if (typeof spec.min === 'number' && n < spec.min) { n = spec.min; adjusted = true; }
    if (typeof spec.max === 'number' && n > spec.max) { n = spec.max; adjusted = true; }
    if (spec.type === 'int') n = Math.round(n);
    return { value: n, adjusted };
  }
  if (spec.type === 'enum' && Array.isArray(spec.options)) {
    const ok = spec.options.some((o) => String(o) === String(value));
    return { value, adjusted: !ok };
  }
  return { value, adjusted: false };
}

module.exports = {
  parseClientCfg,
  mergeClientCfg,
  formatConvarLine,
  normaliseValue,
  clampValue,
  CONVAR_LINE,
  CONVAR_LINE_UNQUOTED,
};
