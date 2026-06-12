import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateBus } from '../StateBus.js';

describe('StateBus', () => {
  /** @type {StateBus} */
  let bus;
  beforeEach(() => {
    bus = new StateBus();
  });

  it('on/emit：订阅者收到负载', () => {
    const fn = vi.fn();
    bus.on('evt', fn);
    bus.emit('evt', 42);
    expect(fn).toHaveBeenCalledWith(42);
  });

  it('多订阅者都被触发', () => {
    const a = vi.fn();
    const b = vi.fn();
    bus.on('evt', a);
    bus.on('evt', b);
    bus.emit('evt');
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('on 返回的退订函数可移除订阅', () => {
    const fn = vi.fn();
    const off = bus.on('evt', fn);
    off();
    bus.emit('evt');
    expect(fn).not.toHaveBeenCalled();
  });

  it('off 精确移除指定处理器', () => {
    const a = vi.fn();
    const b = vi.fn();
    bus.on('evt', a);
    bus.on('evt', b);
    bus.off('evt', a);
    bus.emit('evt');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it('once 仅触发一次后自动退订', () => {
    const fn = vi.fn();
    bus.once('evt', fn);
    bus.emit('evt');
    bus.emit('evt');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('处理器异常被隔离，不影响其余订阅者', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = () => {
      throw new Error('boom');
    };
    const good = vi.fn();
    bus.on('evt', bad);
    bus.on('evt', good);
    expect(() => bus.emit('evt')).not.toThrow();
    expect(good).toHaveBeenCalledOnce();
    errSpy.mockRestore();
  });

  it('回调中安全退订自身，不破坏本次派发', () => {
    const calls = [];
    const off = bus.on('evt', () => {
      calls.push('a');
      off();
    });
    bus.on('evt', () => calls.push('b'));
    bus.emit('evt');
    bus.emit('evt');
    expect(calls).toEqual(['a', 'b', 'b']);
  });

  it('setState 合并状态并广播 state:change', () => {
    const fn = vi.fn();
    bus.on('state:change', fn);
    bus.setState({ currentStage: 1 });
    expect(bus.getState().currentStage).toBe(1);
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ currentStage: 1 }));
  });

  it('getState 返回浅拷贝，外部篡改不影响内部', () => {
    const snap = bus.getState();
    snap.currentStage = 99;
    expect(bus.getState().currentStage).toBe(0);
  });

  it('on 传入非函数抛 TypeError', () => {
    expect(() => bus.on('evt', null)).toThrow(TypeError);
  });
});
