# language-grammar

Syntax definitions for the PlantUML language, designed for syntax highlighting, parsing, validation, and editor integration.

[![Highlighting gallery](https://img.shields.io/badge/Highlighting_gallery-open_it-2ea44f?style=for-the-badge&logo=github&logoColor=white)](https://plantuml.github.io/language-grammar/)

[![Test](https://github.com/plantuml/language-grammar/actions/workflows/test.yml/badge.svg)](https://github.com/plantuml/language-grammar/actions/workflows/test.yml)
[![Pages](https://github.com/plantuml/language-grammar/actions/workflows/pages.yml/badge.svg)](https://github.com/plantuml/language-grammar/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**See how PlantUML code is highlighted, live: <https://plantuml.github.io/language-grammar/>**

## What we are trying to do

When a `.puml` file is displayed on GitHub, its colors come from a **TextMate grammar** declared in [GitHub Linguist](https://github.com/github-linguist/linguist). Today, Linguist takes this grammar from a third-party project, [vscode-plantuml](https://github.com/qjebbs/vscode-plantuml), at a fixed commit (see the [vendor README](https://github.com/github-linguist/linguist/blob/main/vendor/README.md)).

The goal of this repository is to **become the official source of the PlantUML syntax used by GitHub Linguist**, by starting from the excellent work of vscode-plantuml and improving it step by step, with tests that show what the result looks like.

In the longer term, the same repository could maintain the syntax definitions for other tools and platforms:

- **Visual Studio Code**: improved syntax highlighting and parsing extensions.
- **JetBrains IDEs**: syntax support for IntelliJ IDEA, PyCharm, etc.
- **TextMate/Atom**: legacy syntax definitions for these editors.
- **Tree-sitter**: modern syntax parsing in tools like Neovim.
- **Sublime Text**: updated syntax highlighting packages.
- **ACE Editor**: syntax highlighting for this lightweight, embeddable code editor.
- **Online editors**: such as GitPod or web-based IDEs.
- **Language servers (LSP)**: advanced features like autocompletion and diagnostics.

## Where we are

The grammar in `syntaxes/` is, for now, an unmodified copy of the one used by GitHub Linguist today (vscode-plantuml at commit `7bc1758`). What has been built first is the **test and preview infrastructure**, so that every future change to the grammar can be seen and checked:

- a first sample, a sequence diagram "Hello World";
- a snapshot of the TextMate scopes of every token;
- a rendering of every sample in the GitHub light and dark themes;
- a public gallery, rebuilt on every push;
- a **hybrid grammar prototype** (see below), tested and shown next to the current one.

## Technical choices

### The deliverable is a TextMate grammar

GitHub Linguist highlights code with TextMate grammars, so this is what must be produced first. The scope name stays `source.wsd`, as in the current grammar. The starting point is the vscode-plantuml grammar (MIT license, credited below), which already covers many diagram types with line-oriented regular expressions.

### Small steps

We work one diagram, one sample at a time: add a sample, look at how it is highlighted, improve the grammar, check that nothing else changed. We start with a sequence diagram.

### We cannot test on GitHub itself

GitHub colors the files of a repository with the grammar declared in Linguist, not with the one of the repository being viewed. A new grammar is therefore not visible on GitHub before it is accepted into Linguist. To see its effect earlier, we reproduce what GitHub does:

- **[Shiki](https://shiki.style)** loads a TextMate grammar with the same regular expression engine (Oniguruma) as TextMate, and applies the GitHub themes (`github-light-default`, `github-dark-default`).
- The result is very close to what GitHub displays, but **it is not guaranteed to be identical**: GitHub uses its own renderer. The final check can only be done once the grammar is in Linguist.

Rouge, a Ruby highlighter, was considered and dropped: its lexers are written in Ruby and it cannot load TextMate grammars, so it would not test what GitHub uses.

### Three kinds of checks

For each sample in `tests/samples/`:

1. **Scope snapshot** (`tests/scopes/`): the TextMate scopes given to every token. A change in the grammar that modifies the scopes of any sample is detected. This is done for both grammars.
2. **SVG rendering** (`tests/render/`): the highlighted code in the GitHub light and dark themes, displayed directly by GitHub in this repository.
3. **Gallery** (GitHub Pages): all the samples on one page, with a theme switch and the scopes shown when hovering a token.

A GitHub Action fails if the committed files differ from what the grammar produces.

### The Markdown injection grammar

A TextMate grammar describes one language. To color a PlantUML block inside a Markdown file, the Markdown grammar must be told to use it. An *injection grammar* does this: it plugs another grammar into a given zone of a host grammar. `syntaxes/codeblock.json` (scope `markdown.plantuml.codeblock`) says "inside a code block whose language is `plantuml`, apply the PlantUML grammar".

It is kept because the current Linguist entry lists both scopes, and it is tested with a Markdown sample. Whether GitHub itself uses it, or resolves the `plantuml` fence directly to the language through Linguist, is not known.

### The hybrid grammar (prototype)

`syntaxes/plantuml-hybrid.tmLanguage.json` is a second grammar, **generated** by `tools/generate-grammar.mjs`. It does not replace the current one yet: both are tested on the same samples and shown side by side in the gallery (the *Grammar* link at the top of each page switches from one to the other).

- **The words come from PlantUML itself.** The types, keywords, directives, skin parameters and colors are read from `data/list-keywords.txt`, so a new word of PlantUML only needs a new export of that file. Only the known skin parameter names are colored, not any word.
- **The grammar starts with the `@startXXX` line**, because the language that follows depends on it. `@startjson` and `@startyaml` are handed to the JSON and YAML grammars, `@startmindmap`/`@startwbs`, `@startgantt`, `@startsalt` and `@startnwdiag`/`@startpacketdiag` have their own rules, and `@startuml` (and any other `@startxxx`) gets the general rules. A `<style>` block is handed to the CSS grammar.
- **One scope per type of word**, so that a theme can give them different colors: `storage.type.element.wsd` for `class`/`actor`/`participant`, `keyword.control.wsd` for `alt`/`note`/`skinparam`, `entity.name.function.preprocessor.wsd` for `!include`, `variable.parameter.skinparam.wsd` for skin parameters, `constant.other.color.wsd` for colors, and so on. The GitHub themes only have a handful of colors, so some types share one: types and keywords are both red, for example.
- **The text of messages, notes, titles and legends is not code**: it is not colored as keywords. A block that is never closed stops at the end of the diagram.

Limits of the prototype:

- `data/list-keywords.txt` is a flat list: it does not say which words belong to which diagram. The words that are only valid inside a statement (such as `left` in `note left of A`) are listed by hand in the generator (`INLINE_ONLY`), and the rules of each family (mind map, Gantt, salt, ...) are written by hand. A list of the words of each diagram would need to come from PlantUML itself.
- `@startuml` contains many kinds of diagrams (sequence, class, activity, state, ...) that PlantUML recognizes from the content: the general rules are a union of them.
- `@startdot` and `@startditaa` are not colored yet (the DOT grammar is not available in the test tool).

### `puml.ebnf` is an experiment

`puml.ebnf` is a formal grammar in the Lark dialect (an extended EBNF that can be run, which makes it easy to try). It is **not used for highlighting** and it only covers a subset of the language (component diagrams). The syntax of PlantUML is line-oriented and depends on the diagram type, and its actual definition is in regular expressions in the Java code of PlantUML, so a complete formal grammar is hard to write. It stays a reference experiment and does not block the work on Linguist.

### Out of scope for now

- Snippets and the preview templates of vscode-plantuml (specific to VS Code).
- The other targets listed above (tree-sitter, JetBrains, LSP, ...).

## Repository layout

| Path | Content |
| --- | --- |
| `syntaxes/` | The TextMate grammar (`source.wsd`) and the Markdown injection grammar (`codeblock.json`), taken from [vscode-plantuml](https://github.com/qjebbs/vscode-plantuml) (MIT), and the generated hybrid prototype (`plantuml-hybrid.tmLanguage.json`). |
| `tests/samples/` | Hand-picked PlantUML samples used to test the grammar, with an optional `<name>.description.txt` explaining what each one tests. Each one has a scope snapshot and SVG renders. |
| `tests/vega/` | The Vega corpus: the non-regression tests of PlantUML, copied from the PlantUML repository (514 `.puml` files in folders). Shown in the gallery, without snapshots for now. The YAML header that most files have before `@startuml` is a test setting, not PlantUML code: it is ignored. |
| `tests/scopes/` | For each sample, the TextMate scopes of every token (snapshots). `<name>.txt` for the current grammar, `<name>.hybrid.txt` for the prototype. |
| `tests/render/` | For each sample, the highlighted result as SVG, in the GitHub light and dark themes (`<name>.hybrid.*.svg` for the prototype). |
| `data/` | Reference data from PlantUML itself: `list-keywords.txt`, the output of `plantuml.jar --list-keywords` (see `data/README.md`). |
| `tools/` | Node.js scripts that generate and check the files above and build the gallery. |
| `.github/workflows/` | `test.yml` (checks) and `pages.yml` (gallery). |
| `puml.ebnf` | Experimental reference grammar (Lark dialect), not used for highlighting. |

## Which files really configure the highlighting

Only two files define how PlantUML code is colored. `tools/common.mjs` loads them (`grammarFile` and `injectionFile`) and passes them to Shiki.

**Files that are used for highlighting**

| File | Role |
| --- | --- |
| `syntaxes/plantuml.yaml-tmLanguage` | The main TextMate grammar (scope `source.wsd`). It is the only file that says how PlantUML tokens are scoped, and therefore colored. |
| `syntaxes/codeblock.json` | The injection grammar (scope `markdown.plantuml.codeblock`): it applies `source.wsd` inside the `plantuml` fenced blocks of Markdown files. |

The colors themselves do not come from a file of this repository: they come from the Shiki themes `github-light-default` and `github-dark-default`, set in `tools/common.mjs`.

**Files that are not used for highlighting**

| File | Why it is not used |
| --- | --- |
| `puml.ebnf` | Experimental formal grammar (Lark dialect), covering only a subset of the language. |
| `data/list-keywords.txt` | Output of `plantuml.jar --list-keywords`. Only `tools/coverage.mjs` reads it, for an informational coverage report that never fails the build. |
| `syntaxes/LICENSE.vscode-plantuml.txt` | License text of vscode-plantuml. |

**Files that are generated from the grammar**

`tests/scopes/` and `tests/render/` are produced by `npm run build` (`tools/render.mjs`), and `npm test` fails if they no longer match what the grammar produces. The gallery is built by `tools/site.mjs` from the `tests/` tree. The two workflows (`test.yml` and `pages.yml`) only run these scripts.

## Highlighting preview

The [gallery](https://plantuml.github.io/language-grammar/) follows the tree of the `tests/` folder: `tests/samples/...` is published as `samples/...` and `tests/vega/...` as `vega/...`, with one page per folder, a theme switch, and the TextMate scopes of every token on hover. Here are two of the hand-picked samples as pictures:

### `sequence-hello-world.puml`

```plantuml
@startuml
Alice -> Bob: Hello World
Bob --> Alice: Hi!
@enduml
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="tests/render/sequence-hello-world.dark.svg">
  <img alt="sequence-hello-world.puml highlighted with the PlantUML grammar" src="tests/render/sequence-hello-world.light.svg">
</picture>

### `markdown-plantuml-fence.md`

The same diagram inside a `plantuml` block of a Markdown file, which tests the injection grammar.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="tests/render/markdown-plantuml-fence.dark.svg">
  <img alt="markdown-plantuml-fence.md highlighted with the PlantUML grammar" src="tests/render/markdown-plantuml-fence.light.svg">
</picture>

## Working on the grammar

Requires Node.js 22 or later.

```
cd tools
npm ci
npm run build   # regenerate the hybrid grammar, tests/scopes and tests/render
npm test        # fail if the generated files are out of date
npm run site    # build the gallery in site/ (open site/index.html)
npm run coverage  # how many words of data/list-keywords.txt the grammar recognizes
npm run coverage -- --grammar=hybrid   # the same for the hybrid prototype
npm run grammar   # regenerate only the hybrid grammar
```

To add a test:

1. Put a `.puml` (or `.iuml`, `.plantuml`, `.md`) file in `tests/samples/`, and optionally a `<name>.description.txt` next to it.
2. Run `npm run build` and review the generated scopes and SVG files (for both grammars).
3. Commit them together with the sample.

## Continuous integration

- **Test** runs on every push and pull request. It fails if the hybrid grammar, `tests/scopes` or `tests/render` are out of date, and uploads the regenerated files as an artifact to help fixing it.
- The Test job summary also shows the **keyword coverage** of the grammar (information only, it never fails the build); the gallery home page shows it too.
- **Pages** runs on every push to `main`. It runs the same check, builds the gallery and publishes it with GitHub Pages. It requires *Settings > Pages > Build and deployment > Source* to be set to *GitHub Actions*.

## License

This project is licensed under the [MIT License](LICENSE).

The TextMate grammar in `syntaxes/` derives from [vscode-plantuml](https://github.com/qjebbs/vscode-plantuml), Copyright (c) 2016 jebbs, also under the MIT License (see `syntaxes/LICENSE.vscode-plantuml.txt`).
