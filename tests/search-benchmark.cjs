const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const { search } = require('../src/providers/files');

(async () => {
  for (const count of [100000, 1000000]) {
    const idx = { paths: [], names: [], flags: [], parents: [], filtered: true, count };
    const parents = Array.from({ length: 1000 }, (_, i) => `c:\\documents\\client ${i}`);
    for (let i = 0; i < count; i++) {
      const name = `Quarterly Report ${i}.txt`;
      idx.paths.push(`C:\\Documents\\Client ${i % 1000}\\${name}`);
      idx.names.push(name.toLowerCase()); idx.flags.push(0);
      idx.parents.push(parents[i % 1000]);
    }
    let ticks = 0;
    const timer = setInterval(() => ticks++, 5);
    const started = performance.now();
    const results = await search({ idx, qLower: 'report 99999', config: { maxResults: 40 }, frecencyBoost: () => 0 });
    clearInterval(timer);
    assert(results.length <= 40); assert(results.some((r) => r.title === 'Quarterly Report 99999.txt')); assert(ticks > 0);
    console.log(JSON.stringify({ entries: count, milliseconds: Math.round(performance.now() - started), eventLoopTicks: ticks, returned: results.length }));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
