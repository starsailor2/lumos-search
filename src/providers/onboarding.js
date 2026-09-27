// Onboarding — first-run setup hints.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function onboardingPath() {
  return path.join(app.getPath('userData'), 'onboarding.json');
}

function isFirstRun() {
  try {
    return !fs.existsSync(onboardingPath());
  } catch {
    return true;
  }
}

function completeOnboarding() {
  try {
    fs.writeFileSync(onboardingPath(), JSON.stringify({ completed: true, at: Date.now() }), 'utf8');
  } catch { /* non-fatal */ }
}

function search(ctx) {
  if (!isFirstRun() || ctx.q) return [];
  return [{
    type: 'command',
    id: 'onboard:welcome',
    title: 'Welcome to Lumos Search!',
    subtitle: 'Press Alt+, to open anytime · Type @clip, @emoji, @system for modes',
    score: 999,
    icon: '✨',
    actions: ['open-settings'],
    data: { onboarding: true },
  }];
}

module.exports = { search, isFirstRun, completeOnboarding };
