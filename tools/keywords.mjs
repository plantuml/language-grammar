// Reads data/list-keywords.txt (the output of plantuml.jar --list-keywords).

import fs from 'node:fs';
import path from 'node:path';
import { root } from './common.mjs';

export const keywordFile = path.join(root, 'data', 'list-keywords.txt');

// Reads the sections of the file: { type: { name, declared, words }, keyword: ..., ... }
export function parseKeywordList(file = keywordFile) {
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const sections = {};
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === ';EOF') break;
    if (line.startsWith(';') && /^;\d+$/.test(lines[i + 1] ?? '')) {
      current = { name: line.slice(1), declared: Number(lines[i + 1].slice(1)), words: [] };
      sections[current.name] = current;
      i++;
    } else if (current && line.trim() !== '') {
      current.words.push(line.trim());
    }
  }
  for (const s of Object.values(sections)) {
    if (s.declared !== s.words.length) {
      throw new Error(`Section "${s.name}" of the keyword file declares ${s.declared} words but has ${s.words.length}`);
    }
  }
  return sections;
}
