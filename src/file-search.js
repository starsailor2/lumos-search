const { Worker } = require('worker_threads');
const path = require('path');

class FileSearch {
  // shortcut: main keeps path metadata for legacy providers; migrate those if measured memory use requires it.
  constructor() {
    this.worker = new Worker(path.join(__dirname, 'file-search-worker.js'));
    this.pending = new Map();
    this.nextId = 0;
    this.error = null;
    const fail = (error) => {
      this.error = error;
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    };
    this.worker.on('error', fail);
    this.worker.on('exit', () => fail(new Error('File search worker stopped.')));
    this.worker.on('message', (message) => {
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error));
      else request.resolve(message.results);
    });
  }
  send(message) { if (!this.error) this.worker.postMessage(message); }
  begin() { this.send({ type: 'begin' }); }
  add(items, staging = false) { if (items.length) this.send({ type: 'add', items, staging }); }
  commit() { this.send({ type: 'commit' }); }
  removeRoots(roots, unreadable) { this.send({ type: 'remove', roots, unreadable }); }
  setUsage(usage) { this.send({ type: 'usage', usage }); }
  search(ctx) {
    if (this.error) return Promise.reject(this.error);
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ type: 'search', id, q: ctx.q, qLower: ctx.qLower, scope: ctx.scope,
        config: { maxResults: ctx.config.maxResults, skipDirs: ctx.config.skipDirs }, learnedIntent: ctx.learnedIntent });
    });
  }
  close() { return this.worker.terminate(); }
}

module.exports = { FileSearch };
