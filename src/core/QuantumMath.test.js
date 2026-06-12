import { describe, it, expect } from 'vitest';
import {
  eigenEnergy,
  eigenEnergyRatio,
  eigenFunction,
  superpose,
  integrate,
  normalizationOf,
  isCoefficientSetNormalized,
  GIBBS_CONSTANT,
  squareWaveCoefficient,
  synthesizeHarmonics,
  fourierSquareWave,
  gibbsPeak,
  basisFunction,
  basisProduct,
  innerProduct,
  partialInnerProduct,
  superposeComplex,
  probabilityDensity,
  energyProbabilities,
  collapseToEigenstate,
  weightedStd,
  gaussianPacket,
  gaussianMomentumStd,
  momentumAmplitude,
  momentumDensity
} from './QuantumMath.js';

describe('QuantumMath · 本征能量', () => {
  it('自然单位下 E_n = n²π²/2', () => {
    expect(eigenEnergy(1)).toBeCloseTo((Math.PI * Math.PI) / 2, 10);
    expect(eigenEnergy(2)).toBeCloseTo((4 * Math.PI * Math.PI) / 2, 10);
    expect(eigenEnergy(3)).toBeCloseTo((9 * Math.PI * Math.PI) / 2, 10);
  });

  it('能级比 E_n/E_1 = n²', () => {
    expect(eigenEnergyRatio(1)).toBe(1);
    expect(eigenEnergyRatio(4)).toBe(16);
    // 与绝对能量自洽
    expect(eigenEnergy(5) / eigenEnergy(1)).toBeCloseTo(eigenEnergyRatio(5), 10);
  });

  it('物理参数可覆盖：能量随 1/L² 缩放', () => {
    const e1 = eigenEnergy(1, { wellWidth: 1 });
    const e2 = eigenEnergy(1, { wellWidth: 2 });
    expect(e1 / e2).toBeCloseTo(4, 10);
  });

  it('非正整数量子数抛错', () => {
    expect(() => eigenEnergy(0)).toThrow(RangeError);
    expect(() => eigenEnergy(-1)).toThrow(RangeError);
    expect(() => eigenEnergy(1.5)).toThrow(RangeError);
  });
});

describe('QuantumMath · 本征函数', () => {
  it('阱外取值为 0（边界条件）', () => {
    expect(eigenFunction(1, 0)).toBe(0);
    expect(eigenFunction(1, 1)).toBe(0);
    expect(eigenFunction(1, -0.1)).toBe(0);
    expect(eigenFunction(1, 1.1)).toBe(0);
  });

  it('基态在阱中心取峰值 sqrt(2/L)', () => {
    expect(eigenFunction(1, 0.5)).toBeCloseTo(Math.sqrt(2), 10);
  });

  it('每个本征态归一化 ∫|ψ_n|²dx = 1', () => {
    for (let n = 1; n <= 6; n++) {
      expect(normalizationOf(n)).toBeCloseTo(1, 6);
    }
  });

  it('本征态相互正交 ∫ψ_mψ_n dx = 0 (m≠n)', () => {
    const pairs = [
      [1, 2],
      [1, 3],
      [2, 4],
      [3, 5]
    ];
    for (const [m, n] of pairs) {
      const overlap = integrate((x) => eigenFunction(m, x) * eigenFunction(n, x), 0, 1);
      expect(overlap).toBeCloseTo(0, 6);
    }
  });
});

describe('QuantumMath · 数值积分', () => {
  it('Simpson 积分 ∫₀¹ x² dx = 1/3', () => {
    expect(integrate((x) => x * x, 0, 1)).toBeCloseTo(1 / 3, 8);
  });

  it('Simpson 积分 ∫₀^π sin x dx = 2', () => {
    expect(integrate(Math.sin, 0, Math.PI)).toBeCloseTo(2, 8);
  });
});

describe('QuantumMath · 叠加与归一化', () => {
  it('superpose 在节点处由各本征态线性合成', () => {
    // 纯基态：系数 [1] 时 ψ(0.5) = ψ_1(0.5)
    expect(superpose([1], 0.5)).toBeCloseTo(eigenFunction(1, 0.5), 10);
  });

  it('叠加态整体仍归一化（系数已归一）', () => {
    // c = (1/√2, 1/√2) 是合法归一系数
    const c = [Math.SQRT1_2, Math.SQRT1_2];
    const norm = integrate((x) => superpose(c, x) ** 2, 0, 1);
    expect(norm).toBeCloseTo(1, 6);
  });

  it('isCoefficientSetNormalized 判定 Σ|c_n|²≈1', () => {
    expect(isCoefficientSetNormalized([1])).toBe(true);
    expect(isCoefficientSetNormalized([Math.SQRT1_2, Math.SQRT1_2])).toBe(true);
    expect(isCoefficientSetNormalized([0.6, 0.8])).toBe(true);
    expect(isCoefficientSetNormalized([1, 1])).toBe(false);
  });
});

describe('QuantumMath · 傅里叶方波与吉布斯现象', () => {
  it('方波系数 b_n = 4/(πn), n=2k−1', () => {
    expect(squareWaveCoefficient(1)).toBeCloseTo(4 / Math.PI, 12);
    expect(squareWaveCoefficient(2)).toBeCloseTo(4 / (3 * Math.PI), 12);
    expect(squareWaveCoefficient(3)).toBeCloseTo(4 / (5 * Math.PI), 12);
  });

  it('部分和在区间内部收敛到 1', () => {
    for (const x of [0.25, 0.5, 0.75]) {
      expect(fourierSquareWave(200, x)).toBeCloseTo(1, 2);
    }
  });

  it('端点强制为 0（正弦基边界条件）', () => {
    expect(fourierSquareWave(20, 0)).toBeCloseTo(0, 12);
    expect(fourierSquareWave(20, 1)).toBeCloseTo(0, 10);
  });

  it('Wilbraham–Gibbs 常数与积分定义自洽 (2/π)·Si(π)', () => {
    const Si = integrate((t) => (t === 0 ? 1 : Math.sin(t) / t), 0, Math.PI, 4000);
    expect((2 / Math.PI) * Si).toBeCloseTo(GIBBS_CONSTANT, 6);
  });

  it('吉布斯过冲峰趋近 G≈1.179，且不随 N 消失', () => {
    // 真实峰值约 1.179（超出收敛值 1 约 17.9%），绝非完美逼近
    expect(gibbsPeak(20).value).toBeGreaterThan(1.17);
    expect(gibbsPeak(20).value).toBeLessThan(1.19);
    // N 增大单调趋近 G 而非趋近 1
    expect(gibbsPeak(200).value).toBeGreaterThan(1.17);
    expect(Math.abs(gibbsPeak(200).value - GIBBS_CONSTANT)).toBeLessThan(0.01);
  });

  it('过冲峰随 N 增大向跳变点靠拢且峰值单调下降趋近 G', () => {
    expect(gibbsPeak(40).x).toBeLessThan(gibbsPeak(10).x);
    expect(gibbsPeak(40).value).toBeLessThan(gibbsPeak(10).value);
    expect(gibbsPeak(40).value).toBeGreaterThan(GIBBS_CONSTANT - 0.01);
  });

  it('synthesizeHarmonics 与理想部分和等价（同系数同相位）', () => {
    const harmonics = [1, 2, 3].map((k) => ({
      n: 2 * k - 1,
      amplitude: squareWaveCoefficient(k),
      phase: 0
    }));
    expect(synthesizeHarmonics(harmonics, 0.3)).toBeCloseTo(fourierSquareWave(3, 0.3), 12);
  });
});

describe('QuantumMath · 希尔伯特内积与正交性', () => {
  it('基函数 sin(nπx/L) 取值正确', () => {
    expect(basisFunction(1, 0.5)).toBeCloseTo(1, 12); // sin(π/2)=1
    expect(basisFunction(2, 0.5)).toBeCloseTo(0, 12); // sin(π)=0
    expect(basisFunction(1, 0)).toBeCloseTo(0, 12);
  });

  it('basisProduct 为两基函数之积', () => {
    const x = 0.37;
    expect(basisProduct(1, 2, x)).toBeCloseTo(basisFunction(1, x) * basisFunction(2, x), 12);
  });

  it('内积归一：⟨n|n⟩ = 1', () => {
    for (let n = 1; n <= 5; n++) {
      expect(innerProduct(n, n)).toBeCloseTo(1, 6);
    }
  });

  it('内积正交：⟨m|n⟩ = 0 (m≠n)', () => {
    const pairs = [
      [1, 2],
      [1, 3],
      [2, 3],
      [2, 4],
      [3, 5]
    ];
    for (const [m, n] of pairs) {
      expect(innerProduct(m, n)).toBeCloseTo(0, 6);
    }
  });

  it('部分内积在上限=L 时等于完整内积', () => {
    expect(partialInnerProduct(2, 2, 1)).toBeCloseTo(innerProduct(2, 2), 6);
    expect(partialInnerProduct(1, 2, 1)).toBeCloseTo(innerProduct(1, 2), 6);
  });

  it('正交对的部分内积中途非零、终点归零（正负相消）', () => {
    // m≠n：积分到半程通常不为 0，到全程相消为 0
    const mid = partialInnerProduct(1, 2, 0.5);
    const full = partialInnerProduct(1, 2, 1);
    expect(Math.abs(full)).toBeLessThan(1e-6);
    expect(Math.abs(mid)).toBeGreaterThan(1e-3);
  });
});

describe('QuantumMath · 含时演化与概率密度', () => {
  it('t=0 时复波函数退化为实值（虚部为 0）', () => {
    const c = [Math.SQRT1_2, Math.SQRT1_2];
    const { re, im } = superposeComplex(c, 0.3, 0);
    expect(im).toBeCloseTo(0, 12);
    expect(re).toBeCloseTo(superpose(c, 0.3), 12);
  });

  it('纯本征态概率密度不随时间变化（定态）', () => {
    // 纯 ψ_2：|ψ|² = |c|²ψ_2(x)²，相位模长恒为 1
    const d0 = probabilityDensity([0, 1], 0.3, 0);
    const dT = probabilityDensity([0, 1], 0.3, 1.7);
    expect(dT).toBeCloseTo(d0, 10);
  });

  it('叠加态概率密度随时间演化（干涉项振荡）', () => {
    const c = [Math.SQRT1_2, Math.SQRT1_2];
    const d0 = probabilityDensity(c, 0.3, 0);
    const dT = probabilityDensity(c, 0.3, 0.2);
    expect(Math.abs(dT - d0)).toBeGreaterThan(1e-3);
  });

  it('含时演化保持归一化 ∫|ψ(x,t)|²dx = 1', () => {
    const c = [0.6, 0.8]; // Σ|c|²=1
    for (const t of [0, 0.5, 1.3]) {
      const norm = integrate((x) => probabilityDensity(c, x, t), 0, 1);
      expect(norm).toBeCloseTo(1, 6);
    }
  });
});

describe('QuantumMath · 能量测量概率与坍缩', () => {
  it('energyProbabilities 为 |c_n|² 且总和为 1', () => {
    const p = energyProbabilities([0.6, 0.8]);
    expect(p[0]).toBeCloseTo(0.36, 12);
    expect(p[1]).toBeCloseTo(0.64, 12);
    expect(p[0] + p[1]).toBeCloseTo(1, 12);
  });

  it('未归一化系数也归一为合法分布', () => {
    const p = energyProbabilities([1, 1]);
    expect(p).toEqual([0.5, 0.5]);
  });

  it('坍缩抽样确定性：纯态必坍缩到该本征态', () => {
    expect(collapseToEigenstate([0, 1], () => 0.99)).toBe(1);
    expect(collapseToEigenstate([1, 0], () => 0.99)).toBe(0);
  });

  it('坍缩抽样按 |c_n|² 选择对应分桶（rng 可注入）', () => {
    const c = [0.6, 0.8]; // P=[0.36,0.64]
    expect(collapseToEigenstate(c, () => 0.2)).toBe(0); // 0.2 < 0.36
    expect(collapseToEigenstate(c, () => 0.5)).toBe(1); // 0.36 ≤ 0.5
  });

  it('大样本坍缩频率收敛到理论概率', () => {
    const c = [0.6, 0.8]; // P=[0.36,0.64]
    // 线性同余发生器：确定性可复现
    let seed = 12345;
    const rng = () => {
      seed = (1103515245 * seed + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const counts = [0, 0];
    const N = 20000;
    for (let i = 0; i < N; i++) counts[collapseToEigenstate(c, rng)]++;
    expect(counts[0] / N).toBeCloseTo(0.36, 1);
    expect(counts[1] / N).toBeCloseTo(0.64, 1);
  });
});

describe('QuantumMath · 不确定性原理（波包与动量变换）', () => {
  it('weightedStd 计算加权均值与标准差', () => {
    // 对称双点 ±1 等权：均值 0，标准差 1
    const { mean, std } = weightedStd([-1, 1], [1, 1]);
    expect(mean).toBeCloseTo(0, 12);
    expect(std).toBeCloseTo(1, 12);
  });

  it('高斯波包归一化 ∫|ψ|²dx ≈ 1（σ 远离边界）', () => {
    const sigma = 0.05;
    const norm = integrate((x) => gaussianPacket(x, 0.5, sigma) ** 2, 0, 1, 4000);
    expect(norm).toBeCloseTo(1, 4);
  });

  it('高斯波包位置标准差 Δx ≈ σ（数值积分核对）', () => {
    const sigma = 0.06;
    const x0 = 0.5;
    const w = (x) => gaussianPacket(x, x0, sigma) ** 2;
    const mean = integrate((x) => x * w(x), 0, 1, 4000) / integrate(w, 0, 1, 4000);
    const varr =
      integrate((x) => (x - mean) ** 2 * w(x), 0, 1, 4000) / integrate(w, 0, 1, 4000);
    expect(Math.sqrt(varr)).toBeCloseTo(sigma, 3);
  });

  it('动量标准差 Δp = ħ/(2σ)，与 Δx 乘积达海森堡下界 ħ/2', () => {
    const sigma = 0.05;
    const dp = gaussianMomentumStd(sigma);
    expect(dp).toBeCloseTo(1 / (2 * sigma), 12);
    expect(sigma * dp).toBeCloseTo(0.5, 12); // Δx·Δp = ħ/2 (ħ=1)
  });

  it('压缩位置 → 动量展宽（σ 越小 Δp 越大）', () => {
    expect(gaussianMomentumStd(0.02)).toBeGreaterThan(gaussianMomentumStd(0.1));
  });

  it('momentumAmplitude/Density：高斯波包变换后峰值在 p=0', () => {
    const sigma = 0.06;
    const psi = (x) => gaussianPacket(x, 0.5, sigma);
    const d0 = momentumDensity(psi, 0, 0, 1);
    const dHigh = momentumDensity(psi, 40, 0, 1);
    expect(d0).toBeGreaterThan(dHigh); // 中心动量密度最大
  });

  it('动量变换数值宽度随位置压缩而展宽', () => {
    const wide = (x) => gaussianPacket(x, 0.5, 0.12); // 位置宽 → 动量窄
    const narrow = (x) => gaussianPacket(x, 0.5, 0.04); // 位置窄 → 动量宽
    // 在中等动量 p=15 处：窄波包(动量宽)残留更多密度
    const dWide = momentumDensity(wide, 15, 0, 1);
    const dNarrow = momentumDensity(narrow, 15, 0, 1);
    expect(dNarrow).toBeGreaterThan(dWide);
  });
});
