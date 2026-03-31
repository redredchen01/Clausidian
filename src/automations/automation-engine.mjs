/**
 * Automation Engine — YAML-based event-driven automation
 * Clausidian v3.5.0+
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, extname } from 'path';

/**
 * AutomationEngine — Execute workflows based on triggers and actions
 */
export class AutomationEngine {
  constructor(vault, eventBus, registry) {
    this.vault = vault;
    this.eventBus = eventBus;
    this.registry = registry;
    this.automations = new Map();
    this.execHistory = [];
    this.maxHistory = 50;
  }

  /**
   * Load automations from directory
   */
  async loadAutomations(automationDir) {
    const dir = automationDir || resolve(process.env.HOME || '/tmp', '.clausidian', 'automations');

    if (!existsSync(dir)) {
      return { loaded: [], failed: [], total: 0 };
    }

    const result = { loaded: [], failed: [], total: 0 };

    try {
      const files = readdirSync(dir);
      for (const file of files) {
        if (!['.yaml', '.yml', '.json'].includes(extname(file))) continue;

        const path = resolve(dir, file);
        try {
          const content = readFileSync(path, 'utf8');
          let automation;

          if (extname(file) === '.json') {
            automation = JSON.parse(content);
          } else {
            automation = this.#parseYaml(content);
          }

          if (!automation.name) {
            result.failed.push({ file, error: 'Missing name field' });
            continue;
          }

          this.#registerAutomation(automation);
          result.loaded.push(automation.name);
        } catch (err) {
          result.failed.push({ file, error: err.message });
        }
      }

      result.total = files.length;
      return result;
    } catch (err) {
      return { loaded: [], failed: [{ error: err.message }], total: 0 };
    }
  }

  /**
   * Register automation in memory
   */
  #registerAutomation(automation) {
    const normalized = {
      name: automation.name,
      description: automation.description || '',
      enabled: automation.enabled !== false,
      triggers: this.#normalizeTriggers(automation.triggers || []),
      actions: this.#normalizeActions(automation.actions || []),
      errorHandling: automation.error_handling || 'stop',
      retry: automation.retry || { max_attempts: 1 },
      createdAt: new Date().toISOString(),
    };

    this.automations.set(automation.name, normalized);

    // Register event triggers
    for (const trigger of normalized.triggers) {
      if (trigger.type === 'event') {
        const self = this;
        this.eventBus.subscribe(trigger.event, async (event, payload) => {
          await self.executeAutomation(automation.name, { event, payload });
        });
      }
    }
  }

  /**
   * Normalize triggers array
   */
  #normalizeTriggers(triggers) {
    return triggers.map(t => {
      if (typeof t === 'string') {
        if (t.startsWith('cron:')) {
          return { type: 'cron', cron: t.substring(5).trim() };
        }
        return { type: 'event', event: t };
      }
      return t;
    });
  }

  /**
   * Normalize actions array
   */
  #normalizeActions(actions) {
    return actions.map(a => {
      if (typeof a === 'string') {
        return { type: 'command', command: a };
      }
      return a;
    });
  }

  /**
   * Execute an automation by name
   */
  async executeAutomation(name, context = {}) {
    if (!this.automations.has(name)) {
      return { success: false, error: `Automation not found: ${name}` };
    }

    const automation = this.automations.get(name);
    if (!automation.enabled) {
      return { success: false, error: `Automation disabled: ${name}` };
    }

    const execution = {
      name,
      startedAt: new Date().toISOString(),
      actions: [],
      errors: [],
      success: true,
    };

    try {
      const actions = automation.actions;
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const actionResult = await this.#executeAction(action, context);

        execution.actions.push({
          index: i,
          name: action.name || action.type,
          success: actionResult.success,
          result: actionResult.result,
        });

        if (!actionResult.success) {
          execution.errors.push({
            action: action.name || action.type,
            error: actionResult.error,
          });

          if (automation.errorHandling === 'stop') {
            execution.success = false;
            break;
          }
        }
      }

      execution.completedAt = new Date().toISOString();

      // Emit completion event
      await this.eventBus.emit(`custom:automation-complete`, {
        automation: name,
        execution,
      });

      // Record history
      this.execHistory.push(execution);
      if (this.execHistory.length > this.maxHistory) {
        this.execHistory.shift();
      }

      return { success: execution.success, execution };
    } catch (err) {
      execution.success = false;
      execution.errors.push({ error: err.message });
      return { success: false, error: err.message, execution };
    }
  }

  /**
   * Execute a single action
   */
  async #executeAction(action, context) {
    try {
      switch (action.type) {
        case 'command': {
          const cmd = this.registry.getCommand(action.command);
          if (!cmd) {
            return { success: false, error: `Command not found: ${action.command}` };
          }
          const result = await this.registry.executeCommand(action.command, context);
          return result;
        }

        case 'emit-event': {
          const result = await this.eventBus.emit(action.event, action.payload || {});
          return { success: result.success, result };
        }

        case 'log': {
          console.log(`[Automation] ${action.message || ''}`);
          return { success: true };
        }

        default:
          return { success: false, error: `Unknown action type: ${action.type}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Simple YAML parser
   */
  #parseYaml(content) {
    const lines = content.split('\n');
    const obj = {};
    let currentKey = null;
    let currentArray = null;
    const stack = [obj];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) continue;

      const indent = line.match(/^\s*/)[0].length;
      const depth = Math.floor(indent / 2);

      if (trimmed.endsWith(':')) {
        const key = trimmed.slice(0, -1).trim();
        const parent = stack[depth] || obj;
        parent[key] = {};
        stack[depth + 1] = parent[key];
        currentKey = key;
      } else if (trimmed.startsWith('- ')) {
        if (!currentArray) {
          currentArray = [];
          const parent = stack[depth] || obj;
          parent[currentKey] = currentArray;
        }
        currentArray.push(trimmed.slice(2).trim());
      } else if (trimmed.includes(':')) {
        const [key, value] = trimmed.split(':').map(s => s.trim());
        const parent = stack[depth] || obj;
        parent[key] = this.#parseYamlValue(value);
        currentArray = null;
      }
    }

    return obj;
  }

  /**
   * Parse YAML value
   */
  #parseYamlValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    return value;
  }

  /**
   * Get automation by name
   */
  getAutomation(name) {
    return this.automations.get(name);
  }

  /**
   * List all automations
   */
  listAutomations() {
    return Array.from(this.automations.values()).map(a => ({
      name: a.name,
      description: a.description,
      enabled: a.enabled,
      triggers: a.triggers.length,
      actions: a.actions.length,
    }));
  }

  /**
   * Enable automation
   */
  enableAutomation(name) {
    if (!this.automations.has(name)) {
      return { success: false, error: `Automation not found: ${name}` };
    }
    this.automations.get(name).enabled = true;
    return { success: true };
  }

  /**
   * Disable automation
   */
  disableAutomation(name) {
    if (!this.automations.has(name)) {
      return { success: false, error: `Automation not found: ${name}` };
    }
    this.automations.get(name).enabled = false;
    return { success: true };
  }

  /**
   * Get execution history
   */
  getExecutionHistory(automationName = null, limit = 20) {
    let history = this.execHistory;
    if (automationName) {
      history = history.filter(e => e.name === automationName);
    }
    return history.slice(-limit);
  }
}

export default AutomationEngine;
