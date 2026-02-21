import type { SchemaChange } from "./diff-types.js";
import type { JSONSchema } from "./types.js";

/**
 * Normalizes a JSON Schema `type` field to an array of strings for comparison.
 *
 * @param type - The type value from a JSON Schema (string, array, or undefined).
 * @returns A sorted array of type strings.
 */
function normalizeType(type: unknown): string[] {
  if (type === undefined) return [];
  if (typeof type === "string") return [type];
  if (Array.isArray(type)) return [...type].sort();
  return [];
}

/**
 * Checks if type `b` is a strict widening of type `a` (all of `a`'s types are in `b`, but `b` has more).
 *
 * @param a - The original type array.
 * @param b - The new type array.
 * @returns True if `b` is a strict superset of `a`.
 */
function isTypeWidened(a: string[], b: string[]): boolean {
  if (b.length <= a.length) return false;
  return a.every((t) => b.includes(t));
}

/**
 * Checks if type `b` is a strict narrowing of type `a` (all of `b`'s types are in `a`, but `a` has more).
 *
 * @param a - The original type array.
 * @param b - The new type array.
 * @returns True if `b` is a strict subset of `a`.
 */
function isTypeNarrowed(a: string[], b: string[]): boolean {
  if (a.length <= b.length) return false;
  return b.every((t) => a.includes(t));
}

/**
 * Compares a numeric constraint and determines if it was made stricter or more lenient.
 * For "min" constraints, increasing is stricter. For "max" constraints, decreasing is stricter.
 *
 * @param beforeVal - The old constraint value.
 * @param afterVal - The new constraint value.
 * @param direction - Whether the constraint is a "min" or "max" type.
 * @returns "stricter" | "lenient" | null
 */
function compareConstraint(
  beforeVal: unknown,
  afterVal: unknown,
  direction: "min" | "max",
): "stricter" | "lenient" | null {
  if (beforeVal === afterVal) return null;
  if (typeof beforeVal !== "number" && typeof afterVal !== "number") return null;

  const before = typeof beforeVal === "number" ? beforeVal : undefined;
  const after = typeof afterVal === "number" ? afterVal : undefined;

  if (direction === "min") {
    if (before === undefined && after !== undefined) return "stricter";
    if (before !== undefined && after === undefined) return "lenient";
    if (before !== undefined && after !== undefined) {
      return after > before ? "stricter" : after < before ? "lenient" : null;
    }
  } else {
    if (before === undefined && after !== undefined) return "stricter";
    if (before !== undefined && after === undefined) return "lenient";
    if (before !== undefined && after !== undefined) {
      return after < before ? "stricter" : after > before ? "lenient" : null;
    }
  }
  return null;
}

/** Constraint definitions for numeric JSON Schema keywords. */
const CONSTRAINT_KEYWORDS: Array<{ key: string; direction: "min" | "max"; label: string }> = [
  { key: "minimum", direction: "min", label: "minimum" },
  { key: "maximum", direction: "max", label: "maximum" },
  { key: "minLength", direction: "min", label: "minLength" },
  { key: "maxLength", direction: "max", label: "maxLength" },
  { key: "minItems", direction: "min", label: "minItems" },
  { key: "maxItems", direction: "max", label: "maxItems" },
];

/**
 * Diffs two JSON Schemas for a single tool's input or output and produces SchemaChange entries.
 *
 * @param toolName - The tool name (for change IDs and messages).
 * @param beforeSchema - The old schema.
 * @param afterSchema - The new schema.
 * @param schemaKind - "inputSchema" or "outputSchema".
 * @param basePath - The base path prefix for nested recursion.
 * @returns Array of detected schema changes.
 */
export function diffSchemas(
  toolName: string,
  beforeSchema: JSONSchema,
  afterSchema: JSONSchema,
  schemaKind: "inputSchema" | "outputSchema",
  basePath = schemaKind,
): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const beforeProps = (beforeSchema.properties ?? {}) as Record<string, JSONSchema>;
  const afterProps = (afterSchema.properties ?? {}) as Record<string, JSONSchema>;
  const beforeRequired = new Set((beforeSchema.required ?? []) as string[]);
  const afterRequired = new Set((afterSchema.required ?? []) as string[]);
  const beforePropNames = new Set(Object.keys(beforeProps));
  const afterPropNames = new Set(Object.keys(afterProps));

  // Parameter added
  for (const prop of afterPropNames) {
    if (beforePropNames.has(prop)) continue;
    const isRequired = afterRequired.has(prop);
    changes.push({
      id: `tool.${toolName}.${basePath}.${prop}.added`,
      category: "tool",
      name: toolName,
      severity: isRequired ? "breaking" : "safe",
      type: "added",
      message: isRequired
        ? `Required parameter "${prop}" was added to ${toolName}`
        : `Optional parameter "${prop}" was added to ${toolName}`,
      path: `${basePath}.properties.${prop}`,
      after: afterProps[prop],
    });
  }

  // Parameter removed
  for (const prop of beforePropNames) {
    if (afterPropNames.has(prop)) continue;
    const wasRequired = beforeRequired.has(prop);
    changes.push({
      id: `tool.${toolName}.${basePath}.${prop}.removed`,
      category: "tool",
      name: toolName,
      severity: wasRequired ? "warning" : "warning",
      type: "removed",
      message: wasRequired
        ? `Required parameter "${prop}" was removed from ${toolName}`
        : `Optional parameter "${prop}" was removed from ${toolName}`,
      path: `${basePath}.properties.${prop}`,
      before: beforeProps[prop],
    });
  }

  // Parameter modifications (present in both)
  for (const prop of beforePropNames) {
    if (!afterPropNames.has(prop)) continue;
    const beforeProp = beforeProps[prop]!;
    const afterProp = afterProps[prop]!;
    const propPath = `${basePath}.properties.${prop}`;

    // Requiredness changed
    const wasBefore = beforeRequired.has(prop);
    const isAfter = afterRequired.has(prop);
    if (!wasBefore && isAfter) {
      changes.push({
        id: `tool.${toolName}.${propPath}.requiredAdded`,
        category: "tool",
        name: toolName,
        severity: "breaking",
        type: "modified",
        message: `Parameter "${prop}" in ${toolName} became required`,
        path: propPath,
        before: "optional",
        after: "required",
      });
    } else if (wasBefore && !isAfter) {
      changes.push({
        id: `tool.${toolName}.${propPath}.requiredRemoved`,
        category: "tool",
        name: toolName,
        severity: "warning",
        type: "modified",
        message: `Parameter "${prop}" in ${toolName} is no longer required`,
        path: propPath,
        before: "required",
        after: "optional",
      });
    }

    // Type changed
    const beforeType = normalizeType(beforeProp.type);
    const afterType = normalizeType(afterProp.type);
    if (JSON.stringify(beforeType) !== JSON.stringify(afterType)) {
      if (isTypeWidened(beforeType, afterType)) {
        changes.push({
          id: `tool.${toolName}.${propPath}.typeWidened`,
          category: "tool",
          name: toolName,
          severity: "safe",
          type: "modified",
          message: `Parameter "${prop}" type widened from ${beforeType.join(" | ")} to ${afterType.join(" | ")}`,
          path: propPath,
          before: beforeProp.type,
          after: afterProp.type,
        });
      } else if (isTypeNarrowed(beforeType, afterType)) {
        changes.push({
          id: `tool.${toolName}.${propPath}.typeNarrowed`,
          category: "tool",
          name: toolName,
          severity: "breaking",
          type: "modified",
          message: `Parameter "${prop}" type narrowed from ${beforeType.join(" | ")} to ${afterType.join(" | ")}`,
          path: propPath,
          before: beforeProp.type,
          after: afterProp.type,
        });
      } else {
        changes.push({
          id: `tool.${toolName}.${propPath}.typeChanged`,
          category: "tool",
          name: toolName,
          severity: "breaking",
          type: "modified",
          message: `Parameter "${prop}" type changed from ${beforeType.join(" | ") || "unspecified"} to ${afterType.join(" | ") || "unspecified"}`,
          path: propPath,
          before: beforeProp.type,
          after: afterProp.type,
        });
      }
    }

    // Enum changes
    const beforeEnum = beforeProp.enum as unknown[] | undefined;
    const afterEnum = afterProp.enum as unknown[] | undefined;
    if (beforeEnum && afterEnum) {
      const beforeSet = new Set(beforeEnum.map((v) => JSON.stringify(v)));
      const afterSet = new Set(afterEnum.map((v) => JSON.stringify(v)));
      const removed = [...beforeSet].filter((v) => !afterSet.has(v));
      const added = [...afterSet].filter((v) => !beforeSet.has(v));

      if (removed.length > 0) {
        changes.push({
          id: `tool.${toolName}.${propPath}.enumValuesRemoved`,
          category: "tool",
          name: toolName,
          severity: "breaking",
          type: "modified",
          message: `Enum values removed from "${prop}": ${removed.map((v) => JSON.parse(v)).join(", ")}`,
          path: propPath,
          before: beforeEnum,
          after: afterEnum,
        });
      }
      if (added.length > 0) {
        changes.push({
          id: `tool.${toolName}.${propPath}.enumValuesAdded`,
          category: "tool",
          name: toolName,
          severity: "safe",
          type: "modified",
          message: `Enum values added to "${prop}": ${added.map((v) => JSON.parse(v)).join(", ")}`,
          path: propPath,
          before: beforeEnum,
          after: afterEnum,
        });
      }
    }

    // Description changed
    if (beforeProp.description !== afterProp.description &&
        beforeProp.description !== undefined && afterProp.description !== undefined) {
      changes.push({
        id: `tool.${toolName}.${propPath}.descriptionChanged`,
        category: "tool",
        name: toolName,
        severity: "warning",
        type: "modified",
        message: `Parameter "${prop}" description changed in ${toolName}`,
        path: `${propPath}.description`,
        before: beforeProp.description,
        after: afterProp.description,
      });
    }

    // Default changed
    if (beforeProp.default !== undefined && afterProp.default !== undefined &&
        JSON.stringify(beforeProp.default) !== JSON.stringify(afterProp.default)) {
      changes.push({
        id: `tool.${toolName}.${propPath}.defaultChanged`,
        category: "tool",
        name: toolName,
        severity: "warning",
        type: "modified",
        message: `Parameter "${prop}" default changed in ${toolName}`,
        path: `${propPath}.default`,
        before: beforeProp.default,
        after: afterProp.default,
      });
    }

    // Format added or changed
    if (beforeProp.format !== afterProp.format &&
        afterProp.format !== undefined) {
      changes.push({
        id: `tool.${toolName}.${propPath}.formatChanged`,
        category: "tool",
        name: toolName,
        severity: "warning",
        type: "modified",
        message: beforeProp.format
          ? `Parameter "${prop}" format changed from "${beforeProp.format}" to "${afterProp.format}"`
          : `Parameter "${prop}" format "${afterProp.format}" was added`,
        path: `${propPath}.format`,
        before: beforeProp.format,
        after: afterProp.format,
      });
    }

    // Numeric constraint changes
    for (const { key, direction, label } of CONSTRAINT_KEYWORDS) {
      const result = compareConstraint(beforeProp[key], afterProp[key], direction);
      if (result === "stricter") {
        changes.push({
          id: `tool.${toolName}.${propPath}.${key}Stricter`,
          category: "tool",
          name: toolName,
          severity: "breaking",
          type: "modified",
          message: `Parameter "${prop}" ${label} made stricter in ${toolName}`,
          path: `${propPath}.${key}`,
          before: beforeProp[key],
          after: afterProp[key],
        });
      } else if (result === "lenient") {
        changes.push({
          id: `tool.${toolName}.${propPath}.${key}Lenient`,
          category: "tool",
          name: toolName,
          severity: "safe",
          type: "modified",
          message: `Parameter "${prop}" ${label} made more lenient in ${toolName}`,
          path: `${propPath}.${key}`,
          before: beforeProp[key],
          after: afterProp[key],
        });
      }
    }

    // Recurse into nested object schemas
    if (beforeProp.type === "object" && afterProp.type === "object") {
      changes.push(
        ...diffSchemas(toolName, beforeProp, afterProp, schemaKind, propPath),
      );
    }
  }

  // additionalProperties changes
  const beforeAdditional = beforeSchema.additionalProperties;
  const afterAdditional = afterSchema.additionalProperties;
  if (beforeAdditional !== afterAdditional) {
    if (afterAdditional === false && (beforeAdditional === true || beforeAdditional === undefined)) {
      changes.push({
        id: `tool.${toolName}.${basePath}.additionalProperties.restricted`,
        category: "tool",
        name: toolName,
        severity: "breaking",
        type: "modified",
        message: `additionalProperties changed to false in ${toolName} ${basePath}`,
        path: `${basePath}.additionalProperties`,
        before: beforeAdditional ?? true,
        after: false,
      });
    } else if ((afterAdditional === true || afterAdditional === undefined) && beforeAdditional === false) {
      changes.push({
        id: `tool.${toolName}.${basePath}.additionalProperties.relaxed`,
        category: "tool",
        name: toolName,
        severity: "safe",
        type: "modified",
        message: `additionalProperties changed to allowed in ${toolName} ${basePath}`,
        path: `${basePath}.additionalProperties`,
        before: false,
        after: afterAdditional ?? true,
      });
    }
  }

  return changes;
}

/**
 * Diffs the output schema changes between two tool versions.
 *
 * @param toolName - The tool name.
 * @param beforeOutput - The old output schema (may be undefined).
 * @param afterOutput - The new output schema (may be undefined).
 * @returns Array of detected output schema changes.
 */
export function diffOutputSchema(
  toolName: string,
  beforeOutput: JSONSchema | undefined,
  afterOutput: JSONSchema | undefined,
): SchemaChange[] {
  const changes: SchemaChange[] = [];

  // Output schema added
  if (beforeOutput === undefined && afterOutput !== undefined) {
    changes.push({
      id: `tool.${toolName}.outputSchema.added`,
      category: "tool",
      name: toolName,
      severity: "safe",
      type: "added",
      message: `Output schema added to ${toolName}`,
      path: "outputSchema",
      after: afterOutput,
    });
    return changes;
  }

  // Output schema removed
  if (beforeOutput !== undefined && afterOutput === undefined) {
    changes.push({
      id: `tool.${toolName}.outputSchema.removed`,
      category: "tool",
      name: toolName,
      severity: "breaking",
      type: "removed",
      message: `Output schema removed from ${toolName}`,
      path: "outputSchema",
      before: beforeOutput,
    });
    return changes;
  }

  // Both exist — diff the schemas
  if (beforeOutput !== undefined && afterOutput !== undefined) {
    const beforeProps = (beforeOutput.properties ?? {}) as Record<string, JSONSchema>;
    const afterProps = (afterOutput.properties ?? {}) as Record<string, JSONSchema>;
    const beforeRequired = new Set((beforeOutput.required ?? []) as string[]);
    const afterRequired = new Set((afterOutput.required ?? []) as string[]);

    // Field added to output
    for (const prop of Object.keys(afterProps)) {
      if (prop in beforeProps) continue;
      changes.push({
        id: `tool.${toolName}.outputSchema.${prop}.added`,
        category: "tool",
        name: toolName,
        severity: afterRequired.has(prop) ? "warning" : "safe",
        type: "added",
        message: afterRequired.has(prop)
          ? `Required output field "${prop}" added to ${toolName}`
          : `Optional output field "${prop}" added to ${toolName}`,
        path: `outputSchema.properties.${prop}`,
        after: afterProps[prop],
      });
    }

    // Field removed from output
    for (const prop of Object.keys(beforeProps)) {
      if (prop in afterProps) continue;
      changes.push({
        id: `tool.${toolName}.outputSchema.${prop}.removed`,
        category: "tool",
        name: toolName,
        severity: beforeRequired.has(prop) ? "breaking" : "warning",
        type: "removed",
        message: beforeRequired.has(prop)
          ? `Required output field "${prop}" removed from ${toolName}`
          : `Optional output field "${prop}" removed from ${toolName}`,
        path: `outputSchema.properties.${prop}`,
        before: beforeProps[prop],
      });
    }

    // Field type changed in output
    for (const prop of Object.keys(beforeProps)) {
      if (!(prop in afterProps)) continue;
      const bType = normalizeType(beforeProps[prop]!.type);
      const aType = normalizeType(afterProps[prop]!.type);
      if (JSON.stringify(bType) !== JSON.stringify(aType)) {
        changes.push({
          id: `tool.${toolName}.outputSchema.${prop}.typeChanged`,
          category: "tool",
          name: toolName,
          severity: "breaking",
          type: "modified",
          message: `Output field "${prop}" type changed in ${toolName}`,
          path: `outputSchema.properties.${prop}`,
          before: beforeProps[prop]!.type,
          after: afterProps[prop]!.type,
        });
      }
    }
  }

  return changes;
}
