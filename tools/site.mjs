// Builds a static site that shows the samples of tests/ highlighted with the PlantUML TextMate
// grammar and the GitHub light/dark themes. The result is written to ../site and published with
// GitHub Pages by .github/workflows/pages.yml.
//
// The site follows the tree of the repository: tests/samples/... becomes samples/...,
// tests/vega/... becomes vega/..., with one page per folder.
// Hovering a token shows the TextMate scopes it received.
//
// Usage: node site.mjs

import fs from 'node:fs';
import path from 'node:path';
import {
  root,
  testsDir,
  scopesDir,
  THEMES,
  ROOT_SCOPES,
  escapeXml,
  createGrammarHighlighter,
  buildTree,
} from './common.mjs';

const outDir = path.join(root, 'site');
const REPO_URL = 'https://github.com/plantuml/language-grammar';

// The folders of tests/ that are shown, in this order.
const SECTIONS = [
  {
    key: 'samples',
    title: 'Samples',
    summary:
      'Hand-picked samples. Each one also has a snapshot of its TextMate scopes and SVG renders in the repository.',
    withScopes: true,
  },
  {
    key: 'vega',
    title: 'Vega corpus',
    summary:
      'The non-regression tests of PlantUML (Vega), copied from the PlantUML repository. They are real PlantUML sources, grouped by feature.',
    withScopes: false,
  },
];

const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const hrefOf = (segment) => encodeURIComponent(segment);

// ---------------------------------------------------------------------------------------------
// Highlighted samples
// ---------------------------------------------------------------------------------------------

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

function sampleToHtml(highlighter, section, node, sample) {
  const lines = highlighter.codeToTokensWithThemes(sample.body, {
    lang: sample.lang,
    themes: THEMES,
    includeExplanation: true,
  });
  const code = lines.map((line) => line.map(tokenToHtml).join('')).join('\n');

  // The scope snapshots only exist for the (flat) folder of hand-picked samples.
  let scopesHtml = '';
  if (section.withScopes) {
    const scopesFile = path.join(scopesDir, `${sample.name}.txt`);
    if (fs.existsSync(scopesFile)) {
      scopesHtml = `
      <details>
        <summary>TextMate scopes of every token</summary>
        <pre class="scopes"><code>${escapeXml(fs.readFileSync(scopesFile, 'utf8'))}</code></pre>
      </details>`;
    }
  }

  // The file in the repository: tests/<segments>/<file>
  const repoPath = [...node.segments, sample.file].map(hrefOf).join('/');
  const id = escapeXml(sample.file);
  return `
    <section id="${id}">
      <h2><a href="#${id}">${escapeXml(sample.file)}</a></h2>
      ${sample.description ? `<p class="description">${descriptionToHtml(sample.description)}</p>` : ''}
      <p class="links"><a href="${REPO_URL}/blob/main/tests/${repoPath}">source on GitHub</a></p>
      <pre class="code"><code>${code}</code></pre>${scopesHtml}
    </section>`;
}

// ---------------------------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------------------------

const commit = (process.env.GITHUB_SHA ?? '').slice(0, 7);
const built = new Date().toISOString().slice(0, 10);

// Applies the saved theme before the page is painted, to avoid a flash.
const EARLY_THEME_SCRIPT = `try{var t=localStorage.getItem('theme');if(t&&t!=='auto')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

function breadcrumb(segments) {
  const parts = [`<a href="${'../'.repeat(segments.length)}index.html">Home</a>`];
  segments.forEach((segment, i) => {
    const isLast = i === segments.length - 1;
    if (isLast) {
      parts.push(`<span>${escapeXml(segment)}</span>`);
    } else {
      const up = '../'.repeat(segments.length - 1 - i);
      parts.push(`<a href="${up}index.html">${escapeXml(segment)}</a>`);
    }
  });
  return `<nav class="breadcrumb">${parts.join(' <span class="sep">/</span> ')}</nav>`;
}

const themeSwitch = `
    <div class="theme-switch">Theme:
      <button type="button" data-mode="auto" aria-pressed="true">Auto</button>
      <button type="button" data-mode="light" aria-pressed="false">Light</button>
      <button type="button" data-mode="dark" aria-pressed="false">Dark</button>
    </div>`;

function writePage(segments, { title, header, body }) {
  const prefix = '../'.repeat(segments.length);
  const version = commit
    ? `commit <a href="${REPO_URL}/commit/${commit}">${commit}</a>, built on ${built}`
    : `built on ${built}`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(title)}</title>
<script>${EARLY_THEME_SCRIPT}</script>
<link rel="stylesheet" href="${prefix}assets/style.css">
</head>
<body>
<main>
  <header>
${header}
${themeSwitch}
  </header>
${body}
  <footer>
    Rendered with <a href="https://shiki.style">Shiki</a> and the GitHub themes: very close to what GitHub displays, but not guaranteed to be identical. ${version}.
  </footer>
</main>
<script src="${prefix}assets/theme.js"></script>
</body>
</html>
`;
  const dir = path.join(outDir, ...segments);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

function folderList(node) {
  if (node.dirs.length === 0) return '';
  const items = node.dirs
    .map(
      (d) =>
        `      <li><a href="${hrefOf(d.name)}/index.html">${escapeXml(d.name)}/</a> <span class="count">${plural(d.fileCount, 'sample')}</span></li>`
    )
    .join('\n');
  return `
  <h2 class="list-title">Folders</h2>
  <ul class="folders">
${items}
  </ul>`;
}

function fileIndex(node) {
  if (node.files.length < 2) return '';
  const links = node.files
    .map((f) => `<a href="#${escapeXml(f.file)}">${escapeXml(f.file)}</a>`)
    .join(' ');
  return `
  <h2 class="list-title">Files in this folder (${node.files.length})</h2>
  <p class="file-index">${links}</p>`;
}

function renderFolder(highlighter, section, node) {
  const isSectionRoot = node.segments.length === 1;
  const repoDir = node.segments.map(hrefOf).join('/');
  const samples = node.files.map((f) => sampleToHtml(highlighter, section, node, f)).join('\n');

  writePage(node.segments, {
    title: `${node.segments.join('/')} - PlantUML language grammar`,
    header: `    ${breadcrumb(node.segments)}
    <h1>${isSectionRoot ? escapeXml(section.title) : escapeXml(node.name)}</h1>
    <p>${plural(node.fileCount, 'sample')} in <code>tests/${escapeXml(node.segments.join('/'))}</code>.
    <a href="${REPO_URL}/tree/main/tests/${repoDir}">folder on GitHub</a></p>
    ${isSectionRoot ? `<p>${escapeXml(section.summary)}</p>` : ''}
    <p>Hover a token to see its TextMate scopes.</p>`,
    body: `${folderList(node)}${fileIndex(node)}
${samples}`,
  });

  for (const child of node.dirs) renderFolder(highlighter, section, child);
}

function renderHome(sections) {
  const cards = sections
    .map(({ section, tree }) => {
      const chips = tree.dirs
        .map(
          (d) =>
            `<a class="chip" href="${section.key}/${hrefOf(d.name)}/index.html">${escapeXml(d.name)} <span class="count">${d.fileCount}</span></a>`
        )
        .join('\n        ');
      return `
  <section class="card">
    <h2><a href="${section.key}/index.html">${escapeXml(section.title)}</a> <span class="count">${plural(tree.fileCount, 'sample')}</span></h2>
    <p class="description">${escapeXml(section.summary)}</p>${
      chips ? `\n    <p class="chips">\n        ${chips}\n    </p>` : ''
    }
  </section>`;
    })
    .join('\n');

  writePage([], {
    title: 'PlantUML language grammar: highlighting gallery',
    header: `    <h1>PlantUML language grammar</h1>
    <p>Highlighting gallery: PlantUML samples highlighted with the TextMate grammar of <a href="${REPO_URL}">plantuml/language-grammar</a>.</p>
    <p>The tree of this site is the one of the <code>tests/</code> folder of the repository.</p>`,
    body: cards,
  });
}

// ---------------------------------------------------------------------------------------------
// Static assets
// ---------------------------------------------------------------------------------------------

const CSS = `
:root {
  --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --border: #d1d9e0; --link: #0969da;
  --code-bg: #ffffff; --code-fg: #1f2328; --card-bg: #f6f8fa;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --border: #3d444d; --link: #4493f8;
    --code-bg: #0d1117; --code-fg: #e6edf3; --card-bg: #151b23;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --border: #3d444d; --link: #4493f8;
  --code-bg: #0d1117; --code-fg: #e6edf3; --card-bg: #151b23;
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
code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; }
header { padding: 24px 0 8px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
header h1 { margin: 8px 0; font-size: 28px; overflow-wrap: anywhere; }
header p { margin: 4px 0; color: var(--muted); }
header p code { font-size: 90%; }
.breadcrumb { font-size: 14px; color: var(--muted); }
.breadcrumb .sep { padding: 0 2px; }
.theme-switch { margin-top: 12px; font-size: 14px; color: var(--muted); }
.theme-switch button {
  font: inherit; color: var(--fg); background: transparent; cursor: pointer;
  border: 1px solid var(--border); border-radius: 6px; padding: 2px 10px; margin-right: 4px;
}
.theme-switch button[aria-pressed="true"] { border-color: var(--link); color: var(--link); }
.count { color: var(--muted); font-size: 14px; font-weight: normal; }
.list-title { font-size: 16px; margin: 24px 0 8px; color: var(--muted); font-weight: 600; }
.folders { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px 24px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
.file-index { margin: 0; font-size: 14px; line-height: 1.9; }
.file-index a { margin-right: 10px; white-space: nowrap; }
.card { margin: 16px 0; padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--card-bg); }
.card h2 { margin: 0 0 4px; font-size: 20px; }
.chips { margin: 8px 0 0; }
.chip {
  display: inline-block; margin: 0 6px 6px 0; padding: 2px 10px; font-size: 14px;
  border: 1px solid var(--border); border-radius: 999px; background: var(--bg);
}
section { margin: 32px 0; }
section.card { margin: 16px 0; }
section h2 { font-size: 20px; margin: 0 0 4px; overflow-wrap: anywhere; }
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

const THEME_SCRIPT = `(function () {
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

function writeAssets() {
  const dir = path.join(outDir, 'assets');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'style.css'), CSS.trimStart());
  fs.writeFileSync(path.join(dir, 'theme.js'), THEME_SCRIPT);
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const highlighter = await createGrammarHighlighter();

  const sections = SECTIONS.map((section) => ({
    section,
    dir: path.join(testsDir, section.key),
  }))
    .filter(({ dir }) => fs.existsSync(dir))
    .map(({ section, dir }) => ({ section, tree: buildTree(dir, [section.key]) }))
    .filter(({ tree }) => tree.fileCount > 0);

  if (sections.length === 0) {
    throw new Error('No sample found in tests/');
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  writeAssets();
  renderHome(sections);
  for (const { section, tree } of sections) renderFolder(highlighter, section, tree);

  const pages = fs.readdirSync(outDir, { recursive: true }).filter((f) => f.endsWith('index.html')).length;
  const total = sections.reduce((n, { tree }) => n + tree.fileCount, 0);
  console.log(`wrote site/ (${plural(pages, 'page')}, ${plural(total, 'sample')})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
