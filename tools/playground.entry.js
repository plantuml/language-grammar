// Browser side of the playground page (bundled into site/assets/playground.js by site.mjs).
// The user types PlantUML code in a textarea; it is highlighted live with Shiki, the PlantUML
// TextMate grammar and the GitHub themes, like the samples of the gallery.

import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import wasm from 'shiki/wasm';
import githubLight from '@shikijs/themes/github-light-default';
import githubDark from '@shikijs/themes/github-dark-default';
import json from '@shikijs/langs/json';
import yaml from '@shikijs/langs/yaml';
import css from '@shikijs/langs/css';
import latex from '@shikijs/langs/latex';

const LANG = 'plantuml';
const THEMES = { light: 'github-light-default', dark: 'github-dark-default' };
const ROOT_SCOPES = new Set(['source.wsd']);
const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;

const $ = (id) => document.getElementById(id);
const input = $('pg-input');
const output = $('pg-output');
const status = $('pg-status');
const grammarSelect = $('pg-grammar');
const sampleSelect = $('pg-sample');

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// One highlighter per grammar kind, created on demand.
const highlighters = new Map();

function loadHighlighter(kind) {
  if (!highlighters.has(kind)) {
    const promise = (async () => {
      const response = await fetch(new URL(`grammar-${kind}.json`, import.meta.url));
      if (!response.ok) throw new Error(`Cannot load the ${kind} grammar (HTTP ${response.status})`);
      const grammar = { ...(await response.json()), name: LANG };
      // The hybrid grammar includes other languages, which GitHub also has.
      const embedded = kind === 'hybrid' ? [...json, ...yaml, ...css, ...latex] : [];
      return createHighlighterCore({
        themes: [githubLight, githubDark],
        langs: [...embedded, grammar],
        engine: createOnigurumaEngine(wasm),
      });
    })();
    highlighters.set(kind, promise);
  }
  return highlighters.get(kind);
}

// The tokens of the last rendering, to find the one under the caret.
let lastTokens = [];

function scopesOf(token) {
  const scopes = [];
  for (const part of token.explanation ?? []) {
    for (const { scopeName } of part.scopes) {
      if (!ROOT_SCOPES.has(scopeName) && !scopes.includes(scopeName)) scopes.push(scopeName);
    }
  }
  return scopes;
}

function tokenToHtml(token) {
  const text = escapeHtml(token.content);
  if (token.content.trim() === '') return text;
  const light = token.variants.light;
  const dark = token.variants.dark;
  let style = `--l:${light.color};--d:${dark.color}`;
  if (light.fontStyle & FONT_STYLE_ITALIC) style += ';font-style:italic';
  if (light.fontStyle & FONT_STYLE_BOLD) style += ';font-weight:bold';
  if (light.fontStyle & FONT_STYLE_UNDERLINE) style += ';text-decoration:underline';
  return `<span class="t" style="${style}">${text}</span>`;
}

let renderId = 0;

async function render() {
  const id = ++renderId;
  const code = input.value.replace(/\r\n/g, '\n');
  let highlighter;
  try {
    highlighter = await loadHighlighter(grammarSelect.value);
  } catch (err) {
    highlighters.delete(grammarSelect.value);
    status.textContent = String(err.message ?? err);
    return;
  }
  if (id !== renderId) return; // a newer rendering has started
  const lines = highlighter.codeToTokensWithThemes(code, {
    lang: LANG,
    themes: THEMES,
    includeExplanation: true,
  });
  lastTokens = lines.flat();
  // The final newline keeps the last line of the textarea and of the output the same height.
  output.innerHTML = lines.map((line) => line.map(tokenToHtml).join('')).join('\n') + '\n';
  syncScroll();
  showScopes();
}

function syncScroll() {
  output.scrollTop = input.scrollTop;
  output.scrollLeft = input.scrollLeft;
}

// Shows the TextMate scopes of the token at the caret.
function showScopes() {
  const pos = input.selectionStart;
  const token = lastTokens.find((t) => pos >= t.offset && pos < t.offset + t.content.length)
    ?? lastTokens.findLast((t) => t.offset + t.content.length === pos && t.content.trim() !== '');
  if (!token || token.content.trim() === '') {
    status.textContent = 'Click in the text to see the TextMate scopes of a token.';
    return;
  }
  status.textContent = `${JSON.stringify(token.content)}: ${scopesOf(token).join(' > ')}`;
}

let scheduled = false;
function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    render();
  });
}

input.addEventListener('input', scheduleRender);
input.addEventListener('scroll', syncScroll);
for (const event of ['click', 'keyup', 'select']) input.addEventListener(event, showScopes);
grammarSelect.addEventListener('change', render);
sampleSelect.addEventListener('change', () => {
  const sample = window.PLAYGROUND_SAMPLES?.[Number(sampleSelect.value)];
  if (sample) {
    input.value = sample.body;
    render();
  }
});

const wanted = new URLSearchParams(location.search).get('grammar');
if (wanted === 'hybrid' || wanted === 'upstream') grammarSelect.value = wanted;
render();
