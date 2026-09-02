import type { EventLevel, TelemetryClientApi } from '@trace-glow-internal/core';
import type { LoggerOptions } from './types';
export type { LoggerOptions } from './types';

/** 用于常数时间最低级别过滤的数值严重度顺序。 */
const PRIORITY: Record<EventLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

/** 通过内核有界事件管道写入的结构化 Logger。 */
export class Logger {
  /** 缓存归一化阈值，避免每次调用都重新计算默认值。 */
  private readonly minimumLevel: EventLevel;

  /**
   * 基于现有遥测客户端创建 Logger。
   * @param client - 负责归一化、采样、队列和投递的客户端。
   * @param options - 阈值、固定上下文和继承的结构化字段。
   */
  constructor(
    private readonly client: TelemetryClientApi,
    private readonly options: LoggerOptions = {},
  ) {
    this.minimumLevel = options.minimumLevel ?? 'info';
  }

  /** 最低严重级别允许时发送 debug 记录。 */
  debug(message: string, fields?: Record<string, unknown>): void { this.write('debug', message, fields); }
  /** 最低严重级别允许时发送 info 记录。 */
  info(message: string, fields?: Record<string, unknown>): void { this.write('info', message, fields); }
  /** 最低严重级别允许时发送 warn 记录。 */
  warn(message: string, fields?: Record<string, unknown>): void { this.write('warn', message, fields); }
  /** 最低严重级别允许时发送 error 记录。 */
  error(message: string, fields?: Record<string, unknown>): void { this.write('error', message, fields); }
  /** 最低严重级别允许时发送 fatal 记录。 */
  fatal(message: string, fields?: Record<string, unknown>): void { this.write('fatal', message, fields); }

  /**
   * 创建带额外固定字段的 Logger，且不修改父 Logger。
   * 子值覆盖父值，使更小范围组件的上下文保持准确。
   */
  child(fields: Record<string, unknown>): Logger {
    return new Logger(this.client, {
      ...this.options,
      fields: { ...this.options.fields, ...fields },
    });
  }

  /**
   * 应用严重级别过滤并转发结构化日志事件。
   * 单次调用字段有意覆盖继承字段。
   */
  private write(level: EventLevel, message: string, fields?: Record<string, unknown>): void {
    if (PRIORITY[level]! < PRIORITY[this.minimumLevel]!) return;
    this.client.capture({
      type: 'log',
      name: message,
      level,
      ...(this.options.context ? { context: this.options.context } : {}),
      payload: { message, ...this.options.fields, ...fields },
    });
  }
}
