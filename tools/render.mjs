// Renders every sample in tests/samples with the PlantUML TextMate grammar.
//
// For each sample it produces:
//   - tests/scopes/<name>.txt           the TextMate scopes of every token (regression snapshot)
//   - tests/render/<name>.light.svg     the highlighted code, GitHub light theme
//   - tests/render/<name>.dark.svg      the highlighted code, GitHub dark theme
//
// Usage:
//   node render.mjs           (re)generate the files
//   node render.mjs --check   fail if the files on disk differ from what would be generated

import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { createHighlighter } from 'shiki';

const root = path.resolve(import.meta.dirname, '..');
const samplesDir = path.join(root, 'tests', 'samples');
const scopesDir = path.join(root, 'tests', 'scopes');
const renderDir = path.join(root, 'tests', 'render');
const grammarFile = path.join(root, 'syntaxes', 'plantuml.yaml-tmLanguage');
const injectionFile = path.join(root, 'syntaxes', 'codeblock.json');

const THEMES = { light: 'github-light-default', dark: 'github-dark-default' };
const BORDER = { light: '#d1d9e0', dark: '#3d444d' };
const LANG = 'plantuml';
const MARKDOWN_SCOPE = 'text.html.markdown';
// Root scopes are the same on every line of a file, so they are left out of the scope snapshots.
const ROOT_SCOPES = new Set(['source.wsd', MARKDOWN_SCOPE]);

const CHAR_WIDTH = 8.4;
const LINE_HEIGHT = 20;
const FONT_SIZE = 14;
const PADDING = 16;
const FONT_FAMILY =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function loadGrammars() {
  const grammar = loadYaml(fs.readFileSync(grammarFile, 'utf8'));
  // The injection grammar makes ```plantuml fenced blocks of Markdown files use the PlantUML grammar.
  const injection = JSON.parse(fs.readFileSync(injectionFile, 'utf8'));
  return [
    { ...grammar, name: LANG },
    { ...injection, name: 'plantuml-codeblock', injectTo: [MARKDOWN_SCOPE] },
  ];
}

// Splits the tokens of a highlighted sample into lines of { text, color, fontStyle }.
function toSvg(tokenResult, themeKind) {
  const lines = tokenResult.tokens;
  const maxCols = Math.max(1, ...lines.map((l) => l.reduce((n, t) => n + t.content.length, 0)));
  const width = Math.ceil(PADDING * 2 + maxCols * CHAR_WIDTH);
  const height = PADDING * 2 + lines.length * LINE_HEIGHT;

  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  out.push(
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="${tokenResult.bg}" stroke="${BORDER[themeKind]}"/>`
  );
  out.push(
    `<g font-family="${escapeXml(FONT_FAMILY)}" font-size="${FONT_SIZE}" fill="${tokenResult.fg}" xml:space="preserve">`
  );
  lines.forEach((line, i) => {
    const y = PADDING + i * LINE_HEIGHT + FONT_SIZE;
    let col = 0;
    const spans = [];
    for (const t of line) {
      if (t.content.trim() !== '') {
        const x = (PADDING + col * CHAR_WIDTH).toFixed(1);
        let attrs = `x="${x}"`;
        if (t.color) attrs += ` fill="${t.color}"`;
        // fontStyle is a bit mask: 1 = italic, 2 = bold, 4 = underline
        if (t.fontStyle & 1) attrs += ' font-style="italic"';
        if (t.fontStyle & 2) attrs += ' font-weight="bold"';
        if (t.fontStyle & 4) attrs += ' text-decoration="underline"';
        spans.push(`<tspan ${attrs}>${escapeXml(t.content)}</tspan>`);
      }
      col += t.content.length;
    }
    out.push(`<text y="${y}">${spans.join('')}</text>`);
  });
  out.push('</g>');
  out.push('</svg>');
  return out.join('\n') + '\n';
}

// One line per token: the text, then the scopes that apply to it (root scope omitted).
function toScopes(code, tokenResult) {
  const out = [];
  const sourceLines = code.split('\n');
  tokenResult.tokens.forEach((line, i) => {
    out.push(`${String(i + 1).padStart(3)} | ${sourceLines[i] ?? ''}`);
    for (const token of line) {
      for (const part of token.explanation ?? []) {
        if (part.content.trim() === '') continue;
        const scopes = part.scopes.map((s) => s.scopeName).filter((s) => !ROOT_SCOPES.has(s));
        out.push(`      ${JSON.stringify(part.content)}  ${scopes.join(' ')}`);
      }
    }
  });
  return out.join('\n') + '\n';
}

async function main() {
  const check = process.argv.includes('--check');

  const highlighter = await createHighlighter({
    themes: Object.values(THEMES),
    langs: ['markdown', ...loadGrammars()],
  });

  const samples = fs
    .readdirSync(samplesDir)
    .filter((f) => ['.puml', '.iuml', '.plantuml', '.md'].includes(path.extname(f)))
    .sort();

  if (samples.length === 0) {
    console.error('No sample found in tests/samples');
    process.exit(1);
  }

  const expected = new Map();
  for (const file of samples) {
    const name = path.basename(file, path.extname(file));
    const lang = path.extname(file) === '.md' ? 'markdown' : LANG;
    const code = fs.readFileSync(path.join(samplesDir, file), 'utf8').replace(/\r\n/g, '\n');
    const body = code.endsWith('\n') ? code.slice(0, -1) : code;

    for (const [kind, theme] of Object.entries(THEMES)) {
      const tokenResult = highlighter.codeToTokens(body, {
        lang,
        theme,
        includeExplanation: true,
      });
      expected.set(path.join(renderDir, `${name}.${kind}.svg`), toSvg(tokenResult, kind));
      if (kind === 'light') {
        expected.set(path.join(scopesDir, `${name}.txt`), toScopes(body, tokenResult));
      }
    }
  }

  if (check) {
    let failures = 0;
    for (const [file, content] of expected) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      if (!fs.existsSync(file)) {
        console.error(`MISSING  ${rel}`);
        failures++;
      } else if (fs.readFileSync(file, 'utf8') !== content) {
        console.error(`CHANGED  ${rel}`);
        failures++;
      }
    }
    if (failures > 0) {
      console.error(`\n${failures} file(s) out of date. Run "npm run build" in tools/ and commit the result.`);
      process.exit(1);
    }
    console.log(`OK: ${expected.size} generated file(s) are up to date.`);
    return;
  }

  fs.mkdirSync(scopesDir, { recursive: true });
  fs.mkdirSync(renderDir, { recursive: true });
  for (const [file, content] of expected) {
    fs.writeFileSync(file, content);
    console.log(`wrote ${path.relative(root, file).split(path.sep).join('/')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
