import { JsonValue } from "@model-w/hydroyaml/dist/resolving";

type JsonPromise = JsonValue | Promise<JsonValue>;

/**
 * Checks whether a value is an object
 * @param value The value to check
 */
export function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * Checks whether a value is an array
 * @param value The value to check
 */
export function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

/**
 * Resolves all promises in an object recursively
 * @param obj The object to resolve
 */
export async function deepResolve(obj: JsonPromise): Promise<JsonValue> {
    const val = await obj;

    if (isObject(val)) {
        return Object.fromEntries(
            await Promise.all(
                Object.entries(val).map(async ([key, value]) => [
                    key,
                    await deepResolve(value),
                ])
            )
        );
    } else if (isArray(val)) {
        return await Promise.all(
            val.map(async (value) => await deepResolve(value))
        );
    } else {
        return val;
    }
}
