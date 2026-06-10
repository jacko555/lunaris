/**
 * JSON-serializable value types. All simulation state, component data,
 * command payloads, and save files are constrained to these shapes so that
 * serialization, hashing, and quantization are total over world state.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** Entities are plain numbers, allocated by a monotonic per-world counter. */
export type EntityId = number;
