/**
 * src/ruleEngine.ts
 * Core Nested Rule Engine for Cloudflare BPM API
 * Supports AND / OR / NOT / XOR, nested groups, and comparison operators
 */

export type Primitive = string | number | boolean | null | undefined;

export interface ConditionNode {
  id?: string;
  type: "condition";
  field: string;
  operator: string;
  value: any;
  coerce?: "string" | "number" | "boolean" | "date" | "auto";
  flags?: string; // for regex flags
}

export interface GroupNode {
  id?: string;
  type: "group";
  operator: "AND" | "OR" | "NOT" | "XOR";
  children: RuleNode[];
}

export type RuleNode = ConditionNode | GroupNode;

export interface EvaluationResult {
  ok: boolean;
  details: Array<{ nodeId?: string; operator?: string; result: boolean; reason?: string }>;
}

//
// Utility: safely get a nested field from an object (dot or [index] notation)
//
export function getField(payload: any, path: string): any {
  if (!path) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cur = payload;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

//
// Type coercion helper
//
function coerceValue(val: any, mode?: string): any {
  if (val === null || val === undefined) return val;
  try {
    switch (mode) {
      case "number":
        return Number(val);
      case "boolean":
        return val === "true" || val === true;
      case "string":
        return String(val);
      case "date":
        return new Date(val);
      case "auto":
      default:
        if (typeof val === "string" && /^[0-9]+(\.[0-9]+)?$/.test(val)) return Number(val);
        if (val === "true" || val === "false") return val === "true";
        const parsed = Date.parse(val);
        if (!isNaN(parsed)) return new Date(val);
        return val;
    }
  } catch {
    return val;
  }
}

//
// Comparison Evaluator
//
function compare(left: any, operator: string, right: any, flags?: string): boolean {
  switch (operator) {
    case "==": return left == right;
    case "!=": return left != right;
    case ">": return left > right;
    case "<": return left < right;
    case ">=": return left >= right;
    case "<=": return left <= right;
    case "CONTAINS":
      if (Array.isArray(left)) return left.includes(right);
      return String(left || "").includes(String(right));
    case "IN":
      return Array.isArray(right) ? right.includes(left) : false;
    case "STARTS_WITH":
      return String(left || "").startsWith(String(right));
    case "ENDS_WITH":
      return String(left || "").endsWith(String(right));
    case "MATCHES":
      try {
        const re = new RegExp(String(right), flags || "");
        return re.test(String(left));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

//
// Condition Evaluator
//
export function evaluateCondition(payload: any, node: ConditionNode): { ok: boolean; reason: string } {
  const left = getField(payload, node.field);
  const right = node.value;
  const l = node.coerce ? coerceValue(left, node.coerce) : left;
  const r = node.coerce ? coerceValue(right, node.coerce) : right;

  const result = compare(l, node.operator, r, node.flags);
  const reason = `${node.field} ${node.operator} ${JSON.stringify(node.value)} → ${result}`;
  return { ok: result, reason };
}

//
// Recursive Group Evaluator
//
export function evaluateNode(payload: any, node: RuleNode): EvaluationResult {
  const details: EvaluationResult["details"] = [];

  if (node.type === "condition") {
    const res = evaluateCondition(payload, node as ConditionNode);
    details.push({ nodeId: node.id, operator: (node as ConditionNode).operator, result: res.ok, reason: res.reason });
    return { ok: res.ok, details };
  }

  const group = node as GroupNode;
  const childResults = group.children.map((child) => evaluateNode(payload, child));

  const allOk = childResults.map((r) => r.ok);
  let result = false;

  switch (group.operator) {
    case "AND":
      result = allOk.every(Boolean);
      break;
    case "OR":
      result = allOk.some(Boolean);
      break;
    case "NOT":
      result = childResults.length === 1 ? !childResults[0].ok : false;
      break;
    case "XOR":
      result = allOk.filter(Boolean).length === 1;
      break;
  }

  return {
    ok: result,
    details: [...childResults.flatMap((r) => r.details), { operator: group.operator, result }]
  };
}

//
// Main entry point: evaluate rule JSON
//
export function evaluateRuleset(payload: any, ruleSet: RuleNode): EvaluationResult {
  const res = evaluateNode(payload, ruleSet);
  return res;
}
