// AI provider — Quick AI and AI Chat (BYOK). Phase 4 implementation.

const https = require('https');
const http = require('http');

function chatCompletion(config, messages) {
  return new Promise((resolve, reject) => {
    const ai = config.ai || {};
    if (!ai.apiKey || !ai.endpoint) {
      reject(new Error('AI not configured. Set API key in Settings.'));
      return;
    }
    const body = JSON.stringify({
      model: ai.model || 'gpt-4o-mini',
      messages,
      stream: false,
    });
    const url = new URL(ai.endpoint);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ai.apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.choices && parsed.choices[0] && parsed.choices[0].message
            ? parsed.choices[0].message.content
            : data);
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function search(ctx) {
  const { q, config } = ctx;
  const ai = config.ai || {};
  if (!ai.enabled) return [];

  const results = [];
  if (!q) {
    results.push({
      type: 'ai',
      id: 'ai:chat',
      title: 'Ask AI',
      subtitle: 'Quick AI — type a question and press Enter',
      score: 420,
      icon: '✨',
      actions: ['ai-chat'],
      data: {},
    });
    return results;
  }

  if (q.length >= 3) {
    results.push({
      type: 'ai',
      id: 'ai:ask:' + q.slice(0, 50),
      title: 'Ask AI: ' + q,
      subtitle: 'Quick AI',
      score: 1050,
      icon: '✨',
      actions: ['ai-ask'],
      data: { prompt: q },
    });
  }
  return results;
}

module.exports = { search, chatCompletion };
