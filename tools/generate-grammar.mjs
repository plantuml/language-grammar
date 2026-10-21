// Generates the "hybrid" TextMate grammar (syntaxes/plantuml-hybrid.tmLanguage.json). PROTOTYPE.
//
// The idea: the words come from data/list-keywords.txt (what PlantUML itself says it knows), the
// structure is written here by hand. The grammar first looks at the @startXXX line, because the
// language that follows depends on it: @startuml, @startmindmap, @startgantt, @startjson, ...
// are different languages. Each family of diagrams has its own set of rules.
//
// Colors: a TextMate grammar only gives scope names, the theme turns them into colors. The words of
// each type of list get a different scope (see SCOPES), chosen to give different colors in the
// GitHub themes where possible.
//
// Usage:
//   node generate-grammar.mjs            write the grammar
//   node generate-grammar.mjs --check    fail if the committed grammar is out of date

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './common.mjs';
import { parseKeywordList } from './keywords.mjs';

export const hybridGrammarFile = path.join(root, 'syntaxes', 'plantuml-hybrid.tmLanguage.json');

// ---------------------------------------------------------------------------------------------
// Scope names. The color is the one given by the GitHub light theme.
// ---------------------------------------------------------------------------------------------
export const SCOPES = {
  diagram: 'keyword.control.diagram.wsd', // red     @startuml, @enduml
  diagramName: 'entity.name.function.diagram.wsd', // purple  name after @startuml
  type: 'storage.type.element.wsd', // red     class, actor, participant, ...
  elementName: 'entity.name.type.wsd', // orange  the name that follows a type word
  keyword: 'keyword.control.wsd', // red     alt, loop, note, skinparam, ...
  preprocessor: 'entity.name.function.preprocessor.wsd', // purple  !include, !define, ...
  builtin: 'support.function.builtin.wsd', // blue    %date(), %upper(), ...
  skinparam: 'variable.parameter.skinparam.wsd', // orange  the names of the skin parameters
  color: 'constant.other.color.wsd', // blue    #red, #FF0000
  number: 'constant.numeric.wsd', // blue
  stereotype: 'entity.name.tag.stereotype.wsd', // green   <<service>>
  string: 'string.quoted.double.wsd', // dark blue
  label: 'string.unquoted.label.wsd', // dark blue  text after the colon of a message
  note: 'string.unquoted.note.wsd', // dark blue  body of a note or a legend
  title: 'entity.name.section.title.wsd', // orange  title, header, footer, caption
  arrow: 'keyword.operator.arrow.wsd', // red
  operator: 'keyword.operator.wsd', // red
  commentLine: 'comment.line.wsd', // grey
  commentBlock: 'comment.block.wsd', // grey
  task: 'entity.name.function.task.wsd', // purple  [Task] in Gantt
  property: 'support.type.property-name.wsd', // blue    key = value, [key: type]
  dataType: 'support.type.wsd', // blue    K and V in Map<K,V>, long in [id: long]
  level: 'markup.heading.level.wsd', // blue    * ** *** of a mind map
};

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const escapeRegex = (w) => w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/\s+/g, '\\s+');

// "a|b|c", longest first so that "end note" wins over "end".
const alternation = (words) =>
  [...new Set(words)]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))
    .map(escapeRegex)
    .join('|');

const ci = (pattern) => `(?i)${pattern}`;

// A block that is not closed must not go beyond the end of the diagram: it also stops before @endXXX.
const orDiagramEnd = (pattern) => `${pattern}|(?=^\\s*@end[a-z0-9]+)`;

// Words that cannot start a statement: they are only colored after a statement keyword
// (for example "left" in "note left of A"). The list of PlantUML has no position information, so
// this is a heuristic written by hand.
const INLINE_ONLY = new Set(
  `across address again also area at attribute attributes bar bold bottom center circled circles color
   dashed description dotted down empty false field fields grid is italic left line link member members
   method methods normal not null of on order orientation over page plain right rotate shape spacing
   stereotypes then ticks together top true up`.split(/\s+/)
);

// ---------------------------------------------------------------------------------------------
// Building blocks shared by several families
// ---------------------------------------------------------------------------------------------

function buildRepository(lists) {
  const types = lists.type.words;
  const keywords = lists.keyword.words.filter((w) => !w.startsWith('@'));
  const statementKeywords = keywords.filter((w) => !INLINE_ONLY.has(w));
  const colors = lists.color.words;
  const directives = lists.preprocessor.words;
  const skinparams = lists.skinparameter.words;

  const ARROW_HEAD = '[<ox*+#!/\\\\|^]';
  const ARROW_TAIL = '[>ox*+#!/\\\\|^]';
  // The direction can be written in full (-up->) or with one letter (-u->, -r->).
  const CORE = '[-.=](?:[-.=]|\\[[^\\]\\n]*\\]|(?:up|down|left|right|[udlr])(?=[-.=]))*';
  const ARROW =
    `(?:(?<![\\w])${ARROW_HEAD}{1,2}${CORE}${ARROW_TAIL}{0,2}` +
    `|${CORE}(?:[>*+#!/\\\\|^]{1,2}[ox]?|[ox](?![\\w]))` +
    `|[-.](?:[-.]|\\[[^\\]\\n]*\\])+)`;

  const colorPattern = ci(
    `(#)(?:${alternation(colors)}|[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\\b`
  );

  const NAME = '[A-Za-z_][\\w.$]*';
  const QUOTED = '"(?:[^"\\\\\\n]|\\\\.)*"';

  // What can appear in the rest of a line that started with a keyword or a type.
  const inlinePatterns = [
    { include: '#string' },
    { include: '#color' },
    { include: '#stereotype' },
    { include: '#generic' },
    { include: '#label' },
    { include: '#parenthesis' },
    { match: ci(`\\b(${alternation(keywords)})\\b`), name: SCOPES.keyword },
    { include: '#variable' },
  ];

  return {
    // ----- comments, strings, colors -----
    comment: {
      patterns: [
        { name: SCOPES.commentLine, match: "^\\s*'.*$" },
        { name: SCOPES.commentBlock, begin: "/'", end: orDiagramEnd("'/") },
      ],
    },
    string: { name: SCOPES.string, match: '"(?:[^"\\\\\\n]|\\\\.)*"' },
    color: { name: SCOPES.color, match: colorPattern },
    stereotype: { name: SCOPES.stereotype, match: '<<[^>\\n]*>>' },
    generic: {
      comment: 'Map<K,V>: the type parameters (not << >>, which is a stereotype)',
      match: '(?<!<)(<)(?!<)([^<>\\n]*)(>)(?!>)',
      captures: { 2: { patterns: [{ name: SCOPES.dataType, match: '[A-Za-z_][\\w.]*' }] } },
    },
    qualifier: {
      comment: '[customerId: long] before an arrow: the name of the key, then its type',
      patterns: [
        { name: SCOPES.property, match: '[A-Za-z_][\\w.]*(?=\\s*:)' },
        { match: '(?<=:)\\s*([A-Za-z_][\\w.]*)', captures: { 1: { name: SCOPES.dataType } } },
        { name: SCOPES.property, match: '[A-Za-z_][\\w.]*' },
      ],
    },
    label: {
      comment: 'text after the colon of a message, a note or a relation',
      match: '(:)(?!:)(.*)$',
      captures: { 1: { name: SCOPES.operator }, 2: { name: SCOPES.label } },
    },
    parenthesis: { name: SCOPES.label, match: '\\([^)\\n]*\\)' },
    variable: {
      patterns: [
        { name: SCOPES.builtin, match: '%[a-z_][a-z0-9_]*(?=\\s*\\()' },
        { name: 'variable.other.wsd', match: '\\$[A-Za-z_][\\w]*' },
      ],
    },

    // ----- preprocessor -----
    preprocessor: {
      begin: ci(`^\\s*(${alternation(directives)})\\b`),
      beginCaptures: { 1: { name: SCOPES.preprocessor } },
      end: '$',
      patterns: [{ include: '#string' }, { include: '#variable' }],
    },

    // ----- skin parameters (known names only) -----
    skinparamName: { name: SCOPES.skinparam, match: ci(`\\b(?:${alternation(skinparams)})\\b`) },
    skinparamValue: {
      patterns: [
        { include: '#string' },
        { include: '#color' },
        { name: SCOPES.number, match: '\\b\\d+(?:\\.\\d+)?\\b' },
      ],
    },
    skinparam: {
      patterns: [
        {
          comment: 'skinparam sequence {  ...  }',
          begin: ci('^\\s*(skinparam)\\b(?:\\s+(\\w+))?\\s*(\\{)\\s*$'),
          beginCaptures: {
            1: { name: SCOPES.keyword },
            2: { name: SCOPES.skinparam },
            3: { name: SCOPES.operator },
          },
          end: orDiagramEnd('^\\s*(\\})'),
          endCaptures: { 1: { name: SCOPES.operator } },
          patterns: [
            { include: '#comment' },
            { include: '#skinparamName' },
            { include: '#skinparamValue' },
          ],
        },
        {
          comment: 'skinparam name value',
          begin: ci('^\\s*(skinparam)\\b'),
          beginCaptures: { 1: { name: SCOPES.keyword } },
          end: '$',
          patterns: [{ include: '#skinparamName' }, { include: '#skinparamValue' }],
        },
      ],
    },
    style: {
      comment: '<style> ... </style> is CSS',
      begin: ci('^\\s*(<style>)'),
      beginCaptures: { 1: { name: SCOPES.keyword } },
      end: ci(orDiagramEnd('(</style>)')),
      endCaptures: { 1: { name: SCOPES.keyword } },
      patterns: [{ include: 'source.css' }],
    },

    // ----- titles and notes: the text is not code -----
    title: {
      patterns: [
        {
          comment: 'title My title',
          match: ci('^\\s*(title|header|footer|caption)\\b\\s*(\\S.*)$'),
          captures: { 1: { name: SCOPES.keyword }, 2: { name: SCOPES.title } },
        },
        {
          comment: 'title ... end title',
          begin: ci('^\\s*(title|header|footer|caption)\\s*$'),
          beginCaptures: { 1: { name: SCOPES.keyword } },
          end: ci(orDiagramEnd('^\\s*(end\\s*(?:title|header|footer|caption))\\b')),
          endCaptures: { 1: { name: SCOPES.keyword } },
          contentName: SCOPES.title,
        },
        {
          comment: 'legend ... end legend',
          begin: ci('^\\s*(legend)\\b(.*)$'),
          beginCaptures: { 1: { name: SCOPES.keyword }, 2: { patterns: inlinePatterns } },
          end: ci(orDiagramEnd('^\\s*(end\\s*legend)\\b')),
          endCaptures: { 1: { name: SCOPES.keyword } },
          contentName: SCOPES.note,
        },
        {
          comment: 'note left of A  ...  end note (no colon on the first line)',
          begin: ci('^\\s*((?:[rh]?note|floating\\s+note))\\b((?![^:\\n]*:).*)$'),
          beginCaptures: { 1: { name: SCOPES.keyword }, 2: { patterns: inlinePatterns } },
          end: ci(orDiagramEnd('^\\s*(end\\s*[rh]?note)\\b')),
          endCaptures: { 1: { name: SCOPES.keyword } },
          contentName: SCOPES.note,
        },
      ],
    },

    // ----- keywords and types at the start of a statement -----
    statement: {
      patterns: [
        {
          comment: 'element declaration: the type word, then the name of the element',
          // "abstract class Foo": a modifier can come before the type word.
          begin: ci(`^\\s*(?:(abstract|static|compact)\\s+)?(${alternation(types)})\\b`),
          beginCaptures: { 1: { name: SCOPES.type }, 2: { name: SCOPES.type } },
          end: '$',
          patterns: [
            { match: '\\G\\s*([\\w.$]+)', captures: { 1: { name: SCOPES.elementName } } },
            ...inlinePatterns,
          ],
        },
        {
          comment: 'keyword at the start of a statement',
          begin: ci(`^\\s*(${alternation(statementKeywords)})\\b`),
          beginCaptures: { 1: { name: SCOPES.keyword } },
          end: '$',
          patterns: inlinePatterns,
        },
      ],
    },

    // ----- sequence, class, ... : arrows and their label -----
    relation: {
      comment:
        'A -> B, or A [key: type] "1" -> "n" B: the elements on each side of the arrow get the color of element names',
      begin: `^\\s*(${QUOTED}|${NAME})(?:\\s*(\\[[^\\]\\n]*\\]))?(?:\\s*(${QUOTED}))?\\s*(${ARROW})`,
      beginCaptures: {
        1: {
          patterns: [
            { name: SCOPES.string, match: QUOTED },
            { name: SCOPES.elementName, match: NAME },
          ],
        },
        2: { patterns: [{ include: '#qualifier' }] },
        3: { name: SCOPES.string },
        4: { name: SCOPES.arrow },
      },
      end: '$',
      patterns: [
        {
          comment: 'the element after the arrow, with an optional multiplicity before it',
          match: `\\G\\s*(${QUOTED})?\\s*(${NAME})`,
          captures: { 1: { name: SCOPES.string }, 2: { name: SCOPES.elementName } },
        },
        { include: '#label' },
        { include: '#string' },
        { include: '#color' },
        { include: '#stereotype' },
      ],
    },
    arrow: {
      begin: ARROW,
      beginCaptures: { 0: { name: SCOPES.arrow } },
      end: '$',
      patterns: [
        { include: '#label' },
        { include: '#string' },
        { include: '#color' },
        { include: '#stereotype' },
      ],
    },
    separator: {
      comment: '== title ==',
      match: '^\\s*(==)\\s*(.*?)\\s*(==)\\s*$',
      captures: {
        1: { name: SCOPES.operator },
        2: { name: SCOPES.title },
        3: { name: SCOPES.operator },
      },
    },
    action: {
      comment: 'activity diagram: :action;',
      begin: '^\\s*(:)',
      beginCaptures: { 1: { name: SCOPES.operator } },
      end: '(;)\\s*$|(?=^\\s*@end\\w+)',
      endCaptures: { 1: { name: SCOPES.operator } },
      contentName: SCOPES.label,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The families of diagrams
// ---------------------------------------------------------------------------------------------

const shared = [{ include: '#comment' }, { include: '#style' }, { include: '#skinparam' }, { include: '#preprocessor' }];

// The families. `names` are the words after @start. `patterns` are the rules of the body.
function buildFamilies() {
  return [
    {
      id: 'json',
      names: ['json'],
      patterns: [{ include: 'source.json' }],
    },
    {
      id: 'yaml',
      names: ['yaml'],
      patterns: [{ include: 'source.yaml' }],
    },
    {
      id: 'math',
      names: ['math', 'latex'],
      patterns: [{ include: 'text.tex.latex' }],
    },
    {
      id: 'ditaa',
      names: ['ditaa', 'dot'],
      comment: 'ASCII art or another language (DOT): not colored yet',
      patterns: [],
    },
    {
      id: 'tree',
      names: ['mindmap', 'wbs'],
      patterns: [
        ...shared,
        {
          comment: '* root, ** child, + right side, - left side, *[#color]_ boxless',
          match: '^\\s*([*+\\-]+)(\\[[^\\]\\n]*\\])?(_)?(<)?',
          captures: {
            1: { name: SCOPES.level },
            2: { name: SCOPES.color },
            3: { name: SCOPES.operator },
            4: { name: SCOPES.operator },
          },
        },
        { include: '#title' },
        { include: '#statement' },
        { include: '#color' },
        { include: '#stereotype' },
      ],
    },
    {
      id: 'gantt',
      names: ['gantt', 'project'],
      patterns: [
        ...shared,
        { include: '#title' },
        { name: SCOPES.task, match: '\\[[^\\]\\n]+\\]' },
        { name: SCOPES.number, match: '\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d+(?:\\.\\d+)?%?' },
        {
          name: SCOPES.keyword,
          match: ci(
            '\\b(?:project\\s+starts|starts|ends|lasts|happens|requires|completed|complete|is\\s+colored\\s+in|are\\s+colored\\s+in|is\\s+closed|are\\s+closed|is\\s+open|is\\s+deleted|displays\\s+on\\s+same\\s+row\\s+as|and|then|on|at|with|today|days?|weeks?|months?|saturday|sunday|monday|tuesday|wednesday|thursday|friday|as|after|before|to|from)\\b'
          ),
        },
        { include: '#statement' },
        { include: '#string' },
        { include: '#color' },
        { name: SCOPES.operator, match: '->|\\{|\\}' },
      ],
    },
    {
      id: 'salt',
      names: ['salt'],
      patterns: [
        ...shared,
        { name: SCOPES.operator, match: '\\{[#+!\\-/*TSI^]*|\\}|\\|' },
        { name: SCOPES.stereotype, match: '\\[[^\\]\\n]*\\]|\\([^)\\n]*\\)|\\^[^^\\n]*\\^' },
        { include: '#string' },
        { include: '#color' },
        { name: SCOPES.operator, match: '^\\s*(?:\\.\\.|==|~~|--)' },
      ],
    },
    {
      id: 'network',
      names: ['nwdiag', 'packetdiag'],
      patterns: [
        { name: SCOPES.commentLine, match: '^\\s*(?:#|//).*$' },
        ...shared.slice(1),
        { match: '([\\w.-]+)\\s*(=)', captures: { 1: { name: SCOPES.property }, 2: { name: SCOPES.operator } } },
        { match: '(\\d+)\\s*(-)\\s*(\\d+)', captures: { 1: { name: SCOPES.number }, 3: { name: SCOPES.number } } },
        { name: SCOPES.number, match: '\\b\\d+\\b' },
        { include: '#string' },
        { include: '#color' },
        { name: SCOPES.operator, match: '[{}\\[\\]:;,]|--|->' },
      ],
    },
  ];
}

// The body used by @startuml and by all the diagrams without their own family.
function umlBody() {
  return [
    { include: '#comment' },
    { include: '#style' },
    { include: '#skinparam' },
    { include: '#preprocessor' },
    { include: '#title' },
    { include: '#separator' },
    { include: '#action' },
    // Before #statement: "Map <|.. HashMap" is a relation, not the declaration of a map.
    { include: '#relation' },
    { include: '#statement' },
    { include: '#arrow' },
    { include: '#string' },
    { include: '#color' },
    { include: '#stereotype' },
    { include: '#variable' },
  ];
}

// ---------------------------------------------------------------------------------------------

export function buildGrammar() {
  const lists = parseKeywordList();
  const repository = buildRepository(lists);

  const families = buildFamilies();
  const familyNames = new Set(families.flatMap((f) => f.names));
  const blockRules = [];

  for (const family of families) {
    repository[`family-${family.id}`] = { patterns: family.patterns };
    blockRules.push({
      comment: `@start${family.names.join('/')}`,
      name: `meta.diagram.${family.id}.wsd`,
      begin: ci(`^\\s*(@start(?:${alternation(family.names)}))\\b[ \\t]*(.*?)\\s*$`),
      beginCaptures: { 1: { name: SCOPES.diagram }, 2: { name: SCOPES.diagramName } },
      end: ci('^\\s*(@end[a-z0-9]+)\\b.*$'),
      endCaptures: { 1: { name: SCOPES.diagram } },
      patterns: [{ include: `#family-${family.id}` }],
    });
  }

  repository.uml = { patterns: umlBody() };
  // @startuml and every other @startxxx: the general rules.
  blockRules.push({
    comment: '@startuml and the diagrams without their own family',
    name: 'meta.diagram.uml.wsd',
    begin: ci('^\\s*(@start[a-z0-9]+)\\b[ \\t]*(.*?)\\s*$'),
    beginCaptures: { 1: { name: SCOPES.diagram }, 2: { name: SCOPES.diagramName } },
    end: ci('^\\s*(@end[a-z0-9]+)\\b.*$'),
    endCaptures: { 1: { name: SCOPES.diagram } },
    patterns: [{ include: '#uml' }],
  });

  return {
    name: 'PlantUML (hybrid prototype)',
    scopeName: 'source.wsd',
    fileTypes: ['wsd', 'iuml', 'pu', 'puml', 'plantuml'],
    comment:
      'Generated by tools/generate-grammar.mjs from data/list-keywords.txt. Do not edit by hand.',
    patterns: [...blockRules, { include: '#uml' }],
    repository,
    // For the report of the generator.
    _families: [...familyNames],
  };
}

function render() {
  const { _families, ...grammar } = buildGrammar();
  return JSON.stringify(grammar, null, 2) + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const content = render();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(hybridGrammarFile) ? fs.readFileSync(hybridGrammarFile, 'utf8') : '';
    if (current !== content) {
      console.error('The hybrid grammar is out of date: run "npm run grammar" and commit the result.');
      process.exit(1);
    }
    console.log('OK: the hybrid grammar is up to date.');
  } else {
    fs.writeFileSync(hybridGrammarFile, content);
    console.log(`wrote ${path.relative(root, hybridGrammarFile)} (${(content.length / 1024).toFixed(0)} KB)`);
  }
}
