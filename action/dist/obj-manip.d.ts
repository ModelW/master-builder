import { JsonValue } from "@model-w/hydroyaml/dist/resolving";
type JsonPromise = JsonValue | Promise<JsonValue>;
/**
 * Checks whether a value is an object
 * @param value The value to check
 */
export declare function isObject(value: unknown): value is Record<string, unknown>;
/**
 * Checks whether a value is an array
 * @param value The value to check
 */
export declare function isArray(value: unknown): value is unknown[];
/**
 * Resolves all promises in an object recursively
 * @param obj The object to resolve
 */
export declare function deepResolve(obj: JsonPromise): Promise<JsonValue>;
export {};
