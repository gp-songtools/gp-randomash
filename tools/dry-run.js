#!/usr/bin/env node
/* Print Surprise me prompts without calling any API.
   Usage: node tools/dry-run.js [count] [seed]
   Each mix gets the primary genre's default tempo; mood, energy, key feel and arrangement
   are varied too so the list shows the template's range. */
const path = require('path');
const Mix = require(path.join(__dirname, '..', 'mix.js'));
const IDX = Mix.index(require(path.join(__dirname, '..', 'genres.json')));

const count = +process.argv[2] || 5;
const seed = process.argv[3] != null ? +process.argv[3] : Date.now() % 1e9;
const rand = Mix.rng(seed);
const pick = xs => xs[Math.floor(rand() * xs.length)];

console.log(`Dry run · ${count} Surprise me mixes · rng seed ${seed}\n`);
for (let i = 0; i < count; i++) {
  const genres = Mix.surprise(IDX, rand);
  const gs = genres.map(id => IDX.byId[id]);
  const s = {
    genres, tempo: Mix.defaultTempo(gs[0]), energy: Math.round(rand() * 100),
    mood: pick(Mix.MOODS), key: pick(Object.keys(Mix.KEY_FEELS)), arrangement: pick(Object.keys(Mix.ARRANGEMENTS))
  };
  console.log(`${i + 1}. [${gs.map(g => g.name).join(' + ')}]  clash ${Mix.mixClash(gs).toFixed(2)}`);
  console.log('   ' + Mix.composePrompt(IDX, s) + '\n');
}
