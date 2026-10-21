// Code shared by render.mjs (snapshots and SVG renders) and site.mjs (static gallery).

import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { createHighlighter } from 'shiki';

export const root = path.resolve(import.meta.dirname, '..');
export const testsDir = path.join(root, 'tests');
export const samplesDir = path.join(testsDir, 'samples');
export const scopesDir = path.join(testsDir, 'scopes');
export const renderDir = path.join(testsDir, 'render');

const grammarFile = path.join(root, 'syntaxes', 'plantuml.yaml-tmLanguage');
const injectionFile = path.join(root, 'syntaxes', 'codeblock.json');

export const THEMES = { light: 'github-light-default', dark: 'github-dark-default' };
export const LANG = 'plantuml';
export const MARKDOWN_SCOPE = 'text.html.markdown';
// Root scopes are the same on every line of a file, so they are left out of the scope snapshots.
export const ROOT_SCOPES = new Set(['source.wsd', MARKDOWN_SCOPE]);

const SAMPLE_EXTENSIONS = ['.puml', '.iuml', '.plantuml', '.md'];

export const escapeXml = (s) =>
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

// A Shiki highlighter loaded with the GitHub themes and the grammars of this repository.
export function createGrammarHighlighter() {
  return createHighlighter({
    themes: Object.values(THEMES),
    langs: ['markdown', ...loadGrammars()],
  });
}

const isSampleFile = (file) => SAMPLE_EXTENSIONS.includes(path.extname(file));

// The Vega files (tests/vega) start with a YAML header between two "---" lines, before @startuml.
// It is a test setting, not PlantUML code, so it is ignored: samples are read as if it did not exist.
const stripYamlHeader = (code) => code.replace(/^---\n[\s\S]*?\n---\n/, '');

// Reads one sample: { file, name, description, lang, body }.
function readSample(dir, file) {
  const code = stripYamlHeader(fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n'));
  const name = path.basename(file, path.extname(file));
  // Optional one-line description of what the sample tests: <name>.description.txt
  const descriptionFile = path.join(dir, `${name}.description.txt`);
  return {
    file,
    name,
    description: fs.existsSync(descriptionFile) ? fs.readFileSync(descriptionFile, 'utf8').trim() : '',
    lang: path.extname(file) === '.md' ? 'markdown' : LANG,
    body: code.endsWith('\n') ? code.slice(0, -1) : code,
  };
}

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// All the samples of tests/samples (not recursive): { file, name, description, lang, body }.
export function listSamples() {
  const samples = fs
    .readdirSync(samplesDir)
    .filter(isSampleFile)
    .sort(byName)
    .map((file) => readSample(samplesDir, file));
  if (samples.length === 0) {
    throw new Error('No sample found in tests/samples');
  }
  return samples;
}

// The samples of a directory and of all its sub-directories, as a tree:
// { name, segments, files, dirs, fileCount } where segments is the path from the root of the tree.
// Directories without any sample are left out.
export function buildTree(dir, segments = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => byName(a.name, b.name));
  const node = {
    name: segments.length > 0 ? segments[segments.length - 1] : path.basename(dir),
    segments,
    files: [],
    dirs: [],
    fileCount: 0,
  };
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const child = buildTree(path.join(dir, entry.name), [...segments, entry.name]);
      if (child.fileCount > 0) node.dirs.push(child);
    } else if (entry.isFile() && isSampleFile(entry.name)) {
      node.files.push(readSample(dir, entry.name));
    }
  }
  node.fileCount = node.files.length + node.dirs.reduce((n, d) => n + d.fileCount, 0);
  return node;
}
