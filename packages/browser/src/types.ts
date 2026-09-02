/** 浏览器自动埋点的功能开关与隐私控制。 */
export interface BrowserPluginOptions {
  /** 采集同步 ErrorEvent 失败。 */
  errors?: boolean;
  /** 采集未处理的 Promise rejection。 */
  unhandledRejections?: boolean;
  /** 采集图片、脚本和样式表资源加载失败。 */
  resources?: boolean;
  /** 捕获 console.error 和 console.warn，同时保留原始控制台输出。 */
  console?: boolean;
  /** 为错误事件附加最近的 Breadcrumb 操作线索。 */
  breadcrumbs?: boolean;
  /** Breadcrumb 缓冲区最大条目数。 */
  maxBreadcrumbs?: number;
  /** 观察受支持的浏览器性能条目类型。 */
  performance?: boolean;
  /** 包装全局 Fetch 调用以采集耗时和状态。 */
  fetch?: boolean;
  /** 修改 XMLHttpRequest 的 open/send 方法以采集耗时和状态。 */
  xhr?: boolean;
  /** 仅在应用明确接受时保留 URL 查询参数。 */
  includeUrlQuery?: boolean;
  /** 从网络遥测中排除的 URL 前缀或表达式。 */
  ignoreUrls?: readonly (string | RegExp)[];
  /** 允许注入 W3C trace Header 的跨域 URL；同源请求默认允许。 */
  tracePropagationTargets?: readonly (string | RegExp)[];
}
