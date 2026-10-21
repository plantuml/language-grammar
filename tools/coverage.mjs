// Measures how many of the words listed by PlantUML (data/list-keywords.txt) the grammar recognizes.
//
// Each word is put in a small PlantUML diagram that is highlighted with the real grammar, and the
// scopes given to the word are looked at. This way the report does not depend on how the grammar is
// written, only on what it does.
//
// A rule can be "generic": it gives the same scope to any word, listed or not (for example every
// word after "skinparam" is seen as a parameter name). For these categories the count only shows
// that the grammar accepts the word, not that it knows it, so they are flagged.
//
// Usage:
//   node coverage.mjs               print the report
//   node coverage.mjs --markdown    print the report as Markdown (GitHub job summary)
//   node coverage.mjs --grammar=hybrid   measure the hybrid grammar (default: upstream)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, LANG, createGrammarHighlighter, GRAMMAR_KINDS } from './common.mjs';
import { parseKeywordList } from './keywords.mjs';
import { SCOPES } from './generate-grammar.mjs';

export { parseKeywordList };

// A word that is not a PlantUML word, used to detect the generic rules.
const CONTROL_WORD = 'zzqqxx';

// The scopes of every piece of highlighted text that contains one of `texts` as whole words.
// The grammar sometimes gives one scope to several words ("note left"), so a piece is accepted
// when it contains the word, not only when it is equal to it.
function scopesOf(highlighter, code, texts) {
  const { tokens } = highlighter.codeToTokens(code, {
    lang: LANG,
    theme: THEMES.light,
    includeExplanation: true,
  });
  const patterns = texts.map((t) => new RegExp(`(^|[^\\w-])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w-])`));
  const found = [];
  for (const line of tokens) {
    for (const token of line) {
      for (const part of token.explanation ?? []) {
        if (patterns.some((re) => re.test(part.content))) found.push(part.scopes.map((s) => s.scopeName));
      }
    }
  }
  return found;
}

// The scope names of the upstream grammar and of the hybrid one are different: both are accepted.
const hasScope = (scopes, ...names) => names.some((n) => scopes.includes(n));

const inDiagram = (line) => `@startuml\n${line}\n@enduml`;

// How each category is checked: the probes put a word in the places where it is expected, and
// `isRecognized` tells if the scopes of the word are the ones the grammar gives to such words.
const CATEGORIES = [
  {
    id: 'type',
    label: 'Types',
    section: 'type',
    note: 'element declarations at the start of a line',
    words: (s) => s.type.words,
    probes: (w) => [inDiagram(`${w} X`)],
    isRecognized: (scopes) => hasScope(scopes, 'keyword.other.linebegin.source.wsd', SCOPES.type),
  },
  {
    id: 'blocks',
    label: 'Diagram blocks',
    section: 'keyword',
    note: '@startxxx / @endxxx markers',
    words: (s) => s.keyword.words.filter((w) => w.startsWith('@')),
    probes: (w) => [w.startsWith('@start') ? `${w}\n@enduml` : `@startuml\n${w}`],
    control: (w) => (w.startsWith('@start') ? `@start${CONTROL_WORD}` : `@end${CONTROL_WORD}`),
    isRecognized: (scopes) => hasScope(scopes, 'keyword.control.diagram.source.wsd', SCOPES.diagram),
  },
  {
    id: 'keywords',
    label: 'Other keywords',
    section: 'keyword',
    note: 'looked for in a few typical contexts (line start, alone, in a note, in an activity condition, in a class)',
    words: (s) => s.keyword.words.filter((w) => !w.startsWith('@')),
    probes: (w) => [
      inDiagram(`${w} X`),
      inDiagram(`X ${w} Y`),
      inDiagram(w),
      inDiagram(`${w} (X) then (Y)`),
      inDiagram(`${w} left: X`),
      inDiagram(`A -> B\n${w} X`),
      inDiagram(`${w} X Y`),
      inDiagram(`note ${w} of A: X`),
      inDiagram(`note ${w} A: X`),
      inDiagram(`note ${w}: X`),
      inDiagram(`${w} A: X`),
      inDiagram(`if (X) ${w} (Y)`),
      inDiagram(`while (X) ${w} (Y)`),
      inDiagram(`class A {\n${w} x\n}`),
    ],
    isRecognized: (scopes) => scopes.some((s) => s.startsWith('keyword.')),
  },
  {
    id: 'preprocessor',
    label: 'Preprocessor directives',
    section: 'preprocessor',
    note: 'directives that start with !',
    words: (s) => s.preprocessor.words,
    probes: (w) => [inDiagram(`${w} X`)],
    control: () => `!${CONTROL_WORD}`,
    isRecognized: (scopes) => hasScope(scopes, 'entity.name.function.preprocessings.source.wsd', SCOPES.preprocessor),
  },
  {
    id: 'skinparameter',
    label: 'Skin parameters',
    section: 'skinparameter',
    note: 'names after skinparam',
    words: (s) => s.skinparameter.words,
    probes: (w) => [inDiagram(`skinparam ${w} red`)],
    isRecognized: (scopes) => hasScope(scopes, 'keyword.other.skinparam.keyword.source.wsd', SCOPES.skinparam),
  },
  {
    id: 'color',
    label: 'Color names',
    section: 'color',
    note: 'names after #',
    words: (s) => s.color.words,
    probes: (w) => [inDiagram(`rectangle X #${w}`)],
    textsOf: (w) => [`#${w}`],
    isRecognized: (scopes) => hasScope(scopes, 'constant.numeric.colors.source.wsd', SCOPES.color),
  },
];

function isRecognizedWord(highlighter, category, word) {
  const texts = category.textsOf ? category.textsOf(word) : [word];
  return category
    .probes(word)
    .some((code) => scopesOf(highlighter, code, texts).some((scopes) => category.isRecognized(scopes)));
}

// The coverage of every category: { id, label, note, total, recognized, missing, generic }
export function computeCoverage(highlighter, sections = parseKeywordList()) {
  return CATEGORIES.map((category) => {
    const words = category.words(sections);
    const missing = words.filter((w) => !isRecognizedWord(highlighter, category, w));

    // A generic rule also accepts a word that does not exist in PlantUML.
    const control = category.control ? category.control(words[0] ?? '') : CONTROL_WORD;
    const generic = isRecognizedWord(highlighter, category, control);

    return {
      id: category.id,
      label: category.label,
      note: category.note,
      total: words.length,
      recognized: words.length - missing.length,
      missing,
      generic,
    };
  });
}

const GENERIC_NOTE = 'generic rule: any word is accepted, the list is not used';

function toText(results) {
  const rows = results.map((r) => {
    const count = `${r.recognized}/${r.total}`;
    const flag = r.generic ? `  (${GENERIC_NOTE})` : '';
    const missing = r.missing.length > 0 ? `\n      missing: ${r.missing.join(', ')}` : '';
    return `  ${r.label.padEnd(26)}${count.padStart(9)}${flag}${missing}`;
  });
  return `Keyword coverage of the grammar (data/list-keywords.txt)\n\n${rows.join('\n')}\n`;
}

function toMarkdown(results) {
  const lines = [
    '## Keyword coverage of the grammar',
    '',
    'How many of the words listed by `plantuml.jar --list-keywords` the grammar recognizes. Information only: it never fails the build.',
    '',
    '| Category | Recognized | Notes |',
    '| --- | ---: | --- |',
  ];
  for (const r of results) {
    lines.push(`| ${r.label} | ${r.recognized} / ${r.total} | ${r.generic ? GENERIC_NOTE : r.note} |`);
  }
  for (const r of results.filter((x) => x.missing.length > 0)) {
    lines.push('', `<details><summary>${r.label}: ${r.missing.length} not recognized</summary>`, '');
    lines.push(r.missing.map((w) => `\`${w}\``).join(', '), '', '</details>');
  }
  return lines.join('\n') + '\n';
}

export { GENERIC_NOTE };

// Command line
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const kindArg = process.argv.find((a) => a.startsWith('--grammar='));
  const kind = kindArg ? kindArg.slice('--grammar='.length) : 'upstream';
  if (!GRAMMAR_KINDS.includes(kind)) throw new Error(`Unknown grammar "${kind}" (${GRAMMAR_KINDS.join(', ')})`);
  const highlighter = await createGrammarHighlighter(kind);
  const results = computeCoverage(highlighter);
  process.stdout.write(process.argv.includes('--markdown') ? toMarkdown(results) : toText(results));
}
