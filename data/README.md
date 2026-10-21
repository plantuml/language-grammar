# data

## `list-keywords.txt`

The keywords of PlantUML, as printed by PlantUML itself. It is the raw output of

```
java -jar plantuml.jar --list-keywords
```

(formerly `-language`), generated from a build of the `master` branch of [plantuml/plantuml](https://github.com/plantuml/plantuml). To update it, run the command again and replace the file.

The file is made of sections. A section starts with its name and its number of words, each on a line starting with `;`, followed by one word per line. The file ends with `;EOF`.

| Section | Content |
| --- | --- |
| `type` | Words that declare an element (`actor`, `participant`, `class`, `database`, ...). |
| `keyword` | The `@startxxx` / `@endxxx` block markers and the other keywords (`activate`, `alt`, `as`, `box`, ...). |
| `preprocessor` | The preprocessor directives (`!include`, `!define`, `!function`, ...). |
| `skinparameter` | The names of the skin parameters (`ActivityBackgroundColor`, ...). |
| `color` | The names of the colors (`AliceBlue`, `AntiqueWhite`, ...). |

The lists are flat: they do not say where a word is valid, nor in which kind of diagram. The tool `tools/coverage.mjs` uses them to measure how many of these words the grammar recognizes.
