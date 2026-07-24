'use strict';

/**
 * core/rust-presets.js
 * ---------------------------------------------------------------------------
 * The single source of truth for Rust graphics convars and the three presets.
 * Shared by the renderer (to display) and the main process (to write to disk).
 *
 * Values, ranges and meanings are taken from Rust's documented client convars
 * and corroborated against current (2025/2026) optimisation guides:
 *   - graphics.quality 0-5, effects.aa 0-3, graphics.shadowcascades 1/2/4,
 *     graphics.shadowmode 1/2 (soft needs quality > 2), graphics.shaderlod
 *     100-600, graphics.drawdistance 500-2500, water.quality / reflections,
 *     grass.quality 0-100, mesh/tree.quality 0-200, etc.
 *
 * Preset philosophy:
 *   max_performance - strip everything that costs frames; ugly but fast.
 *   max_quality     - turn every visual dial up; for high-end rigs.
 *   pvp             - max FPS where it is invisible, but KEEP the things that
 *                     aid target acquisition (clarity, sane draw distance,
 *                     low grass for visibility, no clutter/gibs).
 * ---------------------------------------------------------------------------
 */

/**
 * Catalog: convar -> display metadata + legal range.
 * `cat` groups settings in the UI. `spec` drives validation/clamping.
 */
const CONVARS = {
  'graphics.quality':       { label: 'Graphics Quality',     cat: 'Quality',  spec: { type: 'enum', options: [0,1,2,3,4,5] }, hint: '0 fastest … 5 fantastic' },
  'graphics.af':            { label: 'Anisotropic Filtering',cat: 'Quality',  spec: { type: 'int', min: 1, max: 16 }, hint: 'Texture sharpness at angles' },
  'graphics.shaderlod':     { label: 'Shader Level',         cat: 'Quality',  spec: { type: 'int', min: 100, max: 600 }, hint: 'Higher = richer distant detail' },
  'graphics.drawdistance':  { label: 'Draw Distance',        cat: 'Quality',  spec: { type: 'int', min: 500, max: 2500 }, hint: 'How far the world renders' },
  'graphics.lodbias':       { label: 'LOD Bias',             cat: 'Quality',  spec: { type: 'float', min: 0.25, max: 5 }, hint: '<1 favours FPS, >1 favours detail' },
  'graphics.parallax':      { label: 'Parallax Mapping',     cat: 'Quality',  spec: { type: 'int', min: 0, max: 2 }, hint: 'Fake surface depth' },
  'graphics.lso':           { label: 'Large-Scale Occlusion',cat: 'Quality',  spec: { type: 'bool' }, hint: 'Helps GPU; can cost on weak CPU' },
  'graphics.fov':           { label: 'Field of View',        cat: 'Quality',  spec: { type: 'int', min: 60, max: 90 }, hint: 'Higher sees more, costs a little' },

  'graphics.shadowmode':    { label: 'Shadow Type',          cat: 'Shadows',  spec: { type: 'enum', options: [1,2] }, hint: '1 hard, 2 soft (needs quality>2)' },
  'graphics.shadowcascades':{ label: 'Shadow Cascades',      cat: 'Shadows',  spec: { type: 'enum', options: [1,2,4] }, hint: '1 none, 2 two, 4 four' },
  'graphics.shadowdistance':{ label: 'Shadow Distance',      cat: 'Shadows',  spec: { type: 'int', min: 50, max: 1000 }, hint: 'Range shadows are drawn' },
  'graphics.shadowlights':  { label: 'Dynamic Shadow Lights',cat: 'Shadows',  spec: { type: 'int', min: 0, max: 3 }, hint: 'Shadows cast by lights' },

  'effects.aa':             { label: 'Anti-Aliasing',        cat: 'Effects',  spec: { type: 'enum', options: [0,1,2,3] }, hint: '0 off,1 FXAA,2 SMAA,3 TSSAA' },
  'effects.ao':             { label: 'Ambient Occlusion',    cat: 'Effects',  spec: { type: 'bool' }, hint: 'Contact shadowing in crevices' },
  'effects.bloom':          { label: 'Bloom',                cat: 'Effects',  spec: { type: 'bool' }, hint: 'Glow around bright areas' },
  'effects.lensdirt':       { label: 'Lens Dirt',            cat: 'Effects',  spec: { type: 'bool' }, hint: 'Smudge over bright light' },
  'effects.motionblur':     { label: 'Motion Blur',          cat: 'Effects',  spec: { type: 'bool' }, hint: 'Blur on fast movement' },
  'effects.shafts':         { label: 'Sun Shafts',           cat: 'Effects',  spec: { type: 'bool' }, hint: 'God rays from the sun' },
  'effects.sharpen':        { label: 'Sharpen',              cat: 'Effects',  spec: { type: 'bool' }, hint: 'Crispens the final image' },
  'effects.vignet':         { label: 'Vignette',             cat: 'Effects',  spec: { type: 'bool' }, hint: 'Darkened screen edges' },
  'effects.maxgibs':        { label: 'Max Gibs',             cat: 'Effects',  spec: { type: 'int', min: 0, max: 10000 }, hint: 'Debris from destroyed objects' },

  'decor.quality':          { label: 'Decor Quality',        cat: 'Detail',   spec: { type: 'int', min: 0, max: 100 }, hint: 'Small world decorations' },
  'mesh.quality':           { label: 'Object/Mesh Quality',  cat: 'Detail',   spec: { type: 'int', min: 0, max: 200 }, hint: 'Object geometry detail' },
  'particle.quality':       { label: 'Particle Quality',     cat: 'Detail',   spec: { type: 'int', min: 0, max: 100 }, hint: 'Fire, smoke, sparks' },
  'terrain.quality':        { label: 'Terrain Quality',      cat: 'Detail',   spec: { type: 'int', min: 0, max: 100 }, hint: 'Ground texture detail' },
  'tree.quality':           { label: 'Tree Quality',         cat: 'Detail',   spec: { type: 'int', min: 0, max: 200 }, hint: 'Tree geometry detail' },

  'grass.quality':          { label: 'Grass Quality',        cat: 'World',    spec: { type: 'int', min: 0, max: 100 }, hint: 'Low = better target visibility' },
  'grass.displace':         { label: 'Grass Displacement',   cat: 'World',    spec: { type: 'bool' }, hint: 'Grass bends as you move' },
  'water.quality':          { label: 'Water Quality',        cat: 'World',    spec: { type: 'int', min: 0, max: 2 }, hint: 'Big FPS cost near water' },
  'water.reflections':      { label: 'Water Reflections',    cat: 'World',    spec: { type: 'int', min: 0, max: 2 }, hint: 'Screen-space water reflections' },

  'fps.limit':              { label: 'FPS Limit',            cat: 'Misc',     spec: { type: 'int', min: 0, max: 1000 }, hint: '0 = unlimited' },
};

const CATEGORY_ORDER = ['Quality', 'Shadows', 'Effects', 'Detail', 'World', 'Misc'];

/**
 * The three presets. Each is a flat map of convar -> value, plus display copy.
 */
const PRESETS = [
  {
    id: 'max_performance',
    name: 'Max Performance',
    tagline: 'Every frame, no mercy',
    blurb: 'Strips all the expensive eye-candy for the highest possible FPS. Best for low-end rigs, big base fights, and anyone chasing a rock-steady frame rate.',
    accent: '#FF5247',
    convars: {
      'graphics.quality': 1,
      'graphics.af': 1,
      'graphics.shaderlod': 100,
      'graphics.drawdistance': 1500,
      'graphics.lodbias': 0.25,
      'graphics.parallax': 0,
      'graphics.lso': false,
      'graphics.fov': 90,
      'graphics.shadowmode': 1,
      'graphics.shadowcascades': 1,
      'graphics.shadowdistance': 50,
      'graphics.shadowlights': 0,
      'effects.aa': 0,
      'effects.ao': false,
      'effects.bloom': false,
      'effects.lensdirt': false,
      'effects.motionblur': false,
      'effects.shafts': false,
      'effects.sharpen': true,
      'effects.vignet': false,
      'effects.maxgibs': 0,
      'decor.quality': 0,
      'mesh.quality': 50,
      'particle.quality': 30,
      'terrain.quality': 50,
      'tree.quality': 50,
      'grass.quality': 0,
      'grass.displace': false,
      'water.quality': 0,
      'water.reflections': 0,
      'fps.limit': 0,
    },
  },
  {
    id: 'max_quality',
    name: 'Max Quality',
    tagline: 'Make it gorgeous',
    blurb: 'Pushes every visual dial up for the best-looking Rust. Built for high-end GPUs and screenshot runs where fidelity beats frames.',
    accent: '#4FD1C5',
    convars: {
      'graphics.quality': 5,
      'graphics.af': 16,
      'graphics.shaderlod': 600,
      'graphics.drawdistance': 2500,
      'graphics.lodbias': 2,
      'graphics.parallax': 2,
      'graphics.lso': true,
      'graphics.fov': 90,
      'graphics.shadowmode': 2,
      'graphics.shadowcascades': 4,
      'graphics.shadowdistance': 1000,
      'graphics.shadowlights': 3,
      'effects.aa': 3,
      'effects.ao': true,
      'effects.bloom': true,
      'effects.lensdirt': true,
      'effects.motionblur': true,
      'effects.shafts': true,
      'effects.sharpen': true,
      'effects.vignet': true,
      'effects.maxgibs': 2000,
      'decor.quality': 100,
      'mesh.quality': 200,
      'particle.quality': 100,
      'terrain.quality': 100,
      'tree.quality': 200,
      'grass.quality': 100,
      'grass.displace': true,
      'water.quality': 2,
      'water.reflections': 2,
      'fps.limit': 0,
    },
  },
  {
    id: 'pvp',
    name: 'PVP',
    tagline: 'See first, shoot first',
    blurb: 'A competitive tune: high frame rate, maximum clarity, and low grass so players and loot can\u2019t hide. Keeps sane draw distance and sharpening; kills motion blur, gibs and clutter.',
    accent: '#E83A2F',
    convars: {
      'graphics.quality': 2,
      'graphics.af': 4,
      'graphics.shaderlod': 500,
      'graphics.drawdistance': 2000,
      'graphics.lodbias': 1,
      'graphics.parallax': 0,
      'graphics.lso': false,
      'graphics.fov': 90,
      'graphics.shadowmode': 1,
      'graphics.shadowcascades': 2,
      'graphics.shadowdistance': 100,
      'graphics.shadowlights': 1,
      'effects.aa': 2,
      'effects.ao': false,
      'effects.bloom': false,
      'effects.lensdirt': false,
      'effects.motionblur': false,
      'effects.shafts': false,
      'effects.sharpen': true,
      'effects.vignet': false,
      'effects.maxgibs': 0,
      'decor.quality': 50,
      'mesh.quality': 100,
      'particle.quality': 50,
      'terrain.quality': 75,
      'tree.quality': 75,
      'grass.quality': 0,
      'grass.displace': false,
      'water.quality': 1,
      'water.reflections': 0,
      'fps.limit': 0,
    },
  },
];

if (typeof module !== 'undefined' && module.exports) {
  // Node / Electron main process
  module.exports = { CONVARS, CATEGORY_ORDER, PRESETS };
} else if (typeof window !== 'undefined') {
  // Browser / renderer — loaded as a plain <script>
  window.RUSTPRESETS = { CONVARS, CATEGORY_ORDER, PRESETS };
}
