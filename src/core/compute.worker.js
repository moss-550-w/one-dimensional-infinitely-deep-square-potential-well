/**
 * compute.worker.js — 计算密集任务的 Web Worker（module worker）。
 *
 * 主线程通过 postMessage 下发 { id, kernel, params }，Worker 调用 computeKernels
 * 中对应的纯函数并回传 { id, result }。包含 Float64Array 的字段以 Transferable
 * 形式零拷贝回传（postMessage 第二参数），避免大数组结构化克隆开销（Claude.md 七）。
 *
 * Worker 只做纯计算、不持有任何状态——状态同步统一由主线程 StateBus 收口
 * （Claude.md 5.2 / 七：Worker 仅做纯计算）。
 */
import { KERNELS } from './computeKernels.js';

self.onmessage = (e) => {
  const { id, kernel, params } = e.data;
  const fn = KERNELS[kernel];
  if (!fn) {
    self.postMessage({ id, error: `未知 kernel: ${kernel}` });
    return;
  }
  try {
    const result = fn(params);
    // 收集结果中的 ArrayBuffer 作为 Transferable，零拷贝移交主线程
    const transfers = [];
    for (const v of Object.values(result)) {
      if (ArrayBuffer.isView(v) && v.buffer instanceof ArrayBuffer) transfers.push(v.buffer);
    }
    self.postMessage({ id, result }, transfers);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
