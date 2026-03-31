/**
 * Automation Engine — YAML-based triggers + actions
 * Clausidian v3.5.0+
 */

export class AutomationEngine {
  constructor(vault, eventBus, registry) {
    this.vault = vault;
    this.eventBus = eventBus;
    this.registry = registry;
    this.automations = new Map();
    this.execHistory = [];
    this.maxHistory = 100;
  }

  registerAutomation(automation) {
    const { name, enabled = true, triggers = [], actions = [] } = automation;

    if (!name) throw new Error('Automation must have a name');
    if (!Array.isArray(triggers) || triggers.length === 0) throw new Error('Automation must have triggers');
    if (!Array.isArray(actions) || actions.length === 0) throw new Error('Automation must have actions');

    const autoData = { name, enabled, triggers, actions, registeredAt: new Date().toISOString() };
    this.automations.set(name, autoData);

    if (this.eventBus) {
      for (const trigger of triggers) {
        if (trigger.type === 'event') {
          this.eventBus.subscribe(trigger.event, async (event, payload) => {
            if (!autoData.enabled) return;
            await this.#executeAutomation(autoData, { event, payload });
          }).catch(() => {});
        }
      }
    }
  }

  async #executeAutomation(autoData, context) {
    const startTime = Date.now();
    const result = {
      automation: autoData.name,
      timestamp: new Date().toISOString(),
      success: true,
      errors: [],
      results: [],
    };

    for (const action of autoData.actions) {
      try {
        const actionResult = await this.#executeAction(action, context);
        result.results.push(actionResult);
      } catch (err) {
        result.success = false;
        result.errors.push({ action: action.name || action.type, error: err.message });
      }
    }

    result.duration_ms = Date.now() - startTime;
    this.execHistory.push(result);
    if (this.execHistory.length > this.maxHistory) {
      this.execHistory.shift();
    }

    return result;
  }

  async #executeAction(action, context) {
    const { type, name } = action;

    switch (type) {
      case 'shell':
        return { action: name || 'shell', type, status: 'completed', output: 'shell action' };
      case 'notify':
        return { action: name || 'notify', type, status: 'sent', message: action.message };
      case 'command':
        if (this.registry && action.command) {
          const result = await this.registry.executeCommand(action.command, action.args || {});
          return { action: name || action.command, type, status: result.success ? 'completed' : 'failed', result };
        }
        return { action: name || 'command', type, status: 'skipped' };
      default:
        return { action: name || type, type, status: 'skipped', reason: `Unknown action type: ${type}` };
    }
  }

  listAutomations() {
    return Array.from(this.automations.values()).map(a => ({
      name: a.name,
      enabled: a.enabled,
      triggers: a.triggers.length,
      actions: a.actions.length,
      registeredAt: a.registeredAt,
    }));
  }

  getAutomation(name) {
    return this.automations.get(name);
  }

  enableAutomation(name) {
    if (this.automations.has(name)) {
      this.automations.get(name).enabled = true;
    }
  }

  disableAutomation(name) {
    if (this.automations.has(name)) {
      this.automations.get(name).enabled = false;
    }
  }

  getExecutionHistory(limit = 20) {
    return this.execHistory.slice(-limit);
  }

  clearHistory() {
    this.execHistory = [];
  }

  getStats() {
    return {
      totalAutomations: this.automations.size,
      enabledAutomations: Array.from(this.automations.values()).filter(a => a.enabled).length,
      totalExecutions: this.execHistory.length,
      successfulExecutions: this.execHistory.filter(r => r.success).length,
    };
  }
}

export default AutomationEngine;
