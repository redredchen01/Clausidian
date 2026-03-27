const { Router } = require('express');
const { execSync } = require('child_process');
const { readTasks, taskExists, deleteTask } = require('../parsers/tasks');
const { AGENT_TASKS_PATH } = require('../config');
const fs = require('fs');

const router = Router();

router.get('/tasks', (req, res) => {
  try {
    const tasks = readTasks();
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tasks', (req, res) => {
  try {
    const { id, description, depends_on, assigned_to } = req.body;

    if (!id || !description) {
      return res.status(400).json({ error: 'id and description are required' });
    }

    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'id must be lowercase alphanumeric with hyphens' });
    }

    if (taskExists(id)) {
      return res.status(409).json({ error: `Task '${id}' already exists` });
    }

    if (!fs.existsSync(AGENT_TASKS_PATH)) {
      return res.status(500).json({ error: 'agent-tasks.sh not found. Run setup first.' });
    }

    const deps = (depends_on || []).join(' ');
    const cmd = `bash "${AGENT_TASKS_PATH}" add "${id}" "${description}" ${deps}`.trim();
    execSync(cmd, { timeout: 5000, stdio: 'pipe' });

    if (assigned_to) {
      const claimCmd = `bash "${AGENT_TASKS_PATH}" claim "${id}" "${assigned_to}"`;
      execSync(claimCmd, { timeout: 5000, stdio: 'pipe' });
    }

    const tasks = readTasks();
    const task = tasks.find(t => t.id === id);
    res.status(201).json({ task: task || null });
  } catch (err) {
    res.status(500).json({ error: `Failed to create task: ${err.message}` });
  }
});

router.patch('/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, assigned_to } = req.body;

    if (!taskExists(id)) {
      return res.status(404).json({ error: `Task '${id}' not found` });
    }

    if (!fs.existsSync(AGENT_TASKS_PATH)) {
      return res.status(500).json({ error: 'agent-tasks.sh not found. Run setup first.' });
    }

    if (status === 'completed') {
      const cmd = `bash "${AGENT_TASKS_PATH}" done "${id}"`;
      execSync(cmd, { timeout: 5000, stdio: 'pipe' });
    }

    if (assigned_to !== undefined) {
      const agent = assigned_to || 'unknown';
      const cmd = `bash "${AGENT_TASKS_PATH}" claim "${id}" "${agent}"`;
      execSync(cmd, { timeout: 5000, stdio: 'pipe' });
    }

    const tasks = readTasks();
    const task = tasks.find(t => t.id === id);
    res.json({ task: task || null });
  } catch (err) {
    res.status(500).json({ error: `Failed to update task: ${err.message}` });
  }
});

router.delete('/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = deleteTask(id);
    if (!deleted) {
      return res.status(404).json({ error: `Task '${id}' not found` });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `Failed to delete task: ${err.message}` });
  }
});

module.exports = router;
