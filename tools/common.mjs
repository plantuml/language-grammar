// Code shared by render.mjs (snapshots and SVG renders) and site.mjs (static gallery).

import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { createHighlighter } from 'shiki';

export const root = path.resolve(import.meta.dirname, '..');
export const samplesDir = path.join(root, 'tests', 'samples');
export const scopesDir = path.join(root, 'tests', 'scopes');
export const renderDir = path.join(root, 'tests', 'render');

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

// All the samples of tests/samples: { file, name, lang, body }.
export function listSamples() {
  const samples = fs
    .readdirSync(samplesDir)
    .filter((f) => SAMPLE_EXTENSIONS.includes(path.extname(f)))
    .sort()
    .map((file) => {
      const code = fs.readFileSync(path.join(samplesDir, file), 'utf8').replace(/\r\n/g, '\n');
      const name = path.basename(file, path.extname(file));
      // Optional one-line description of what the sample tests: <name>.description.txt
      const descriptionFile = path.join(samplesDir, `${name}.description.txt`);
      return {
        file,
        name,
        description: fs.existsSync(descriptionFile)
          ? fs.readFileSync(descriptionFile, 'utf8').trim()
          : '',
        lang: path.extname(file) === '.md' ? 'markdown' : LANG,
        body: code.endsWith('\n') ? code.slice(0, -1) : code,
      };
    });
  if (samples.length === 0) {
    throw new Error('No sample found in tests/samples');
  }
  return samples;
}
