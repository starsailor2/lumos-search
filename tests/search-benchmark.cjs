const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const { search } = require('../src/providers/files');
const { FileSearch } = require('../src/file-search');

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
    const worker = new FileSearch();
    try {
      for (let at = 0; at < count; at += 4000) {
        worker.add(idx.paths.slice(at, at + 4000).map((p) => [p, 0]));
        if (at % 64000 === 0) await new Promise((resolve) => setImmediate(resolve));
      }
      const samples = [];
      let workerTicks = 0;
      const heartbeat = setInterval(() => workerTicks++, 5);
      try {
        for (let i = 0; i < 3; i++) {
          const workerStart = performance.now();
          const actual = await worker.search({ q: 'report 99999', qLower: 'report 99999', scope: null, config: { maxResults: 40, skipDirs: [] } });
          samples.push(Math.round(performance.now() - workerStart));
          assert.deepEqual(actual.map((r) => r.id), results.map((r) => r.id));
        }
      } finally { clearInterval(heartbeat); }
      assert(workerTicks > 0);
      console.log(JSON.stringify({ entries: count, workerQueryMilliseconds: samples, mainThreadHeartbeats: workerTicks,
        rssMB: Math.round(process.memoryUsage().rss / 1048576), note: 'First query includes queued index ingestion; RSS includes benchmark fixtures and both index copies.' }));
    } finally { await worker.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
