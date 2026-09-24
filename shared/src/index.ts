/**
 * Public entry point for the @hosn-obe/shared package.
 *
 * Re-exports the framework-agnostic game primitives so consumers can
 * `import { handScore, buildDeck } from "@hosn-obe/shared"`.
 */

export * from "./types.js";
export * from "./deck.js";
export * from "./scoring.js";
export * from "./net.js";
