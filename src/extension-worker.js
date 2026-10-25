const { parentPort, workerData } = require('worker_threads');
const vm = require('vm');

const sandbox = vm.createContext({}, { codeGeneration: { strings: false, wasm: false }, microtaskMode: 'afterEvaluate' });
vm.runInContext('var module = { exports: {} }; var exports = module.exports;', sandbox);
vm.runInContext(workerData.code, sandbox, { filename: workerData.filename, timeout: 1000 });
const search = new vm.Script('JSON.stringify(module.exports.search(JSON.parse(input)))');

parentPort.on('message', ({ id, input }) => {
  try {
    sandbox.input = input;
    const output = search.runInContext(sandbox, { timeout: 100 });
    if (typeof output !== 'string' || output.length > 1_000_000) throw new Error('Extension result is too large or invalid.');
    const results = JSON.parse(output);
    parentPort.postMessage({ id, results: Array.isArray(results) ? results.slice(0, 200) : [] });
  } catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
