
'use strict';
/* =====================================================================
   ENGINE: chỉ báo, vùng giá, sóng Elliott, tín hiệu + lý do, backtest
   Mọi tính toán dùng dữ liệu nến đã đóng, không nhìn trước tương lai.
   ===================================================================== */
const NaNs = n => new Array(n).fill(NaN);
const isN = v => typeof v === 'number' && !isNaN(v);

function fmt(p) {
  if (!isFinite(p)) return '–';
  const a = Math.abs(p);
  const d = a >= 1000 ? 2 : a >= 100 ? 3 : a >= 1 ? 4 : a >= 0.1 ? 5 : a >= 0.01 ? 6 : 8;
  return p.toFixed(d);
}

function sma(a, n) {
  const o = NaNs(a.length);
  for (let i = n - 1; i < a.length; i++) {
    let s = 0, ok = true;
    for (let j = i - n + 1; j <= i; j++) {
      const v = a[j];
      if (!isN(v)) { ok = false; break; }
      s += v;
    }
    if (ok) o[i] = s / n;
  }
  return o;
}

function ema(a, n) {
  const out = NaNs(a.length), k = 2 / (n + 1);
  let cnt = 0, sum = 0, prev = NaN;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!isN(v)) continue;
    if (!isN(prev)) {
      cnt++; sum += v;
      if (cnt === n) { prev = sum / n; out[i] = prev; }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

function rsiW(c, n) {
  const out = NaNs(c.length);
  if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = c[i] - c[i - 1];
    g += Math.max(d, 0); l += Math.max(-d, 0);
  }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

function atrW(h, l, c, n) {
  const o = NaNs(h.length);
  if (h.length <= n) return o;
  const tr = [0];
  for (let i = 1; i < h.length; i++) {
    tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
  }
  let s = 0;
  for (let i = 1; i <= n; i++) s += tr[i];
  let a = s / n; o[n] = a;
  for (let i = n + 1; i < h.length; i++) { a = (a * (n - 1) + tr[i]) / n; o[i] = a; }
  return o;
}

function calcInd(o, h, l, c, v) {
  const n = c.length;
  const e12 = ema(c, 12), e26 = ema(c, 26);
  const macd = e12.map((x, i) => x - e26[i]);
  const sig = ema(macd, 9);
  const hist = macd.map((x, i) => x - sig[i]);

  // KDJ (14,3,3)
  const K = NaNs(n), D = NaNs(n), J = NaNs(n);
  let pk = 50, pd = 50;
  for (let i = 13; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - 13; j <= i; j++) { if (h[j] > hh) hh = h[j]; if (l[j] < ll) ll = l[j]; }
    const rsv = hh === ll ? 50 : (c[i] - ll) / (hh - ll) * 100;
    pk = pk * 2 / 3 + rsv / 3;
    pd = pd * 2 / 3 + pk / 3;
    K[i] = pk; D[i] = pd; J[i] = 3 * pk - 2 * pd;
  }

  // Stochastic RSI (14,14,3,3)
  const rsi = rsiW(c, 14);
  const st = NaNs(n);
  for (let i = 27; i < n; i++) {
    let mn = Infinity, mx = -Infinity, ok = true;
    for (let j = i - 13; j <= i; j++) {
      if (!isN(rsi[j])) { ok = false; break; }
      if (rsi[j] < mn) mn = rsi[j];
      if (rsi[j] > mx) mx = rsi[j];
    }
    if (ok) st[i] = mx === mn ? 50 : (rsi[i] - mn) / (mx - mn) * 100;
  }
  const sk = sma(st, 3), sd = sma(sk, 3);

  // Bollinger Bands (20, 2)
  const bbMid = sma(c, 20), bbUp = NaNs(n), bbLo = NaNs(n), bbBw = NaNs(n);
  for (let i = 19; i < n; i++) {
    let s = 0;
    for (let j = i - 19; j <= i; j++) s += (c[j] - bbMid[i]) * (c[j] - bbMid[i]);
    const sd = Math.sqrt(s / 20);
    bbUp[i] = bbMid[i] + 2 * sd; bbLo[i] = bbMid[i] - 2 * sd;
    bbBw[i] = bbMid[i] ? (bbUp[i] - bbLo[i]) / bbMid[i] : NaN;
  }

  // Ichimoku (9,26,52): mây tại nến i lấy từ dữ liệu cách đó 26 nến, nên không nhìn trước tương lai
  const mid = (p, i) => { let a = -Infinity, b = Infinity; for (let j = i - p + 1; j <= i; j++) { if (h[j] > a) a = h[j]; if (l[j] < b) b = l[j]; } return (a + b) / 2; };
  const tenkan = NaNs(n), kijun = NaNs(n), spanA = NaNs(n + 26), spanB = NaNs(n + 26);
  for (let i = 0; i < n; i++) {
    if (i >= 8) tenkan[i] = mid(9, i);
    if (i >= 25) { kijun[i] = mid(26, i); spanA[i + 26] = (tenkan[i] + kijun[i]) / 2; }
    if (i >= 51) spanB[i + 26] = mid(52, i);
  }

  return {
    tenkan, kijun, spanA, spanB,
    ema50: ema(c, 50), ema200: ema(c, 200),
    bbMid, bbUp, bbLo, bbBw,
    macd, sig, hist, K, D, J, rsi, sk, sd,
    atr: atrW(h, l, c, 14), volSma: sma(v, 20)
  };
}

/* ---------- Vùng hỗ trợ / kháng cự từ đỉnh đáy fractal ---------- */
function fractals(h, l, n = 5) {
  const out = [];
  for (let j = n; j < h.length - n; j++) {
    let isH = true, isL = true;
    for (let k = 1; k <= n; k++) {
      if (h[j] <= h[j - k] || h[j] < h[j + k]) isH = false;
      if (l[j] >= l[j - k] || l[j] > l[j + k]) isL = false;
      if (!isH && !isL) break;
    }
    if (isH) out.push({ j, p: h[j], conf: j + n, t: 'H' });
    if (isL) out.push({ j, p: l[j], conf: j + n, t: 'L' });
  }
  return out;
}

function zonesAt(piv, i, atrI, maxBack = 300) {
  if (!isN(atrI)) return [];
  const ps = [];
  for (const q of piv) {
    if (q.conf > i) break;
    if (q.j >= i - maxBack) ps.push(q);
  }
  ps.sort((a, b) => a.p - b.p);
  const tol = 0.7 * atrI;
  const zs = [];
  let cur = null;
  for (const q of ps) {
    if (cur && q.p - cur.max <= tol && q.p - cur.min <= 3 * tol) {
      cur.max = q.p; cur.n++; cur.sum += q.p;
    } else {
      if (cur) zs.push(cur);
      cur = { min: q.p, max: q.p, n: 1, sum: q.p };
    }
  }
  if (cur) zs.push(cur);
  return zs.filter(z => z.n >= 2).map(z => ({
    lo: z.min - 0.1 * atrI, hi: z.max + 0.1 * atrI, mid: z.sum / z.n, touches: z.n
  }));
}

/* ---------- ZigZag theo ATR (nền cho Elliott) ---------- */
function zigzag(h, l, atr, k) {
  const piv = [];
  let dir = 0, hi = NaN, hiI = -1, lo = NaN, loI = -1;
  for (let i = 0; i < h.length; i++) {
    if (!isN(atr[i])) continue;
    if (hiI < 0) { hi = h[i]; hiI = i; lo = l[i]; loI = i; continue; }
    const th = k * atr[i];
    if (dir === 0) {
      if (h[i] > hi) { hi = h[i]; hiI = i; }
      if (l[i] < lo) { lo = l[i]; loI = i; }
      if (h[i] - lo >= th && loI < i) {
        piv.push({ j: loI, p: lo, t: 'L', conf: i }); dir = 1; hi = h[i]; hiI = i;
      } else if (hi - l[i] >= th && hiI < i) {
        piv.push({ j: hiI, p: hi, t: 'H', conf: i }); dir = -1; lo = l[i]; loI = i;
      }
    } else if (dir === 1) {
      if (h[i] > hi) { hi = h[i]; hiI = i; }
      else if (hi - l[i] >= th) {
        piv.push({ j: hiI, p: hi, t: 'H', conf: i }); dir = -1; lo = l[i]; loI = i;
      }
    } else {
      if (l[i] < lo) { lo = l[i]; loI = i; }
      else if (h[i] - lo >= th) {
        piv.push({ j: loI, p: lo, t: 'L', conf: i }); dir = 1; hi = h[i]; hiI = i;
      }
    }
  }
  const tent = dir === 1 ? { j: hiI, p: hi, t: 'H' } : dir === -1 ? { j: loI, p: lo, t: 'L' } : null;
  return { piv, tent };
}

/* ---------- Elliott: nhận diện sóng đẩy 5 sóng theo các quy tắc cứng ---------- */
function checkImpulse(pts, full) {
  const sign = pts[0].t === 'L' ? 1 : -1;
  const x = pts.map(q => q.p * sign);
  const w1 = x[1] - x[0], w3 = x[3] - x[2];
  const w2r = (x[1] - x[2]) / w1, w4r = (x[3] - x[4]) / w3;
  if (!(w1 > 0 && x[2] > x[0] && x[2] < x[1] && w2r >= 0.2 &&
        x[3] > x[1] && x[4] > x[1] && x[4] < x[3] && w4r >= 0.15 && w4r <= 0.786)) return null;
  if (full) {
    if (!(x[5] > x[4])) return null;
    const w5 = x[5] - x[4];
    if (w3 < w1 && w3 < w5) return null;
    return { sign, w1, w3, w5, w2r, w4r, full: true };
  }
  if (w3 < w1) return null;
  return { sign, w1, w3, w2r, w4r, full: false, target: (x[4] + w1) * sign };
}

function ewText(ev) {
  const r = ev.r, up = r.sign > 0, dir = up ? 'tăng' : 'giảm';
  if (ev.kind === 'w5') {
    return `Elliott: cấu trúc sóng 1-2-3-4 ${dir} hợp lệ. Sóng 2 hồi ${Math.round(r.w2r * 100)}% sóng 1, ` +
      `sóng 3 dài ${(r.w3 / r.w1).toFixed(2)} lần sóng 1, sóng 4 hồi ${Math.round(r.w4r * 100)}% sóng 3 ` +
      `và không chồng lên sóng 1. Kỳ vọng sóng 5 ${dir}, mục tiêu tham khảo ~${fmt(ev.target)}`;
  }
  return `Elliott: 5 sóng ${dir} có vẻ đã hoàn tất (sóng 3 không phải sóng ngắn nhất, sóng 4 không chồng sóng 1). ` +
    `Sau đó thường có nhịp điều chỉnh A-B-C ngược chiều, nên ${ev.side === 'buy' ? 'canh mua đảo chiều' : 'chốt lời hoặc canh bán'}`;
}

function elliottEvents(piv) {
  const ev = [];
  for (let k = 4; k < piv.length; k++) {
    if (k >= 5) {
      const pts = piv.slice(k - 5, k + 1);
      const r = checkImpulse(pts, true);
      if (r) ev.push({ kind: 'done', i: piv[k].conf, pts, r, side: r.sign > 0 ? 'sell' : 'buy' });
    }
    const p5 = piv.slice(k - 4, k + 1);
    const r5 = checkImpulse(p5, false);
    if (r5) ev.push({ kind: 'w5', i: piv[k].conf, pts: p5, r: r5, side: r5.sign > 0 ? 'buy' : 'sell', target: r5.target });
  }
  ev.forEach(e => { e.text = ewText(e); });
  return ev;
}

/* ---------- Fibonacci: lấy nhịp sóng gần nhất đã xác nhận từ ZigZag ---------- */
function fibSwing(piv, i, atr) {
  let k = piv.length - 1;
  while (k >= 0 && piv[k].conf > i) k--;
  if (k < 1 || !isN(atr)) return null;
  const b = piv[k], a = piv[k - 1];
  if (Math.abs(b.p - a.p) < 3 * atr) return null;
  const up = b.t === 'H';
  const hi = up ? b.p : a.p, lo = up ? a.p : b.p, d = hi - lo;
  return { up, hi, lo, d, a, b, lv: r => up ? hi - r * d : lo + r * d, ex: r => up ? lo + r * d : hi - r * d };
}

/* ---------- Backtest ---------- */
function simulate(sig, h, l, c, n, MAXB) {
  const e = sig.entry, sl = sig.sl, tp = sig.tp, risk = Math.abs(e - sl), buy = sig.side === 'buy';
  const fee = (e * 0.002) / risk; // phí 0,1% mỗi chiều quy ra R
  const end = Math.min(n - 1, sig.i + MAXB);
  for (let j = sig.i + 1; j <= end; j++) {
    const hitSL = buy ? l[j] <= sl : h[j] >= sl;
    const hitTP = buy ? h[j] >= tp : l[j] <= tp;
    if (hitSL) return { R: -1 - fee, status: 'sl', exit: j, bars: j - sig.i };
    if (hitTP) return { R: sig.rr - fee, status: 'tp', exit: j, bars: j - sig.i };
  }
  if (sig.i + MAXB <= n - 1) {
    const j = sig.i + MAXB;
    const R = (buy ? c[j] - e : e - c[j]) / risk - fee;
    return { R, status: 'time', exit: j, bars: MAXB };
  }
  return { R: null, status: 'open', exit: null, bars: n - 1 - sig.i };
}

function calcStats(trades) {
  const n = trades.length;
  if (!n) return { n: 0, wr: 0, exp: 0, pf: 0, dd: 0, total: 0 };
  let gw = 0, gl = 0, cum = 0, peak = 0, dd = 0, wins = 0;
  for (const t of trades) {
    if (t.R > 0) { gw += t.R; wins++; } else gl += -t.R;
    cum += t.R; if (cum > peak) peak = cum;
    if (peak - cum > dd) dd = peak - cum;
  }
  return { n, wr: wins / n, exp: cum / n, pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0), dd, total: cum };
}

/* ---------- Phân tích chính ---------- */
const TYPE_LABEL = { macd: 'MACD', kdj: 'KDJ', srsi: 'StochRSI', sr: 'Vùng giá', bb: 'Bollinger', ew: 'Elliott', vol: 'Volume', trend: 'Xu hướng', ichi: 'Ichimoku', fib: 'Fibonacci' };

function analyze(C, opts) {
  opts = opts || {};
  const RR = opts.rr || 2, SLATR = opts.slAtr || 1.5, MAXB = opts.maxBars || 60;
  const n = C.length;
  const o = C.map(x => x.o), h = C.map(x => x.h), l = C.map(x => x.l), c = C.map(x => x.c), v = C.map(x => x.v);
  const ind = calcInd(o, h, l, c, v);
  const piv = fractals(h, l, 5);
  const zz = zigzag(h, l, ind.atr, 2.5);
  const ew = elliottEvents(zz.piv);

  const trig = Array.from({ length: n }, () => []);
  const add = (i, side, type, pts, txt, confirm) => trig[i].push({ side, type, pts, txt, confirm: !!confirm });
  const F0 = x => x.toFixed(0), F1 = x => x.toFixed(1);

  for (const e of ew) if (e.i < n) add(e.i, e.side, 'ew', e.kind === 'w5' ? 1.5 : 1.2, e.text);

  const START = 40;
  for (let i = START; i < n; i++) {
    const atr = ind.atr[i];
    // MACD
    if (isN(ind.hist[i]) && isN(ind.hist[i - 1])) {
      if (ind.hist[i - 1] <= 0 && ind.hist[i] > 0) {
        const below = ind.macd[i] < 0;
        add(i, 'buy', 'macd', below ? 1.5 : 1.0, below
          ? 'MACD cắt lên đường tín hiệu khi vẫn dưới vạch 0: lực giảm đã suy yếu, động lượng bắt đầu quay đầu tăng'
          : 'MACD cắt lên đường tín hiệu và nằm trên vạch 0: động lượng tăng được củng cố');
      } else if (ind.hist[i - 1] >= 0 && ind.hist[i] < 0) {
        const above = ind.macd[i] > 0;
        add(i, 'sell', 'macd', above ? 1.5 : 1.0, above
          ? 'MACD cắt xuống đường tín hiệu khi còn trên vạch 0: đà tăng đang cạn, động lượng quay đầu giảm'
          : 'MACD cắt xuống đường tín hiệu và nằm dưới vạch 0: động lượng giảm được củng cố');
      }
    }
    // KDJ
    if (isN(ind.K[i - 1]) && isN(ind.D[i - 1])) {
      const K = ind.K[i], D = ind.D[i], J = ind.J[i];
      if (ind.K[i - 1] <= ind.D[i - 1] && K > D) {
        const pts = K < 30 ? 1.2 : K < 50 ? 0.6 : 0.3;
        add(i, 'buy', 'kdj', pts, `KDJ: K (${F0(K)}) cắt lên D (${F0(D)}) ` +
          (K < 30 ? 'trong vùng quá bán (<30), tín hiệu đảo chiều tăng đáng tin hơn' :
           K < 50 ? 'ở nửa dưới, đà tăng mới hình thành' : 'ở vùng cao, chỉ là tín hiệu yếu') +
          (J < 10 ? `; J chạm vùng cực thấp (${F0(J)})` : ''));
      } else if (ind.K[i - 1] >= ind.D[i - 1] && K < D) {
        const pts = K > 70 ? 1.2 : K > 50 ? 0.6 : 0.3;
        add(i, 'sell', 'kdj', pts, `KDJ: K (${F0(K)}) cắt xuống D (${F0(D)}) ` +
          (K > 70 ? 'trong vùng quá mua (>70), tín hiệu đảo chiều giảm đáng tin hơn' :
           K > 50 ? 'ở nửa trên, đà giảm mới hình thành' : 'ở vùng thấp, chỉ là tín hiệu yếu') +
          (J > 90 ? `; J chạm vùng cực cao (${F0(J)})` : ''));
      }
    }
    // Stochastic RSI
    if (isN(ind.sk[i - 1]) && isN(ind.sd[i - 1]) && isN(ind.sk[i]) && isN(ind.sd[i])) {
      const K = ind.sk[i], D = ind.sd[i];
      if (ind.sk[i - 1] <= ind.sd[i - 1] && K > D) {
        const pts = K < 20 ? 1.2 : K < 50 ? 0.5 : 0.2;
        add(i, 'buy', 'srsi', pts, `StochRSI: %K (${F0(K)}) cắt lên %D (${F0(D)}) ` +
          (K < 20 ? 'từ vùng quá bán (<20): RSI vừa chạm đáy chu kỳ và hồi lên' :
           K < 50 ? 'ở nửa dưới: RSI đang hồi phục' : 'ở vùng cao: tín hiệu yếu'));
      } else if (ind.sk[i - 1] >= ind.sd[i - 1] && K < D) {
        const pts = K > 80 ? 1.2 : K > 50 ? 0.5 : 0.2;
        add(i, 'sell', 'srsi', pts, `StochRSI: %K (${F0(K)}) cắt xuống %D (${F0(D)}) ` +
          (K > 80 ? 'từ vùng quá mua (>80): RSI vừa chạm đỉnh chu kỳ và quay xuống' :
           K > 50 ? 'ở nửa trên: RSI bắt đầu suy yếu' : 'ở vùng thấp: tín hiệu yếu'));
      }
    }
    // Vùng hỗ trợ / kháng cự
    if (isN(atr)) {
      const zs = zonesAt(piv, i, atr);
      const spike = isN(ind.volSma[i]) && v[i] > 1.5 * ind.volSma[i];
      let bestBuy = null, bestSell = null;
      for (const z of zs) {
        const rng = `${fmt(z.lo)}–${fmt(z.hi)}`;
        if (z.mid < c[i] && l[i] <= z.hi + 0.1 * atr && l[i] >= z.lo - 0.6 * atr && c[i] > z.hi && c[i] > o[i]) {
          if (!bestBuy || z.touches > bestBuy.touches)
            bestBuy = { touches: z.touches, txt: `Giá chạm vùng hỗ trợ ${rng} (đã phản ứng ${z.touches} lần) rồi đóng cửa trên vùng bằng nến xanh: lực mua đang bảo vệ vùng này` };
        }
        if (z.mid > c[i] && h[i] >= z.lo - 0.1 * atr && h[i] <= z.hi + 0.6 * atr && c[i] < z.lo && c[i] < o[i]) {
          if (!bestSell || z.touches > bestSell.touches)
            bestSell = { touches: z.touches, txt: `Giá chạm vùng kháng cự ${rng} (đã bị từ chối ${z.touches} lần) rồi đóng cửa dưới vùng bằng nến đỏ: phe bán đang chặn giá` };
        }
        if (spike && c[i] > z.hi && c[i - 1] <= z.hi && c[i] > o[i]) {
          if (!bestBuy || z.touches > bestBuy.touches)
            bestBuy = { touches: z.touches, txt: `Phá vỡ kháng cự ${rng} với volume gấp ${(v[i] / ind.volSma[i]).toFixed(1)} lần trung bình: kháng cự cũ có thể chuyển thành hỗ trợ` };
        }
        if (spike && c[i] < z.lo && c[i - 1] >= z.lo && c[i] < o[i]) {
          if (!bestSell || z.touches > bestSell.touches)
            bestSell = { touches: z.touches, txt: `Thủng hỗ trợ ${rng} với volume gấp ${(v[i] / ind.volSma[i]).toFixed(1)} lần trung bình: hỗ trợ cũ có thể chuyển thành kháng cự` };
        }
      }
      if (bestBuy) add(i, 'buy', 'sr', 1.5, bestBuy.txt);
      if (bestSell) add(i, 'sell', 'sr', 1.5, bestSell.txt);
    }
    // Bollinger Bands
    if (isN(ind.bbLo[i]) && isN(ind.bbLo[i - 1])) {
      const lo = ind.bbLo[i], up = ind.bbUp[i], mid = ind.bbMid[i];
      let minBw = Infinity;
      for (let j = Math.max(20, i - 100); j < i; j++) if (isN(ind.bbBw[j]) && ind.bbBw[j] < minBw) minBw = ind.bbBw[j];
      const squeeze = isFinite(minBw) && ind.bbBw[i - 1] <= minBw * 1.15;
      const spikeB = isN(ind.volSma[i]) && v[i] > 1.5 * ind.volSma[i];
      let bb = null;
      if (squeeze && spikeB && c[i] > up && c[i - 1] <= ind.bbUp[i - 1] && c[i] > o[i])
        bb = { side: 'buy', pts: 1.5, txt: `Bollinger: dải co hẹp (squeeze) rồi giá đóng cửa vượt dải trên (${fmt(up)}) kèm volume lớn: biến động đang bung ra theo hướng tăng` };
      else if (squeeze && spikeB && c[i] < lo && c[i - 1] >= ind.bbLo[i - 1] && c[i] < o[i])
        bb = { side: 'sell', pts: 1.5, txt: `Bollinger: dải co hẹp (squeeze) rồi giá đóng cửa thủng dải dưới (${fmt(lo)}) kèm volume lớn: biến động đang bung ra theo hướng giảm` };
      else if (l[i] <= lo && c[i] > lo && c[i] > o[i])
        bb = { side: 'buy', pts: 1.0, txt: `Bollinger: giá đâm thủng dải dưới (${fmt(lo)}) rồi đóng cửa trở lại trong dải bằng nến xanh: bán quá đà, giá có xu hướng hồi về đường giữa ${fmt(mid)}` };
      else if (h[i] >= up && c[i] < up && c[i] < o[i])
        bb = { side: 'sell', pts: 1.0, txt: `Bollinger: giá vọt lên dải trên (${fmt(up)}) rồi đóng cửa trở lại trong dải bằng nến đỏ: mua quá đà, giá có xu hướng lùi về đường giữa ${fmt(mid)}` };
      if (bb) add(i, bb.side, 'bb', bb.pts, bb.txt);
    }
    // Ichimoku
    {
      const sa = ind.spanA[i], sb = ind.spanB[i], tk = ind.tenkan[i], kj = ind.kijun[i], tkp = ind.tenkan[i - 1], kjp = ind.kijun[i - 1];
      if (isN(sa) && isN(sb) && isN(tk) && isN(kj) && isN(tkp) && isN(kjp)) {
        const top = Math.max(sa, sb), bot = Math.min(sa, sb);
        const pt = Math.max(ind.spanA[i - 1], ind.spanB[i - 1]), pb = Math.min(ind.spanA[i - 1], ind.spanB[i - 1]);
        if (isN(pt) && c[i - 1] <= pt && c[i] > top && c[i] > o[i])
          add(i, 'buy', 'ichi', 1.2, `Ichimoku: giá đóng cửa vượt lên trên đám mây (${fmt(bot)}–${fmt(top)}): xu hướng có thể chuyển sang tăng`);
        else if (isN(pb) && c[i - 1] >= pb && c[i] < bot && c[i] < o[i])
          add(i, 'sell', 'ichi', 1.2, `Ichimoku: giá đóng cửa thủng xuống dưới đám mây (${fmt(bot)}–${fmt(top)}): xu hướng có thể chuyển sang giảm`);
        else if (tkp <= kjp && tk > kj)
          add(i, 'buy', 'ichi', c[i] > top ? 1.5 : c[i] >= bot ? 0.5 : 0.2, c[i] > top ? 'Ichimoku: Tenkan cắt lên Kijun khi giá trên mây: tín hiệu tăng mạnh theo xu hướng' : c[i] >= bot ? 'Ichimoku: Tenkan cắt lên Kijun nhưng giá còn trong mây: tín hiệu yếu' : 'Ichimoku: Tenkan cắt lên Kijun nhưng giá còn dưới mây: chỉ là nhịp hồi, chưa đổi xu hướng');
        else if (tkp >= kjp && tk < kj)
          add(i, 'sell', 'ichi', c[i] < bot ? 1.5 : c[i] <= top ? 0.5 : 0.2, c[i] < bot ? 'Ichimoku: Tenkan cắt xuống Kijun khi giá dưới mây: tín hiệu giảm mạnh theo xu hướng' : c[i] <= top ? 'Ichimoku: Tenkan cắt xuống Kijun nhưng giá còn trong mây: tín hiệu yếu' : 'Ichimoku: Tenkan cắt xuống Kijun nhưng giá còn trên mây: chỉ là nhịp điều chỉnh');
      }
    }
    // Fibonacci retracement
    {
      const fs = fibSwing(zz.piv, i, atr);
      if (fs) {
        const L5 = fs.lv(0.5), L618 = fs.lv(0.618), L786 = fs.lv(0.786);
        if (fs.up && l[i] <= L5 && l[i] >= L786 - 0.3 * atr && c[i] > L618 && c[i] > o[i])
          add(i, 'buy', 'fib', 1.3, `Fibonacci: giá hồi về vùng vàng 50–61,8% (${fmt(L618)}–${fmt(L5)}) của nhịp tăng ${fmt(fs.lo)}→${fmt(fs.hi)} rồi bật lên bằng nến xanh: thường là nhịp hồi xong để đi tiếp, mục tiêu tham khảo ${fmt(fs.ex(1.272))}`);
        else if (!fs.up && h[i] >= L5 && h[i] <= L786 + 0.3 * atr && c[i] < L618 && c[i] < o[i])
          add(i, 'sell', 'fib', 1.3, `Fibonacci: giá hồi lên vùng vàng 50–61,8% (${fmt(L5)}–${fmt(L618)}) của nhịp giảm ${fmt(fs.hi)}→${fmt(fs.lo)} rồi bị đẩy xuống bằng nến đỏ: thường là nhịp hồi xong để giảm tiếp, mục tiêu tham khảo ${fmt(fs.ex(1.272))}`);
      }
    }
    // Volume xác nhận
    if (isN(ind.volSma[i]) && v[i] > 1.8 * ind.volSma[i]) {
      const x = (v[i] / ind.volSma[i]).toFixed(1);
      if (c[i] > o[i]) add(i, 'buy', 'vol', 0.5, `Volume gấp ${x} lần trung bình 20 nến trên nến xanh: dòng tiền mua xác nhận`, true);
      else if (c[i] < o[i]) add(i, 'sell', 'vol', 0.5, `Volume gấp ${x} lần trung bình 20 nến trên nến đỏ: dòng tiền bán xác nhận`, true);
    }
  }

  const trendAt = i => {
    const a = ind.ema50[i], b = ind.ema200[i];
    if (!isN(a) || !isN(b)) return 0;
    if (a > b && c[i] > a) return 1;
    if (a < b && c[i] < a) return -1;
    return 0;
  };

  const WIN = 3;
  function scoreAt(i) {
    const best = { buy: {}, sell: {} };
    for (let j = Math.max(0, i - WIN + 1); j <= i; j++) {
      for (const t of trig[j]) {
        const cur = best[t.side][t.type];
        if (!cur || t.pts > cur.pts || (t.pts === cur.pts && j > cur.j)) best[t.side][t.type] = Object.assign({ j }, t);
      }
    }
    const tr = trendAt(i);
    const out = {};
    for (const side of ['buy', 'sell']) {
      const items = Object.values(best[side]).sort((a, b) => b.pts - a.pts);
      let s = items.reduce((a, x) => a + x.pts, 0);
      const distinct = items.filter(x => !x.confirm).length;
      let adj = 0;
      if (items.length) {
        const want = side === 'buy' ? 1 : -1;
        if (tr === want) adj = 0.5; else if (tr === -want) adj = -0.5;
        if (adj !== 0) {
          const up = tr > 0;
          items.push({
            type: 'trend', side, pts: adj, j: i, confirm: true,
            txt: adj > 0
              ? `Thuận xu hướng chính: EMA50 ${up ? 'trên' : 'dưới'} EMA200 và giá ${up ? 'trên' : 'dưới'} EMA50`
              : `Ngược xu hướng chính (EMA50 ${up ? 'trên' : 'dưới'} EMA200, giá ${up ? 'trên' : 'dưới'} EMA50): rủi ro cao hơn nên bị trừ điểm`
          });
        }
      }
      s = Math.max(0, s + adj);
      out[side] = { score: s, items, distinct, atBar: trig[i].some(t => t.side === side) };
    }
    return out;
  }

  // Sinh tín hiệu
  const signals = [];
  const lastAt = { buy: -99, sell: -99 };
  for (let i = START; i < n; i++) {
    const sc = scoreAt(i);
    const side = sc.buy.score >= sc.sell.score ? 'buy' : 'sell';
    const s = sc[side];
    if (s.score < 3 || s.distinct < 2 || !s.atBar) continue;
    if (i - lastAt[side] < 6) continue;
    const atr = ind.atr[i];
    if (!isN(atr)) continue;
    const risk = SLATR * atr, entry = c[i];
    const sig = {
      i, side, score: s.score, strength: Math.round(Math.min(100, s.score / 8 * 100)),
      entry, atr, risk, rr: RR,
      sl: side === 'buy' ? entry - risk : entry + risk,
      tp: side === 'buy' ? entry + RR * risk : entry - RR * risk,
      items: s.items, t: C[i].t
    };
    sig.res = simulate(sig, h, l, c, n, MAXB);
    signals.push(sig);
    lastAt[side] = i;
  }

  const closed = signals.filter(s => s.res.status !== 'open').map(s => ({ i: s.i, side: s.side, R: s.res.R }));
  const cut = Math.floor(n * 0.7);
  const stats = {
    all: calcStats(closed),
    buy: calcStats(closed.filter(t => t.side === 'buy')),
    sell: calcStats(closed.filter(t => t.side === 'sell')),
    oos: calcStats(closed.filter(t => t.i >= cut))
  };

  // Trạng thái hiện tại (nến đóng gần nhất)
  const sc = scoreAt(n - 1);
  const side = sc.buy.score >= sc.sell.score ? 'buy' : 'sell';
  const top = sc[side];
  const ok = top.score >= 3 && top.distinct >= 2;
  const now = {
    side, ok, strong: ok && top.score >= 5, score: top.score, items: top.items,
    strength: Math.round(Math.min(100, top.score / 8 * 100)), scores: { buy: sc.buy.score, sell: sc.sell.score }
  };

  const zonesNow = zonesAt(piv, n - 1, ind.atr[n - 1]);
  const ewLast = ew.length ? ew[ew.length - 1] : null;

  // ---- Dự báo cho các nến sắp tới: mỗi chỉ báo bỏ một phiếu theo trạng thái hiện tại (không cần chờ nến cắt nhau) ----
  const fsNow = fibSwing(zz.piv, n - 1, ind.atr[n - 1]);
  const votes = [], vote = (type, v, txt) => votes.push({ type, v, txt });
  {
    const i = n - 1, a = ind.spanA[i], b = ind.spanB[i], tk = ind.tenkan[i], kj = ind.kijun[i];
    if (isN(a) && isN(b) && isN(tk) && isN(kj)) {
      const tp = Math.max(a, b), bt = Math.min(a, b);
      const pos = c[i] > tp ? 1 : c[i] < bt ? -1 : 0, cr = tk > kj ? 1 : -1, ch = i >= 26 ? (c[i] > c[i - 26] ? 1 : -1) : 0;
      vote('ichi', pos * 0.6 + cr * 0.25 + ch * 0.15, `Giá ${pos > 0 ? 'nằm trên' : pos < 0 ? 'nằm dưới' : 'đang ở trong'} mây (${fmt(bt)}–${fmt(tp)}), Tenkan ${cr > 0 ? 'trên' : 'dưới'} Kijun, Chikou ${ch > 0 ? 'trên' : 'dưới'} giá 26 nến trước` + (pos === 0 ? ': vùng giằng co, chưa rõ hướng' : ''));
    }
    const hh = ind.hist[i], hp = ind.hist[i - 1];
    if (isN(hh) && isN(hp)) vote('macd', (hh > 0 ? 0.5 : -0.5) + (hh > hp ? 0.5 : -0.5), `Histogram MACD ${hh > 0 ? 'dương' : 'âm'} và ${hh > hp ? 'đang tăng dần' : 'đang giảm dần'}: động lượng ${(hh > 0) === (hh > hp) ? 'đang được củng cố' : 'đang suy yếu'}`);
    const K = ind.K[i], D = ind.D[i];
    if (isN(K) && isN(D)) vote('kdj', (K > D ? 0.5 : -0.5) + (K < 20 ? 0.5 : K > 80 ? -0.5 : 0), `KDJ: K ${F0(K)} ${K > D ? 'trên' : 'dưới'} D ${F0(D)}` + (K < 20 ? ', vùng quá bán, dễ hồi' : K > 80 ? ', vùng quá mua, dễ điều chỉnh' : ''));
    const sk = ind.sk[i], sd = ind.sd[i];
    if (isN(sk) && isN(sd)) vote('srsi', (sk > sd ? 0.5 : -0.5) + (sk < 20 ? 0.5 : sk > 80 ? -0.5 : 0), `StochRSI: %K ${F0(sk)} ${sk > sd ? 'trên' : 'dưới'} %D ${F0(sd)}` + (sk < 20 ? ', vùng quá bán, dễ hồi' : sk > 80 ? ', vùng quá mua, dễ điều chỉnh' : ''));
    const bm = ind.bbMid[i], bu = ind.bbUp[i], bl = ind.bbLo[i];
    if (isN(bm) && isN(bu)) vote('bb', c[i] > bu ? -0.5 : c[i] < bl ? 0.5 : c[i] > bm ? 0.4 : -0.4, c[i] > bu ? 'Giá vượt dải trên Bollinger: mua quá đà, dễ lùi về đường giữa' : c[i] < bl ? 'Giá dưới dải dưới Bollinger: bán quá đà, dễ hồi về đường giữa' : `Giá ${c[i] > bm ? 'trên' : 'dưới'} đường giữa Bollinger (${fmt(bm)})`);
    if (fsNow) {
      const sg = fsNow.up ? 1 : -1, r = fsNow.up ? (fsNow.hi - c[i]) / fsNow.d : (c[i] - fsNow.lo) / fsNow.d, pc = (r * 100).toFixed(0);
      const nm = fsNow.up ? 'tăng' : 'giảm', sw = `${fmt(fsNow.lo)}–${fmt(fsNow.hi)}`;
      if (r < 0) vote('fib', sg * 0.5, `Giá đã vượt qua điểm cuối nhịp ${nm} gần nhất (${sw}): xu hướng ${nm} đang mở rộng`);
      else if (r < 0.382) vote('fib', sg * 0.3, `Giá mới hồi ${pc}% nhịp ${nm} (${sw}): nhịp hồi nông, xu hướng ${nm} còn mạnh`);
      else if (r <= 0.786) vote('fib', sg * 0.7, `Giá đang hồi ${pc}% nhịp ${nm} (${sw}), nằm trong vùng Fibonacci 38,2–78,6%: vùng thường có lực đỡ để đi tiếp theo hướng ${nm}`);
      else if (r <= 1) vote('fib', -sg * 0.5, `Giá hồi sâu ${pc}% nhịp ${nm} (${sw}): quá 78,6% nên nguy cơ đảo chiều tăng lên`);
      else vote('fib', -sg, `Giá đã đi ngược và phá hết nhịp ${nm} gần nhất (${sw}): cấu trúc ${nm} bị vô hiệu`);
    }
    const tr = trendAt(i);
    vote('trend', tr, tr > 0 ? 'EMA50 trên EMA200 và giá trên EMA50: xu hướng chính tăng' : tr < 0 ? 'EMA50 dưới EMA200 và giá dưới EMA50: xu hướng chính giảm' : 'EMA50/EMA200 chưa cho xu hướng chính rõ ràng');
  }
  const MAXV = { ichi: 1, macd: 1, kdj: 1, srsi: 1, bb: 0.5, fib: 1, trend: 1 };
  const bias = votes.reduce((a, x) => a + x.v, 0), maxB = votes.reduce((a, x) => a + MAXV[x.type], 0) || 1;
  const dir = bias >= 0.25 * maxB ? 'buy' : bias <= -0.25 * maxB ? 'sell' : 'wait';
  const pct = Math.round(Math.min(100, Math.abs(bias) / maxB * 100));
  const fc = { dir, bias, max: maxB, pct, votes, horizon: MAXB, confirmed: now.ok && now.side === dir, strong: dir !== 'wait' && pct >= 55 && now.ok && now.side === dir };
  const atrN = ind.atr[n - 1];
  if (dir !== 'wait' && isN(atrN)) {
    const sg = dir === 'buy' ? 1 : -1, risk = SLATR * atrN, e = c[n - 1];
    fc.entry = e; fc.zoneLo = e - 0.3 * atrN; fc.zoneHi = e + 0.3 * atrN;
    fc.sl = e - sg * risk; fc.tp1 = e + sg * RR * risk; fc.rr = RR; fc.slPct = risk / e * 100;
    fc.tp2 = e + sg * 3 * risk; fc.tp2Src = 'R:R 1:3';
    if (fsNow && fsNow.up === (dir === 'buy')) { const x = fsNow.ex(1.618); if (sg * (x - fc.tp1) > 0) { fc.tp2 = x; fc.tp2Src = 'Fib mở rộng 161,8%'; } }
  } else if (dir !== 'wait') fc.dir = 'wait';

  // ---- Cảnh báo đảo chiều KDJ (14,3,3): ưu tiên báo sớm, không cần các chỉ báo khác đồng thuận ----
  let kdjAlert = null;
  {
    const i = n - 1, K = ind.K, D = ind.D, J = ind.J;
    if (i >= 3 && [K[i], D[i], K[i - 1], D[i - 1], J[i], J[i - 1], J[i - 2]].every(isN)) {
      const upX = K[i - 1] <= D[i - 1] && K[i] > D[i], dnX = K[i - 1] >= D[i - 1] && K[i] < D[i];
      const jUp = J[i - 1] < J[i - 2] && J[i] > J[i - 1] && J[i - 1] < 0;      // J chạm đáy vùng quá bán rồi ngóc lên
      const jDn = J[i - 1] > J[i - 2] && J[i] < J[i - 1] && J[i - 1] > 100;     // J chạm đỉnh vùng quá mua rồi quay xuống
      const jxUp = J[i - 1] <= K[i - 1] && J[i] > K[i] && K[i] < 20;           // J cắt lên K khi K còn thấp
      const jxDn = J[i - 1] >= K[i - 1] && J[i] < K[i] && K[i] > 80;           // J cắt xuống K khi K còn cao
      // lọc nhiễu: chỉ báo ở lần đảo chiều đầu tiên, tức là trước đó 8 nến giá đã từng rời khỏi vùng cực (không báo lặp khi KDJ dính mãi ở quá mua/quá bán)
      const jMax = Math.max(...J.slice(i - 8, i - 1).filter(isN)), jMin = Math.min(...J.slice(i - 8, i - 1).filter(isN));
      const kMax = Math.max(...K.slice(i - 10, i - 1).filter(isN)), kMin = Math.min(...K.slice(i - 10, i - 1).filter(isN));
      const freshLow = jMax > 40, freshHigh = jMin < 60;
      let side = null, level = null, why = '';
      if (upX && K[i] < 30 && kMax > 50) { side = 'buy'; level = 'confirm'; why = `K (${F0(K[i])}) cắt lên D (${F0(D[i])}) ở vùng thấp: xác nhận đảo chiều tăng`; }
      else if (dnX && K[i] > 70 && kMin < 50) { side = 'sell'; level = 'confirm'; why = `K (${F0(K[i])}) cắt xuống D (${F0(D[i])}) ở vùng cao: xác nhận đảo chiều giảm`; }
      else if ((jUp || jxUp) && freshLow) { side = 'buy'; level = 'early'; why = (jUp ? `J chạm vùng quá bán sâu (${F0(J[i - 1])}) rồi quay đầu lên (${F0(J[i])})` : `J (${F0(J[i])}) cắt lên K (${F0(K[i])}) khi K còn thấp`) + ': dấu hiệu sớm, chưa xác nhận'; }
      else if ((jDn || jxDn) && freshHigh) { side = 'sell'; level = 'early'; why = (jDn ? `J chạm vùng quá mua sâu (${F0(J[i - 1])}) rồi quay đầu xuống (${F0(J[i])})` : `J (${F0(J[i])}) cắt xuống K (${F0(K[i])}) khi K còn cao`) + ': dấu hiệu sớm, chưa xác nhận'; }
      if (side && isN(atrN)) {
        const sg = side === 'buy' ? 1 : -1, risk = SLATR * atrN, e = c[n - 1], tr = trendAt(n - 1);
        kdjAlert = { side, level, why, K: K[i], D: D[i], J: J[i], t: C[n - 1].t, trend: tr, aligned: tr === 0 ? 0 : (tr > 0) === (side === 'buy') ? 1 : -1,
          entry: e, zoneLo: e - 0.3 * atrN, zoneHi: e + 0.3 * atrN, sl: e - sg * risk, tp: e + sg * RR * risk, rr: RR, slPct: risk / e * 100 };
      }
    }
  }

  return { C, ind, signals, stats, now, zonesNow, zz, ew, ewLast, n, fc, fib: fsNow, kdjAlert };
}

/* ---------- Dữ liệu mô phỏng khi không gọi được Binance ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function genDemo(sym, tfMs, n) {
  n = n || 1000;
  let seed = 7;
  for (const ch of sym) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = mulberry32(seed);
  const gauss = () => { let u = 0, w = 0; while (!u) u = rnd(); while (!w) w = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); };
  let p = Math.exp(0.5 + rnd() * 8);
  const sigma = 0.006 * Math.sqrt(tfMs / 3600000);
  const base = Math.floor(Date.now() / tfMs) * tfMs;
  let drift = 0, left = 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    if (left <= 0) { drift = (rnd() - 0.5) * sigma * 0.5; left = 40 + Math.floor(rnd() * 80); }
    left--;
    const o = p;
    const cc = o * Math.exp(drift + sigma * gauss());
    const hh = Math.max(o, cc) * (1 + Math.abs(gauss()) * sigma * 0.4);
    const ll = Math.min(o, cc) * (1 - Math.abs(gauss()) * sigma * 0.4);
    const v = 1000 * (1 + Math.abs(gauss())) * (rnd() < 0.06 ? 3 : 1);
    out.push({ t: base - (n - i) * tfMs, o, h: hh, l: ll, c: cc, v });
    p = cc;
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { analyze, genDemo, fmt, sma, ema, rsiW, atrW, calcInd, zigzag, checkImpulse, TYPE_LABEL };

