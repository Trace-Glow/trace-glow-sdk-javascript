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

/** 可跨运行时传输的 stack frame 摘要。 */
export interface NormalizedStackFrame {
  /** 函数或方法名称。 */
  function?: string;
  /** 源文件 URL 或路径。 */
  filename?: string;
  /** 源码行号。 */
  lineno?: number;
  /** 源码列号。 */
  colno?: number;
  /** 是否为原生运行时 frame。 */
  native?: boolean;
}

/** 结构化异常链中的单个异常节点。 */
export interface NormalizedException {
  /** JavaScript 异常构造器名称。 */
  type: string;
  /** 异常消息。 */
  value: string;
  /** 原始 stack 文本，兼容字段仍由顶层 stack 提供。 */
  stacktrace?: string;
  /** 解析出的有限 stack frame。 */
  frames?: readonly NormalizedStackFrame[];
  /** 嵌套 cause，达到深度上限后停止。 */
  cause?: NormalizedException;
}

/** 将 Error、cause 和任意抛出值转换为有界、可序列化的异常数据。 */
export function normalizeError(error: unknown, depth = 0): Record<string, unknown> {
  /** 防止恶意 cause 链或循环对象造成递归失控。 */
  const boundedDepth = Math.min(Math.max(depth, 0), MAX_DEPTH);
  /** Error 实例提供稳定类型、消息和 stack；其他值使用安全字符串。 */
  const source = error instanceof Error ? error : undefined;
  /** 统一异常节点供旧字段和新 exception 字段共同复用。 */
  const exception: NormalizedException = {
    type: source?.name || typeof error,
    value: source?.message || String(error),
    ...(source?.stack && source.stack.length > 2_048 ? { frames: parseStackFrames(source.stack) } : {}),
    ...(source && 'cause' in source && source.cause !== undefined && boundedDepth < MAX_DEPTH
      ? { cause: normalizeErrorNode(source.cause, boundedDepth + 1) }
      : {}),
  };
  return {
    name: exception.type,
    message: exception.value,
    ...(source?.stack ? { stack: source.stack } : {}),
    exception,
  };
}

/** 将嵌套 cause 转成异常节点，避免重复暴露旧版顶层字段。 */
function normalizeErrorNode(error: unknown, depth: number): NormalizedException {
  /** 通过共享入口获取有限字段，再提取 exception 节点。 */
  return normalizeError(error, depth).exception as NormalizedException;
}

/** 从常见 V8/浏览器 stack 文本中提取有限 frame。 */
function parseStackFrames(stack: string): readonly NormalizedStackFrame[] {
  /** 只保留有限数量，避免超长 stack 消耗事件预算。 */
  const frames: NormalizedStackFrame[] = [];
  for (const line of stack.split('\n').slice(0, 50)) {
    /** 兼容 `at fn (url:line:column)` 和 `at url:line:column` 格式。 */
    const match = line.match(/^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/);
    if (!match) continue;
    const [, functionName, filename, lineNumber, columnNumber] = match;
    frames.push({
      ...(functionName ? { function: functionName } : {}),
      ...(filename ? { filename } : {}),
      lineno: Number(lineNumber),
      colno: Number(columnNumber),
      native: filename === 'native',
    });
  }
  return frames;
}
