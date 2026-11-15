// Builds public/words.js from the word lists in tools/:
//   answers.txt  the words a game can be about (one per line), shuffled here once with a fixed seed so the daily
//                order isn't alphabetical; a rebuild keeps the order already out and adds new words after it
//   guesses.txt  the other words a guess may be
// node tools/build-words.mjs
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const read = (f) => [...new Set(fs.readFileSync(path.join(here, f), 'utf8').split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter(Boolean))];
const answers = read('answers.txt'), guesses = read('guesses.txt');
for (const w of [...answers, ...guesses]) if (!/^[a-z]{5}$/.test(w)) throw new Error(`not five letters a-z: ${w}`);

let seed = 0x15c0ffee; // mulberry32
const next = () => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };
// the order already out stays (minus words taken out), so today's word doesn't change; new words go after it, shuffled
const out = path.join(here, '..', 'public', 'words.js');
const before = fs.existsSync(out) ? (/answers: '([a-z ]*)'/.exec(fs.readFileSync(out, 'utf8'))?.[1] || '').split(' ').filter(Boolean) : [];
const wanted = new Set(answers), kept = before.filter((w) => wanted.has(w)), keptSet = new Set(kept);
const fresh = answers.filter((w) => !keptSet.has(w)).sort();
for (let i = fresh.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [fresh[i], fresh[j]] = [fresh[j], fresh[i]]; }
const order = [...kept, ...fresh];
const inAnswers = new Set(order), extra = guesses.filter((w) => !inAnswers.has(w)).sort();

fs.writeFileSync(out,
  `// made by tools/build-words.mjs: ${order.length} answers (in daily order), ${extra.length} more words a guess may be\n` +
  `const WORDS = {\n  answers: '${order.join(' ')}',\n  guesses: '${extra.join(' ')}',\n};\n`);
console.log(`${order.length} answers, ${extra.length} more guesses`);
