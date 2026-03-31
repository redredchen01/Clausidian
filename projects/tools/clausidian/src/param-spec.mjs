/**
 * ParamSpec — Declarative parameter definition for CLI + MCP
 *
 * Eliminates duplication between mcpSchema and argument parsing.
 * Define parameters once, auto-generate schema and parser.
 *
 * Usage:
 *   const spec = new ParamSpec()
 *     .string('title', { required: true })
 *     .string('type', { required: true, enum: ['area', 'project'] })
 *     .array('tags');
 *
 *   const schema = spec.toMcpSchema();
 *   const parser = spec.makeParser();
 *   const args = parser(flags, positional);
 */

export class ParamSpec {
  constructor() {
    this.params = {};
    this.order = [];
  }

  string(name, opts = {}) {
    const { description = '', required = false, enum: enumVals = null, default: defaultVal = null } = opts;
    this.params[name] = { type: 'string', description, required, enum: enumVals, default: defaultVal };
    this.order.push(name);
    return this;
  }

  number(name, opts = {}) {
    const { description = '', required = false, default: defaultVal = null } = opts;
    this.params[name] = { type: 'number', description, required, default: defaultVal };
    this.order.push(name);
    return this;
  }

  array(name, opts = {}) {
    const { description = '', required = false, items = { type: 'string' }, default: defaultVal = null } = opts;
    this.params[name] = { type: 'array', description, required, items, default: defaultVal };
    this.order.push(name);
    return this;
  }

  boolean(name, opts = {}) {
    const { description = '', default: defaultVal = false } = opts;
    this.params[name] = { type: 'boolean', description, default: defaultVal };
    this.order.push(name);
    return this;
  }

  /**
   * Generate MCP Schema from parameter definitions
   * @returns {Object} MCP-compatible schema
   */
  toMcpSchema() {
    const schema = {};
    for (const [name, param] of Object.entries(this.params)) {
      const { type, description, enum: enumVals } = param;
      schema[name] = { type, description };
      if (enumVals) {
        schema[name].enum = enumVals;
      }
      if (type === 'array' && param.items) {
        schema[name].items = param.items;
      }
    }
    return schema;
  }

  /**
   * Get list of required parameter names
   * @returns {string[]} Required parameter names
   */
  getRequired() {
    return Object.entries(this.params)
      .filter(([, param]) => param.required)
      .map(([name]) => name);
  }

  /**
   * Create a parser function that converts flags + positional args
   * into a validated argument object
   * @returns {Function} (flags, pos) => Object
   */
  makeParser() {
    return (flags = {}, pos = []) => {
      const args = {};
      const required = this.getRequired();
      let posIndex = 0;

      // First pass: positional arguments
      for (const name of this.order) {
        const param = this.params[name];
        if (!param) continue;

        // Skip if already in flags
        if (flags[name] !== undefined && flags[name] !== null) {
          continue;
        }

        // Try to fill from positional args
        if (pos[posIndex] !== undefined) {
          const rawVal = pos[posIndex];
          args[name] = this._coerceValue(rawVal, param.type);
          posIndex++;
        } else if (param.default !== undefined) {
          args[name] = param.default;
        }
      }

      // Second pass: flags override positionals
      for (const [key, val] of Object.entries(flags)) {
        const param = this.params[key];
        if (!param) continue;
        args[key] = this._coerceValue(val, param.type);
      }

      // Third pass: apply defaults and validate
      for (const [name, param] of Object.entries(this.params)) {
        if (args[name] === undefined) {
          if (param.default !== undefined) {
            args[name] = param.default;
          }
        }

        // Validate enum
        if (param.enum && args[name] !== undefined && !param.enum.includes(args[name])) {
          throw new Error(
            `Invalid value for ${name}: "${args[name]}".\nExpected one of: ${param.enum.join(', ')}`
          );
        }

        // Check required
        if (param.required && args[name] === undefined) {
          throw new Error(`Missing required parameter: ${name}`);
        }
      }

      return args;
    };
  }

  /**
   * Coerce a raw value to the expected type
   * @private
   */
  _coerceValue(val, type) {
    if (val === undefined || val === null) return undefined;
    if (val === '') return undefined;

    switch (type) {
      case 'string':
        return String(val);
      case 'number':
        return parseInt(val, 10) || parseFloat(val) || 0;
      case 'boolean':
        return val === true || val === 'true' || val === '1';
      case 'array':
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
        return [val];
      default:
        return val;
    }
  }
}
