// Workflows — user-defined multi-step command chains.

function search(ctx) {
  const { q, qLower, config } = ctx;
  const workflows = config.workflows || [];
  const results = [];
  for (const wf of workflows) {
    if (!wf || !wf.name) continue;
    let score = -1;
    if (!q) score = 280;
    else if (wf.name.toLowerCase().includes(qLower)) score = 550;
    else if ((wf.trigger || '').toLowerCase().startsWith(qLower)) score = 600;
    if (score < 0) continue;
    results.push({
      type: 'workflow',
      id: 'wf:' + wf.id,
      title: wf.name,
      subtitle: 'Workflow · ' + (wf.steps || []).length + ' steps',
      score,
      icon: '⚡',
      actions: ['run-workflow'],
      data: { workflowId: wf.id, steps: wf.steps },
    });
  }
  return results;
}

module.exports = { search };
