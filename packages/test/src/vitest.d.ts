/**
 * Vitest type augmentation for @mcp-contracts/test matchers.
 *
 * This file provides type declarations so that `toConformToContract`
 * and `toHandleBoundaryInputs` are recognized by TypeScript in Vitest tests.
 *
 * Include via: import "@mcp-contracts/test/matchers" in your setup file.
 */

import type { MCPContractSnapshot } from "@mcp-contracts/core";
import type { BoundaryOptions, ConformanceOptions } from "./types.js";

declare module "vitest" {
  // biome-ignore lint/suspicious/noExplicitAny: Vitest interface requires any for generic param
  interface Assertion<T = any> {
    toConformToContract(contract: MCPContractSnapshot, options?: ConformanceOptions): Promise<void>;
    toHandleBoundaryInputs(contract: MCPContractSnapshot, options?: BoundaryOptions): Promise<void>;
  }

  interface AsymmetricMatchersContaining {
    toConformToContract(contract: MCPContractSnapshot, options?: ConformanceOptions): void;
    toHandleBoundaryInputs(contract: MCPContractSnapshot, options?: BoundaryOptions): void;
  }
}
