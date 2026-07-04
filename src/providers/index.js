// Ordered list of search providers. Each exports search(ctx) -> Result[].
// Order matters: cheaper/higher-confidence providers run first so their
// results are available even if a later provider is slow to return.

module.exports = [
  require('./quickactions'),
  require('./files'),
  require('./clipboard'),
];
