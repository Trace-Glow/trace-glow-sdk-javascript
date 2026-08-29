import type { JsonValue } from './types';

/** 嵌套数据被标记替换前允许的最大递归深度。 */
const MAX_DEPTH = 8;

/**
 * 将任意 JavaScript 数据转换为可安全处理循环引用的 JSON 值。
 *
 * @param value - 要归一化的不可信应用值。
 * @param depth - 当前递归深度，仅供内部使用。
 * @param seen - 活跃递归路径上的对象，用于检测循环引用。
 * @returns 已归一化 Error 和 Date 对象的 JSON 安全值。
 */
export function toJsonValue(value: unknown, depth = 0, seen = new WeakSet<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    /** Error 表示不依赖属性可枚举性，并保留调试字段。 */
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
    };
  }
  if (depth >= MAX_DEPTH) return '[MaxDepth]';
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    /** 数组结果按原顺序递归归一化每个元素。 */
    const result = value.map((item) => toJsonValue(item, depth + 1, seen));
    seen.delete(value);
    return result;
  }

  /** 对象结果排除 undefined 值，因为 JSON 最终也会丢弃它们。 */
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) result[key] = toJsonValue(item, depth + 1, seen);
  }
  seen.delete(value);
  return result;
}

/**
 * 将可选 payload 对象归一化为事件协议要求的记录结构。
 * @param value - 应用 payload 或 undefined。
 * @returns JSON 安全记录；未提供 payload 时返回空记录。
 */
export function toJsonRecord(value: Record<string, unknown> | undefined): Record<string, JsonValue> {
  if (!value) return {};
  return toJsonValue(value) as Record<string, JsonValue>;
}
