'use strict';
/* Bot Telegram: quét Binance, gửi tin khi có dự báo mua/bán mới và khi lệnh chạm cắt lỗ / chốt lời. */
const fs = require('fs');
const { analyze, genDemo, fmt, TYPE_LABEL } = require('./engine.js');
const env = process.env;
const TOKEN = env.TG_TOKEN, CHAT = env.TG_CHAT_ID, DEMO = env.DEMO === '1';
const TFMS = { '1h': 3600000, '4h': 14400000, '1d': 86400000 };
const TFL = (env.TIMEFRAMES || '1h,4h').split(',').map(s => s.trim()).filter(t => TFMS[t]);
const TOP = +(env.TOP || 20);
const ONLY_POS = env.ONLY_POSITIVE !== '0';          // chỉ báo coin có backtest dương
const WATCH = (env.WATCH || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api1.binance.com'];
const STATE = 'state.json';
let state = { sent: {}, open: {} };
try { state = Object.assign(state, JSON.parse(fs.readFileSync(STATE, 'utf8'))); } catch (e) {}

async function getJSON(path) {
  let last;
  for (const h of HOSTS) {
    try {
      const r = await fetch(h + path, { signal: AbortSignal.timeout(10000) });
      if (r.ok) return await r.json();
      last = new Error('HTTP ' + r.status + ' ' + h);
    } catch (e) { last = e; }
  }
  throw last;
}
async function send(text) {
  console.log('[TG]', text.replace(/<[^>]+>/g, ''), '\n');
  if (!TOKEN || !CHAT || DEMO) return;
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
  if (!r.ok) console.log('Telegram lỗi', r.status, await r.text());
}
async function topSyms() {
  try {
    const all = await getJSON('/api/v3/ticker/24hr');
    const bad = /^(USDC|FDUSD|TUSD|USDP|DAI|BUSD|EUR|AEUR|USD1|USDE|XUSD|PAXG|WBTC|WBETH)$/;
    return all.filter(t => t.symbol.endsWith('USDT')).map(t => ({ s: t.symbol, b: t.symbol.slice(0, -4), v: +t.quoteVolume }))
      .filter(t => !bad.test(t.b) && !/(UP|DOWN|BULL|BEAR)$/.test(t.b) && t.v > 0).sort((a, b) => b.v - a.v).slice(0, TOP).map(t => t.s);
  } catch (e) {
    return ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'TON'].map(b => b + 'USDT');
  }
}
async function klines(sym, tf) {
  if (DEMO) return genDemo(sym, TFMS[tf], 1000).map(k => Object.assign(k, { ct: k.t + TFMS[tf] - 1 }));
  const raw = await getJSON(`/api/v3/klines?symbol=${sym}&interval=${tf}&limit=1000`);
  if (!Array.isArray(raw) || raw.length < 250) throw new Error('ít dữ liệu');
  return raw.map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], ct: k[6] }));
}

async function handle(sym, tf) {
  const key = sym + '|' + tf, base = sym.replace('USDT', '');
  const all = await klines(sym, tf);
  // 1) theo dõi các lệnh mua đã báo: chạm cắt lỗ hay chốt lời (tính cả nến đang chạy; nếu cùng nến chạm cả hai thì tính cắt lỗ)
  for (const id of Object.keys(state.open)) {
    const o = state.open[id];
    if (o.sym !== sym || o.tf !== tf) continue;
    const after = all.filter(k => k.t > o.t);
    let res = null;
    for (const k of after) { if (k.l <= o.sl) { res = 'sl'; break; } if (k.h >= o.tp) { res = 'tp'; break; } }
    if (res === 'sl') await send(`🛑 <b>${base}/USDT · ${tf} · CHẠM CẮT LỖ</b>\nGiá đã xuống tới ${fmt(o.sl)}. Dự báo tăng đã sai, thoát lệnh nếu bạn chưa thoát.\n(Vào ${fmt(o.entry)})`);
    if (res === 'tp') await send(`✅ <b>${base}/USDT · ${tf} · CHẠM CHỐT LỜI</b>\nGiá đã lên tới ${fmt(o.tp)}. Nên chốt lời hoặc dời cắt lỗ lên hòa vốn.\n(Vào ${fmt(o.entry)})`);
    if (res || after.length > 60) delete state.open[id];
  }
  // 2) dự báo mới trên nến vừa đóng
  const C = all.filter(k => k.ct <= Date.now());
  const A = analyze(C), sg = A.signals[A.signals.length - 1];
  if (!sg) return;
  if (!DEMO && sg.i !== C.length - 1) return;
  if (state.sent[key] === sg.t) return;
  state.sent[key] = sg.t;
  const st = A.stats.all;
  if (ONLY_POS && !(st.n >= 10 && st.exp > 0)) return;
  const buy = sg.side === 'buy', fc = A.fc;
  const tp2 = fc.dir === sg.side && fc.tp2 ? fc.tp2 : null;
  const why = sg.items.filter(i => i.pts > 0).map(i => TYPE_LABEL[i.type]).join(', ');
  const L = [
    `${buy ? '🟢' : '🔴'} <b>${base}/USDT · ${tf} · ${buy ? 'DỰ BÁO TĂNG' : 'DỰ BÁO GIẢM'}</b>`,
    `Độ đồng thuận ${sg.strength}/100 (${why})`, ''
  ];
  if (buy) L.push(`Vùng vào: ${fmt(sg.entry - 0.3 * sg.atr)} – ${fmt(sg.entry + 0.3 * sg.atr)}`,
    `Cắt lỗ: ${fmt(sg.sl)} (−${(sg.risk / sg.entry * 100).toFixed(2)}%)`,
    `Chốt lời 1: ${fmt(sg.tp)} (R:R 1:${sg.rr})` + (tp2 ? `\nChốt lời 2: ${fmt(tp2)}` : ''));
  else L.push(`Nên thoát lệnh hoặc đứng ngoài (spot không bán khống).`,
    `Mục tiêu giảm: ${fmt(sg.tp)}`, `Dự báo sai nếu giá vượt: ${fmt(sg.sl)}`);
  L.push('', `Backtest coin này: ${st.n} lệnh, thắng ${(st.wr * 100).toFixed(0)}%, kỳ vọng ${st.exp.toFixed(2)}R`,
    buy ? 'Đặt cắt lỗ ngay khi vào. Đừng đuổi nếu giá đã chạy quá vùng vào hơn nửa ATR.' : 'Đây là xác suất, không phải chắc chắn.');
  await send(L.join('\n'));
  if (buy) state.open[key + '|' + sg.t] = { sym, tf, side: 'buy', t: sg.t, entry: sg.entry, sl: sg.sl, tp: sg.tp };
}

(async () => {
  if (env.TEST === 'true') await send('✅ Bot Trạm tín hiệu coin đã kết nối thành công. Từ giờ bạn sẽ nhận dự báo mua/bán, cắt lỗ và chốt lời tại đây.');
  const syms = WATCH.length ? WATCH : await topSyms();
  console.log('Quét', syms.length, 'coin, khung', TFL.join(','));
  for (const tf of TFL) for (const sym of syms) {
    try { await handle(sym, tf); } catch (e) { console.log(sym, tf, 'lỗi:', e.message); }
  }
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
})();
