# Trace Glow SDK 迭代计划

本文档只规划 JavaScript SDK 的能力演进。SDK 负责运行时采集、数据标准化、上下文关联、隐私处理和可靠投递；Collector、平台服务负责存储、查询、Issue 管理和告警，不在本计划范围内。

## 现状基线

当前版本已提供浏览器异常、未处理 Promise、console、资源失败、Breadcrumb、LCP/layout-shift/longtask、Fetch、XHR；React、Vue、Next.js、Node.js 集成；Node 进程异常、运行时指标和 HTTP 中间件；结构化日志、上下文、批处理、随机采样、重试、Beacon/HTTP 投递和 shutdown 刷新。默认不采集请求/响应 body、cookie、Authorization、URL query、fragment 和 DOM text。

当前协议的事件类型为 `monitor`、`log`、`internal`，具体数据主要位于通用 `payload`。这适合第一阶段事件采集，但不足以表达 span、transaction、measurement 和 metric 等结构化数据。

## 迭代总览

| 迭代 | 主题 | 改动类型 | 优先级 | 主要结果 |
| --- | --- | --- | --- | --- |
| 1 | 错误数据标准化 | 优化采集数据 | P0 | 错误链、异常机制、标准 stack frame 和统一异常模型 |
| 2 | Trace 与 Span | 扩展采集范围 + 协议演进 | P0 | transaction/span API、父子关系和 W3C 传播 |
| 3 | 浏览器与 Node 性能 | 扩展采集范围 + 优化采集数据 | P0 | 完整 Web Vitals、页面/路由 transaction、出站请求阶段耗时 |
| 4 | 隐私与采集治理 | 优化采集数据 | P1 | 统一脱敏、字段规则、动态采样和采集开关 |
| 5 | 投递可靠性 | 其他：可靠性与资源控制 | P1 | 浏览器离线队列、恢复投递和丢弃诊断 |
| 6 | 生态集成 | 扩展采集范围 | P1 | Node 出站/数据库/消息队列、日志框架和 OpenTelemetry 适配 |
| 7 | 可选高级采集 | 扩展采集范围 | P2 | Profiling、Session Replay、用户反馈和 Cron/Check-in 插件 |

## 迭代 1：错误数据标准化

**改动类型：优化采集数据。** 不增加新的运行时监听器，先提高现有异常事件的诊断质量。

| 改动前 | 改动后 |
| --- | --- |
| 主要传输 `name`、`message`、`stack` 和自由 payload | 统一 `exception[]`、异常类型、消息、stack frame、机制和异常链 |
| 浏览器、Node、React、Vue 字段不一致 | 所有入口共享同一异常规范，并保留 runtime-specific 字段 |
| 没有明确 fingerprint 输入 | 提供可选 fingerprint/rule，默认不改变服务端策略 |
| 非 Error 只能转字符串 | 支持 `cause`、AggregateError，并限制深度和大小 |

**步骤：** 增加向后兼容的 exception/mechanism；抽取共享 `normalizeError`；统一四类运行时入口；标准化 URL、函数名、行列号和 native 标记；补充异常隔离、异常链和大小限制测试。

**验收：** 相同异常在不同运行时输出等价核心字段；异常链有最大深度；超大 stack 仍受事件限制；现有 v1 事件仍可发送。

## 迭代 2：Trace 与 Span

**改动类型：扩展采集范围 + 协议演进。** 当前 `traceId/requestId` 只是关联字段，本迭代升级为真正 tracing。

| 改动前 | 改动后 |
| --- | --- |
| 只有可选 `traceId`、`requestId`、`sessionId` | 增加 `spanId`、`parentSpanId`、采样决策和 span 状态 |
| Fetch/XHR/Node HTTP 是独立 monitor 事件 | 自动成为当前 transaction 的 child span |
| Node 只保存 request context | 异步作用域保存完整 span context |
| 不处理跨服务 Header | 支持 W3C `traceparent`/`baggage` 提取与注入 |

**步骤：** 设计 `Transaction`、`Span`、`SpanContext` 和结束语义；在 core 增加作用域与采样继承；为 Fetch、XHR、Node HTTP 注入 Header；增加 `startTransaction`、`startSpan`、`withSpan`；测试并发、取消、超时和 shutdown。

**验收：** 浏览器到 Node 的请求链保持同一 trace；父子关系稳定；未采样 trace 不产生孤立 span；不改变宿主请求结果。

## 迭代 3：浏览器与 Node 性能

**改动类型：扩展采集范围 + 优化采集数据。** 只提供原始性能数据，不实现平台性能页面。

| 改动前 | 改动后 |
| --- | --- |
| 仅采集 LCP、单条 layout shift、longtask | 增加 FCP、TTFB、INP、CLS 聚合、Navigation/Resource/Paint Timing |
| 没有页面加载或 SPA 路由 transaction | 自动生成页面加载和路由切换 transaction，并支持手动路由适配器 |
| HTTP 只有总耗时和状态 | 增加 trace/span、重定向、Server-Timing 和可用阶段耗时 |
| Node 只有周期性 CPU/内存/事件循环快照 | 增加 event-loop utilization、GC 统计、请求阶段耗时和 runtime 属性 |

**步骤：** 建立 `measurements` 结构和 Web Vitals 兼容策略；按浏览器能力使用 PerformanceObserver；增加 SPA history/手动路由钩子；为 Node HTTP、Fetch/undici 增加阶段计时；聚合高频 long task 并限制开销。

**验收：** 不支持 API 时无异常；CLS/INP 在正确时机结束；高频条目不突破队列和 payload 限制；性能事件可关联 trace。

## 迭代 4：隐私与采集治理

**改动类型：优化采集数据。** 目标是提升生产默认安全性，而不是盲目增加数据量。

| 改动前 | 改动后 |
| --- | --- |
| 主要依赖 URL 清理和自定义 processor | 内置可组合的 PII 脱敏管道 |
| 只有全局随机采样 | 支持按事件类型、级别、用户/session 稳定采样和错误保留 |
| 没有远程配置和紧急关闭 | 支持版本化配置、TTL、kill switch 和安全回退 |
| 规则分散在插件 | 统一应用到日志、context、Breadcrumb、异常和网络事件 |

**步骤：** 定义规则优先级、范围、递归深度和失败策略；处理邮箱、手机号、token、JWT、Authorization；实现确定性采样并记录采样决策；设计签名配置、缓存 TTL 和本地回退。

**验收：** 脱敏失败不会泄露原值；默认不采集禁止数据；配置失效不抛错、不无限重试；采样结果可复现。

## 迭代 5：投递可靠性

**改动类型：其他：可靠性与资源控制。** 保持 at-least-once，不宣称 exactly-once。

| 改动前 | 改动后 |
| --- | --- |
| 事件只在内存，刷新或断网会丢失 | 浏览器在严格配额内用 IndexedDB 持久化待发送事件 |
| Beacon/HTTP 失败只依赖当前生命周期 | 网络恢复、下次启动和 pagehide 阶段可继续发送 |
| `onDrop` 原因有限 | 增加持久化失败、过期、重试耗尽和配置拒绝 |
| 压缩和状态分类较简单 | 支持压缩协商、时钟偏差反馈和明确重试分类 |

**步骤：** 抽象持久化队列接口；浏览器实现 IndexedDB，Node 保持内存默认；增加配额、过期、迁移版本；实现在线恢复和 pagehide flush；区分 4xx、5xx、网络错误和 AbortError；防止诊断事件递归上报。

**验收：** 队列始终有界；恢复不会重复安装插件；关闭不阻塞宿主；重复事件仍由 Collector 按 ID 去重。

## 迭代 6：生态集成

**改动类型：扩展采集范围。** 通过独立插件或适配器增加覆盖面，不把框架依赖加入通用 Node 包。

| 改动前 | 改动后 |
| --- | --- |
| Node 主要采集进程和入站 HTTP | 增加出站 HTTP、Fetch/undici、数据库、缓存和消息队列 span |
| 应用需要改用 Trace Glow Logger | 提供 Pino、Winston、Bunyan 等适配器 |
| 与 OTel 数据模型分离 | 提供 OpenTelemetry context/span/log exporter 或桥接层 |
| 集成集中在少数框架 | 以独立包维护框架适配和版本矩阵 |

**步骤：** 确定插件接口、peer dependency 和兼容矩阵；实现出站 HTTP/数据库最小集成；增加日志框架适配器；映射 OTel semantic conventions 并提供可选 OTLP exporter；用真实依赖做集成测试，验证浏览器 bundle 隔离。

**验收：** 未安装可选依赖时主 SDK 可构建；插件可 teardown；不改变原库返回值、错误和时序；公共包不暴露私有运行时依赖。

## 迭代 7：可选高级采集

**改动类型：扩展采集范围。** 前六个迭代稳定后再考虑，所有能力默认关闭并有明确配额。

- Profiling：采集 CPU/函数耗时 profile，并与 transaction 关联。
- Session Replay：只允许显式脱敏和元素 allowlist，默认不采集文本和输入值。
- 用户反馈：提供最小 SDK API，不在 SDK 内实现反馈管理页面。
- Cron/Check-in：提供开始、成功、失败和超时事件 API。
- Attachments：限制类型、大小和生命周期，不采集敏感文件。

## 版本与兼容策略

1. v1 事件继续可发送；新增字段优先采用可选字段和 Collector 向后兼容解析。
2. Span、measurement、metric 等模型需要新的协议版本或明确扩展 envelope，不能只依赖任意 payload。
3. 公共包保持统一 `new TraceGlow(config)` 入口，运行时专属能力放在 `instrumentation` 或独立集成包。
4. 每个迭代同步更新 TypeScript 类型、英文/中文用户文档、契约快照、测试和构建检查。
5. 完成实现前运行 `pnpm typecheck`、`pnpm test`、`pnpm build`；发布前检查所有公共包的 bundle 隔离、peer dependency 和私有依赖收敛。

## 明确不纳入 SDK 计划

- 事件存储、全文查询、Issue 聚合和错误分组服务。
- 告警评估、通知编排、团队协作和 RBAC。
- Release health、部署看板和服务拓扑页面。
- Collector 的限流、租户配额、数据保留和平台管理 API。
