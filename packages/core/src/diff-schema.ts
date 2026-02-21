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

  // Constraint added (was unset, now has a value)
  if (before === undefined && after !== undefined) return "stricter";
  // Constraint removed (had a value, now unset)
  if (before !== undefined && after === undefined) return "lenient";
  // Both are numbers — compare based on direction
  if (before === undefined || after === undefined) return null;

  const diff = after - before;
  if (diff === 0) return null;
  // For "min": higher = stricter; for "max": lower = stricter
  const isStricter = direction === "min" ? diff > 0 : diff < 0;
  return isStricter ? "stricter" : "lenient";
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
 * Detects type changes for a single property between two schema versions.
 *
 * @param toolName - The tool name.
 * @param propPath - The full property path.
 * @param prop - The property name.
 * @param beforeProp - The old property schema.
 * @param afterProp - The new property schema.
 * @returns Array of type-related schema changes.
 */
function diffPropertyType(
  toolName: string,
  propPath: string,
  prop: string,
  beforeProp: JSONSchema,
  afterProp: JSONSchema,
): SchemaChange[] {
  const beforeType = normalizeType(beforeProp.type);
  const afterType = normalizeType(afterProp.type);
  if (JSON.stringify(beforeType) === JSON.stringify(afterType)) return [];

  if (isTypeWidened(beforeType, afterType)) {
    return [
      {
        id: `tool.${toolName}.${propPath}.typeWidened`,
        category: "tool",
        name: toolName,
        severity: "safe",
        type: "modified",
        message: `Parameter "${prop}" type widened from ${beforeType.join(" | ")} to ${afterType.join(" | ")}`,
        path: propPath,
        before: beforeProp.type,
        after: afterProp.type,
      },
    ];
  }

  if (isTypeNarrowed(beforeType, afterType)) {
    return [
      {
        id: `tool.${toolName}.${propPath}.typeNarrowed`,
        category: "tool",
        name: toolName,
        severity: "breaking",
        type: "modified",
        message: `Parameter "${prop}" type narrowed from ${beforeType.join(" | ")} to ${afterType.join(" | ")}`,
        path: propPath,
        before: beforeProp.type,
        after: afterProp.type,
      },
    ];
  }

  return [
    {
      id: `tool.${toolName}.${propPath}.typeChanged`,
      category: "tool",
      name: toolName,
      severity: "breaking",
      type: "modified",
      message: `Parameter "${prop}" type changed from ${beforeType.join(" | ") || "unspecified"} to ${afterType.join(" | ") || "unspecified"}`,
      path: propPath,
      before: beforeProp.type,
      after: afterProp.type,
    },
  ];
}

/**
 * Detects enum value changes for a single property.
 *
 * @param toolName - The tool name.
 * @param propPath - The full property path.
 * @param prop - The property name.
 * @param beforeProp - The old property schema.
 * @param afterProp - The new property schema.
 * @returns Array of enum-related schema changes.
 */
function diffPropertyEnum(
  toolName: string,
  propPath: string,
  prop: string,
  beforeProp: JSONSchema,
  afterProp: JSONSchema,
): SchemaChange[] {
  const beforeEnum = beforeProp.enum as unknown[] | undefined;
  const afterEnum = afterProp.enum as unknown[] | undefined;
  if (!beforeEnum || !afterEnum) return [];

  const changes: SchemaChange[] = [];
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

  return changes;
}

/**
 * Detects metadata changes (description, default, format) for a single property.
 *
 * @param toolName - The tool name.
 * @param propPath - The full property path.
 * @param prop - The property name.
 * @param beforeProp - The old property schema.
 * @param afterProp - The new property schema.
 * @returns Array of metadata-related schema changes.
 */
function diffPropertyMetadata(
  toolName: string,
  propPath: string,
  prop: string,
  beforeProp: JSONSchema,
  afterProp: JSONSchema,
): SchemaChange[] {
  const changes: SchemaChange[] = [];

  if (
    beforeProp.description !== afterProp.description &&
    beforeProp.description !== undefined &&
    afterProp.description !== undefined
  ) {
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

  if (
    beforeProp.default !== undefined &&
    afterProp.default !== undefined &&
    JSON.stringify(beforeProp.default) !== JSON.stringify(afterProp.default)
  ) {
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

  if (beforeProp.format !== afterProp.format && afterProp.format !== undefined) {
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

  return changes;
}

/**
 * Detects numeric constraint changes for a single property.
 *
 * @param toolName - The tool name.
 * @param propPath - The full property path.
 * @param prop - The property name.
 * @param beforeProp - The old property schema.
 * @param afterProp - The new property schema.
 * @returns Array of constraint-related schema changes.
 */
function diffPropertyConstraints(
  toolName: string,
  propPath: string,
  prop: string,
  beforeProp: JSONSchema,
  afterProp: JSONSchema,
): SchemaChange[] {
  const changes: SchemaChange[] = [];

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

  return changes;
}

/**
 * Detects all modifications to a single property that exists in both schemas.
 *
 * @param toolName - The tool name.
 * @param prop - The property name.
 * @param basePath - The base path prefix.
 * @param beforeProp - The old property schema.
 * @param afterProp - The new property schema.
 * @param beforeRequired - Set of required properties in the old schema.
 * @param afterRequired - Set of required properties in the new schema.
 * @param schemaKind - "inputSchema" or "outputSchema".
 * @returns Array of detected schema changes for this property.
 */
function diffPropertyModifications(
  toolName: string,
  prop: string,
  basePath: string,
  beforeProp: JSONSchema,
  afterProp: JSONSchema,
  beforeRequired: Set<string>,
  afterRequired: Set<string>,
  schemaKind: "inputSchema" | "outputSchema",
): SchemaChange[] {
  const changes: SchemaChange[] = [];
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

  changes.push(...diffPropertyType(toolName, propPath, prop, beforeProp, afterProp));
  changes.push(...diffPropertyEnum(toolName, propPath, prop, beforeProp, afterProp));
  changes.push(...diffPropertyMetadata(toolName, propPath, prop, beforeProp, afterProp));
  changes.push(...diffPropertyConstraints(toolName, propPath, prop, beforeProp, afterProp));

  // Recurse into nested object schemas
  if (beforeProp.type === "object" && afterProp.type === "object") {
    changes.push(...diffSchemas(toolName, beforeProp, afterProp, schemaKind, propPath));
  }

  return changes;
}

/**
 * Detects additionalProperties changes between two schemas.
 *
 * @param toolName - The tool name.
 * @param basePath - The base path prefix.
 * @param beforeSchema - The old schema.
 * @param afterSchema - The new schema.
 * @returns Array of additionalProperties-related changes.
 */
function diffAdditionalProperties(
  toolName: string,
  basePath: string,
  beforeSchema: JSONSchema,
  afterSchema: JSONSchema,
): SchemaChange[] {
  const beforeAdditional = beforeSchema.additionalProperties;
  const afterAdditional = afterSchema.additionalProperties;
  if (beforeAdditional === afterAdditional) return [];

  if (afterAdditional === false && (beforeAdditional === true || beforeAdditional === undefined)) {
    return [
      {
        id: `tool.${toolName}.${basePath}.additionalProperties.restricted`,
        category: "tool",
        name: toolName,
        severity: "breaking",
        type: "modified",
        message: `additionalProperties changed to false in ${toolName} ${basePath}`,
        path: `${basePath}.additionalProperties`,
        before: beforeAdditional ?? true,
        after: false,
      },
    ];
  }

  if ((afterAdditional === true || afterAdditional === undefined) && beforeAdditional === false) {
    return [
      {
        id: `tool.${toolName}.${basePath}.additionalProperties.relaxed`,
        category: "tool",
        name: toolName,
        severity: "safe",
        type: "modified",
        message: `additionalProperties changed to allowed in ${toolName} ${basePath}`,
        path: `${basePath}.additionalProperties`,
        before: false,
        after: afterAdditional ?? true,
      },
    ];
  }

  return [];
}

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
    const beforeProp = beforeProps[prop];
    const afterProp = afterProps[prop];
    if (!beforeProp || !afterProp) continue;
    changes.push(
      ...diffPropertyModifications(
        toolName,
        prop,
        basePath,
        beforeProp,
        afterProp,
        beforeRequired,
        afterRequired,
        schemaKind,
      ),
    );
  }

  changes.push(...diffAdditionalProperties(toolName, basePath, beforeSchema, afterSchema));

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
  // Output schema added
  if (beforeOutput === undefined && afterOutput !== undefined) {
    return [
      {
        id: `tool.${toolName}.outputSchema.added`,
        category: "tool",
        name: toolName,
        severity: "safe",
        type: "added",
        message: `Output schema added to ${toolName}`,
        path: "outputSchema",
        after: afterOutput,
      },
    ];
  }

  // Output schema removed
  if (beforeOutput !== undefined && afterOutput === undefined) {
    return [
      {
        id: `tool.${toolName}.outputSchema.removed`,
        category: "tool",
        name: toolName,
        severity: "breaking",
        type: "removed",
        message: `Output schema removed from ${toolName}`,
        path: "outputSchema",
        before: beforeOutput,
      },
    ];
  }

  // Both exist — diff the schemas
  if (beforeOutput === undefined || afterOutput === undefined) return [];

  return diffOutputSchemaFields(toolName, beforeOutput, afterOutput);
}

/**
 * Diffs individual fields within two existing output schemas.
 *
 * @param toolName - The tool name.
 * @param beforeOutput - The old output schema.
 * @param afterOutput - The new output schema.
 * @returns Array of field-level output schema changes.
 */
function diffOutputSchemaFields(
  toolName: string,
  beforeOutput: JSONSchema,
  afterOutput: JSONSchema,
): SchemaChange[] {
  const changes: SchemaChange[] = [];
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
    const bProp = beforeProps[prop];
    const aProp = afterProps[prop];
    if (!bProp || !aProp) continue;
    const bType = normalizeType(bProp.type);
    const aType = normalizeType(aProp.type);
    if (JSON.stringify(bType) !== JSON.stringify(aType)) {
      changes.push({
        id: `tool.${toolName}.outputSchema.${prop}.typeChanged`,
        category: "tool",
        name: toolName,
        severity: "breaking",
        type: "modified",
        message: `Output field "${prop}" type changed in ${toolName}`,
        path: `outputSchema.properties.${prop}`,
        before: bProp.type,
        after: aProp.type,
      });
    }
  }

  return changes;
}
