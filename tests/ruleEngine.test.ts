import { evaluateRuleset } from "../src/ruleEngine";
import { test, expect } from 'vitest';

test("simple numeric comparison", () => {
  const rules = {
    type: "condition",
    field: "age",
    operator: ">=",
    value: 18
  };
  const result = evaluateRuleset({ age: 21 }, rules);
  expect(result.ok).toBe(true);
});

test("nested AND/OR logic", () => {
  const rules = {
    type: "group",
    operator: "AND",
    children: [
      { type: "condition", field: "user.age", operator: ">=", value: 18 },
      {
        type: "group",
        operator: "OR",
        children: [
          { type: "condition", field: "user.country", operator: "==", value: "US" },
          { type: "condition", field: "user.country", operator: "==", value: "CA" }
        ]
      }
    ]
  };

  const payload = { user: { age: 20, country: "CA" } };
  const result = evaluateRuleset(payload, rules);
  expect(result.ok).toBe(true);
});

test("regex match", () => {
  const rule = {
    type: "condition",
    field: "message",
    operator: "MATCHES",
    value: "urgent",
    flags: "i"
  };
  const payload = { message: "Urgent: please review" };
  const result = evaluateRuleset(payload, rule);
  expect(result.ok).toBe(true);
});
