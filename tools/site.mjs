// Builds a static gallery of every sample in tests/samples, highlighted with the PlantUML
// TextMate grammar and the GitHub light/dark themes. The result is written to ../site and
// published with GitHub Pages by .github/workflows/pages.yml.
//
// Hovering a token shows the TextMate scopes it received.
//
// Usage: node site.mjs

import fs from 'node:fs';
import path from 'node:path';
import {
  root,
  scopesDir,
  THEMES,
  ROOT_SCOPES,
  escapeXml,
  createGrammarHighlighter,
  listSamples,
} from './common.mjs';

const outDir = path.join(root, 'site');
const REPO_URL = 'https://github.com/plantuml/language-grammar';

const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;

function tokenToHtml(token) {
  const text = escapeXml(token.content);
  if (token.content.trim() === '') return text;

  const light = token.variants.light;
  const dark = token.variants.dark;
  let style = `--l:${light.color};--d:${dark.color}`;
  if (light.fontStyle & FONT_STYLE_ITALIC) style += ';font-style:italic';
  if (light.fontStyle & FONT_STYLE_BOLD) style += ';font-weight:bold';
  if (light.fontStyle & FONT_STYLE_UNDERLINE) style += ';text-decoration:underline';

  const scopes = [];
  for (const part of token.explanation ?? []) {
    for (const { scopeName } of part.scopes) {
      if (!ROOT_SCOPES.has(scopeName) && !scopes.includes(scopeName)) scopes.push(scopeName);
    }
  }
  const title = escapeXml(scopes.join('\n'));
  return `<span class="t" style="${style}" title="${title}">${text}</span>`;
}

// Escapes a description and turns `code` spans into <code> elements.
const descriptionToHtml = (text) => escapeXml(text).replace(/`([^`]+)`/g, '<code>$1</code>');

function sampleToHtml(highlighter, sample) {
  const lines = highlighter.codeToTokensWithThemes(sample.body, {
    lang: sample.lang,
    themes: THEMES,
    includeExplanation: true,
  });
  const code = lines.map((line) => line.map(tokenToHtml).join('')).join('\n');

  const scopesFile = path.join(scopesDir, `${sample.name}.txt`);
  const scopes = fs.existsSync(scopesFile) ? fs.readFileSync(scopesFile, 'utf8') : '';

  return `
    <section id="${escapeXml(sample.name)}">
      <h2><a href="#${escapeXml(sample.name)}">${escapeXml(sample.file)}</a></h2>
      ${sample.description ? `<p class="description">${descriptionToHtml(sample.description)}</p>` : ''}
      <p class="links"><a href="${REPO_URL}/blob/main/tests/samples/${encodeURIComponent(sample.file)}">source on GitHub</a></p>
      <pre class="code"><code>${code}</code></pre>
      <details>
        <summary>TextMate scopes of every token</summary>
        <pre class="scopes"><code>${escapeXml(scopes)}</code></pre>
      </details>
    </section>`;
}

const CSS = `
:root {
  --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --border: #d1d9e0; --link: #0969da;
  --code-bg: #ffffff; --code-fg: #1f2328;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --border: #3d444d; --link: #4493f8;
    --code-bg: #0d1117; --code-fg: #e6edf3;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --border: #3d444d; --link: #4493f8;
  --code-bg: #0d1117; --code-fg: #e6edf3;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 0 16px 48px; background: var(--bg); color: var(--fg);
  font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
}
main { max-width: 880px; margin: 0 auto; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
header { padding: 32px 0 8px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
header h1 { margin: 0 0 8px; font-size: 28px; }
header p { margin: 4px 0; color: var(--muted); }
.theme-switch { margin-top: 12px; font-size: 14px; color: var(--muted); }
.theme-switch button {
  font: inherit; color: var(--fg); background: transparent; cursor: pointer;
  border: 1px solid var(--border); border-radius: 6px; padding: 2px 10px; margin-right: 4px;
}
.theme-switch button[aria-pressed="true"] { border-color: var(--link); color: var(--link); }
section { margin: 32px 0; }
section h2 { font-size: 20px; margin: 0 0 4px; }
section h2 a { color: inherit; }
.description { margin: 0 0 4px; color: var(--muted); }
.description code { font-size: 90%; padding: 1px 4px; border: 1px solid var(--border); border-radius: 4px; }
.links { margin: 0 0 8px; font-size: 14px; }
pre {
  margin: 0; padding: 16px; overflow: auto; border: 1px solid var(--border); border-radius: 6px;
  background: var(--code-bg); color: var(--code-fg);
  font: 14px/20px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}
pre code { font: inherit; }
.t { color: var(--l); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .t { color: var(--d); }
}
:root[data-theme="dark"] .t { color: var(--d); }
.t:hover { outline: 1px solid var(--muted); outline-offset: 1px; border-radius: 2px; }
details { margin-top: 8px; }
summary { cursor: pointer; color: var(--muted); font-size: 14px; }
pre.scopes { margin-top: 8px; font-size: 12px; line-height: 16px; max-height: 360px; }
footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: 14px; }
`;

const SCRIPT = `
(function () {
  var root = document.documentElement;
  var buttons = document.querySelectorAll('.theme-switch button');
  function apply(mode) {
    if (mode === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); });
    try { localStorage.setItem('theme', mode); } catch (e) {}
  }
  var saved = 'auto';
  try { saved = localStorage.getItem('theme') || 'auto'; } catch (e) {}
  apply(saved);
  buttons.forEach(function (b) { b.addEventListener('click', function () { apply(b.dataset.mode); }); });
})();
`;

function pageHtml(sections, count) {
  const commit = (process.env.GITHUB_SHA ?? '').slice(0, 7);
  const built = new Date().toISOString().slice(0, 10);
  const version = commit
    ? `commit <a href="${REPO_URL}/commit/${commit}">${commit}</a>, built on ${built}`
    : `built on ${built}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PlantUML language grammar: highlighting gallery</title>
<style>${CSS}</style>
</head>
<body>
<main>
  <header>
    <h1>PlantUML language grammar</h1>
    <p>Highlighting gallery: ${count} sample${count === 1 ? '' : 's'} highlighted with the TextMate grammar of <a href="${REPO_URL}">plantuml/language-grammar</a>.</p>
    <p>Hover a token to see its TextMate scopes.</p>
    <div class="theme-switch">Theme:
      <button type="button" data-mode="auto" aria-pressed="true">Auto</button>
      <button type="button" data-mode="light" aria-pressed="false">Light</button>
      <button type="button" data-mode="dark" aria-pressed="false">Dark</button>
    </div>
  </header>
${sections.join('\n')}
  <footer>
    Rendered with <a href="https://shiki.style">Shiki</a> and the GitHub themes: very close to what GitHub displays, but not guaranteed to be identical. ${version}.
  </footer>
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

async function main() {
  const highlighter = await createGrammarHighlighter();
  const samples = listSamples();
  const sections = samples.map((sample) => sampleToHtml(highlighter, sample));

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), pageHtml(sections, samples.length));
  console.log(`wrote site/index.html (${samples.length} sample(s))`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
