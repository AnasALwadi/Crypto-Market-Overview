<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>BTC/USDT — Market Overview (Free Data)</title>
<style>
  :root { color-scheme: dark; --ok:#7fd18b; --warn:#ffc877; --bad:#ff8b8b; --muted:#9aa0a6; }
  body{margin:0;background:#0f1115;color:#e6e6e6;font-family:Arial,Helvetica,sans-serif}
  .wrap{max-width:1150px;margin:18px auto;padding:0 14px}
  .brand{display:flex;justify-content:space-between;align-items:center;margin:6px 0 14px}
  .brand h1{margin:0;font-size:18px;color:#ddd}
  .brand .me{color:#ffc877;font-weight:700}
  .score{padding:6px 10px;border:1px solid #2a3040;border-radius:999px;background:#171a21;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
  .card{background:#171a21;border:1px solid #262b36;border-radius:12px;padding:14px;min-height:140px;display:flex;flex-direction:column}
  .card h3{margin:0 0 8px;font-size:16px}
  .muted{color:var(--muted);font-size:12px}
  .ok{outline:1px solid #2f5a3a}
  .warn{outline:1px solid #5c4a1f}
  .bad{outline:1px solid #5a2f2f}
  .kv{display:flex;justify-content:space-between;margin:6px 0}
  .big{font-size:22px;font-weight:700}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  button{background:#222a35;border:1px solid #2f3646;color:#e6e6e6;border-radius:8px;padding:6px 10px;cursor:pointer}
  button:disabled{opacity:.6;cursor:not-allowed}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">
    <h1>BTC/USDT — Market Overview</h1>
    <div class="row">
      <div class="score" id="marketScore">Market Score: loading…</div>
      <button id="refreshBtn">Refresh</button>
      <div class="me">Made by Anas Alwadi</div>
    </div>
  </div>

  <div class="grid" id="grid"></div>
  <p class="muted" id="asof" style="margin-top:10px"></p>
</div>

<script>
const $ = s => document.querySelector(s);
const fmt = n => Number(n).toLocaleString();
const pct = x => (x*100).toFixed(2) + "%";
const bust = url => url + (url.includes("?")?"&":"?") + "t=" + Date.now();

// ---- Free sources (CORS-friendly) ----
const CG_GLOBAL     = "https://api.coingecko.com/api/v3/global";
const CG_PRICE      = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";
const CG_MKTCHART   = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=120&interval=daily";
const FNG           = "https://api.alternative.me/fng/?limit=2";
// Blockchain.com charts (add cors=true)
const BC_TXV_SERIES = "https://api.blockchain.info/charts/estimated-transaction-volume-usd?timespan=120days&format=json&cors=true";
const BCH_HASH      = "https://api.blockchain.info/charts/hash-rate?timespan=60days&format=json&cors=true";
const BCH_DIFF      = "https://api.blockchain.info/charts/difficulty?timespan=60days&format=json&cors=true";
const BCH_ADDR      = "https://api.blockchain.info/charts/active-addresses?timespan=60days&format=json&cors=true";
const BCH_FEES_BTC  = "https://api.blockchain.info/charts/transaction-fees?timespan=60days&format=json&cors=true"; // BTC units/day

function card(title, html, tone=""){ 
  const cls = tone==="bull"?"ok":tone==="warn"?"warn":tone==="bear"?"bad":"";
  return `<div class="card ${cls}"><h3>${title}</h3>${html}</div>`;
}
function scoreLabel(x){
  if (x>=2.5) return `Bullish (${x.toFixed(1)})`;
  if (x<=-2.5) return `Bearish (${x.toFixed(1)})`;
  return `Neutral (${x.toFixed(1)})`;
}
async function getJSON(url){
  const r = await fetch(bust(url), {cache:"no-store"});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
function SMA(arr, win){
  const out=[]; let s=0;
  for(let i=0;i<arr.length;i++){
    s += arr[i];
    if(i>=win) s -= arr[i-win];
    if(i>=win-1) out.push(s/win);
  }
  return out;
}

async function main(){
  $("#grid").innerHTML = "";
  $("#refreshBtn").disabled = true;
  $("#asof").textContent = "Updating…";

  let score = 0;
  const cards = [];

  // 1) CoinGecko global + price (dominance, totals, etc.)
  let priceUSD = null;
  try{
    const [g, p] = await Promise.all([getJSON(CG_GLOBAL), getJSON(CG_PRICE)]);
    priceUSD = p.bitcoin.usd;
    const dom    = g.data.market_cap_percentage.btc; // %
    const totalM = g.data.total_market_cap.usd;
    const vol24  = g.data.total_volume.usd;
    const btcM   = g.data.total_market_cap.usd * (dom/100);
    const altM   = totalM - btcM;

    // Liquidity proxy: volume/marketcap
    const liqRatio = vol24 / totalM;

    let tone = "neu", msg = "—";
    if (dom >= 55) { tone="bull"; msg="Capital rotating into BTC"; score += 0.4; }
    else if (dom <= 45) { tone="warn"; msg="Alt season risk"; score -= 0.2; }

    cards.push(card("BTC Price & Market (CoinGecko)", `
      <div class="kv"><span>BTC Price</span><span class="big">$${fmt(priceUSD.toFixed(0))}</span></div>
      <div class="kv"><span>BTC Dominance</span><span>${dom.toFixed(1)}%</span></div>
      <div class="kv"><span>Total Market Cap</span><span>$${fmt(totalM.toFixed(0))}</span></div>
      <div class="kv"><span>Altcoin Market Cap</span><span>$${fmt(altM.toFixed(0))}</span></div>
      <div class="kv"><span>24h Total Volume</span><span>$${fmt(vol24.toFixed(0))}</span></div>
      <div class="kv"><span>Volume / Mkt Cap</span><span>${(liqRatio*100).toFixed(2)}%</span></div>
      <div class="muted">${msg}</div>
    `, tone));
  }catch(e){
    cards.push(card("BTC Price & Market", `<div class="muted">Error: ${e.message}</div>`));
  }

  // 2) Fear & Greed (sentiment)
  try{
    const f = await getJSON(FNG);
    const now = f?.data?.[0];
    if(now){
      const val = Number(now.value);
      let tone="neu", msg="Neutral";
      if(val <= 25){ tone="bear"; msg="Extreme Fear"; score -= 0.8; }
      else if(val <= 45){ tone="warn"; msg="Fear"; score -= 0.4; }
      else if(val >= 75){ tone="warn"; msg="Extreme Greed"; score -= 0.4; }
      else if(val >= 55){ tone="bull"; msg="Greed"; score += 0.2; }

      cards.push(card("Fear & Greed Index", `
        <div class="kv"><span>Current</span><span class="big">${val}</span></div>
        <div class="kv"><span>Classification</span><span>${now.value_classification}</span></div>
        <div class="muted">Updated: ${new Date(Number(now.timestamp)*1000).toLocaleString()}</div>
      `, tone));
    } else {
      cards.push(card("Fear & Greed Index", `<div class="muted">No data</div>`));
    }
  }catch(e){
    cards.push(card("Fear & Greed Index", `<div class="muted">Error: ${e.message}</div>`));
  }

  // 3) On-chain (Blockchain.com): Hashrate
  try{
    const h = await getJSON(BCH_HASH);
    const pts = h?.values || [];
    const last = pts[pts.length-1], prev = pts[pts.length-8];
    const latest = last?.y, change = (latest && prev) ? (latest - prev)/prev : null;
    let tone="neu", msg="—";
    if(change!=null){
      if(change > 0.05){ tone="bull"; msg="Hashrate rising (network strengthening)"; score += 0.3; }
      else if(change < -0.05){ tone="warn"; msg="Hashrate falling"; score -= 0.2; }
    }
    cards.push(card("Hashrate (Blockchain.com)", `
      <div class="kv"><span>Latest</span><span class="big">${latest ? fmt(latest.toFixed(2)) : "—"} EH/s</span></div>
      <div class="kv"><span>~7d Change</span><span>${change!=null ? pct(change) : "—"}</span></div>
    `, tone));
  }catch(e){
    cards.push(card("Hashrate", `<div class="muted">Error: ${e.message}</div>`));
  }

  // 4) On-chain: Difficulty
  try{
    const d = await getJSON(BCH_DIFF);
    const pts = d?.values || [];
    const last = pts[pts.length-1], prev = pts[pts.length-8];
    const latest = last?.y, change = (latest && prev) ? (latest - prev)/prev : null;
    let tone="neu", msg="—";
    if(change!=null){
      if(change > 0.03){ tone="bull"; msg="Difficulty trending up"; score += 0.2; }
      else if(change < -0.03){ tone="warn"; msg="Difficulty trending down"; score -= 0.1; }
    }
    cards.push(card("Mining Difficulty", `
      <div class="kv"><span>Latest</span><span class="big">${latest ? fmt(latest.toFixed(0)) : "—"}</span></div>
      <div class="kv"><span>~7d Change</span><span>${change!=null ? pct(change) : "—"}</span></div>
    `, tone));
  }catch(e){
    cards.push(card("Mining Difficulty", `<div class="muted">Error: ${e.message}</div>`));
  }

  // 5) On-chain: Active Addresses
  try{
    const a = await getJSON(BCH_ADDR);
    const pts = a?.values || [];
    const last = pts[pts.length-1], prev = pts[pts.length-8];
    const latest = last?.y, change = (latest && prev) ? (latest - prev)/prev : null;
    let tone="neu", msg="—";
    if(change!=null){
      if(change > 0.05){ tone="bull"; msg="On-chain activity picking up"; score += 0.3; }
      else if(change < -0.05){ tone="warn"; msg="On-chain activity cooling"; score -= 0.2; }
    }
    cards.push(card("Active Addresses (Blockchain.com)", `
      <div class="kv"><span>Latest</span><span class="big">${latest ? fmt(latest.toFixed(0)) : "—"}</span></div>
      <div class="kv"><span>~7d Change</span><span>${change!=null ? pct(change) : "—"}</span></div>
    `, tone));
  }catch(e){
    cards.push(card("Active Addresses", `<div class="muted">Error: ${e.message}</div>`));
  }

  // 6) On-chain: Transaction Fees (convert BTC → USD)
  try{
    const f = await getJSON(BCH_FEES_BTC);
    const pts = f?.values || [];
    const last = pts[pts.length-1], prev = pts[pts.length-8];
    const feesBTC = last?.y || null;
    const change = (feesBTC && prev) ? (feesBTC - prev.y)/prev.y : null;
    const feesUSD = (feesBTC && priceUSD) ? feesBTC * priceUSD : null;
    let tone="neu", msg="—";
    if(change!=null){
      if(change > 0.25){ tone="warn"; msg="Fees spiking (network congestion)"; score -= 0.2; }
      else if(change < -0.25){ tone="bull"; msg="Fees easing (less congestion)"; score += 0.1; }
    }
    cards.push(card("Transaction Fees (daily)", `
      <div class="kv"><span>Total fees (BTC)</span><span class="big">${feesBTC ? feesBTC.toFixed(2) : "—"} BTC</span></div>
      <div class="kv"><span>≈ USD</span><span>${feesUSD ? "$"+fmt(feesUSD.toFixed(0)) : "—"}</span></div>
      <div class="kv"><span>~7d Change</span><span>${change!=null ? pct(change) : "—"}</span></div>
      <div class="muted">Higher fees = congestion / demand</div>
    `, tone));
  }catch(e){
    cards.push(card("Transaction Fees", `<div class="muted">Error: ${e.message}</div>`));
  }

  // 7) Valuation: NVT + NVT Golden Cross (approx)
  try{
    const [mcSeries, txvSeries] = await Promise.all([
      getJSON(CG_MKTCHART),   // {market_caps:[[ts, cap], ...], prices:..., total_volumes:...}
      getJSON(BC_TXV_SERIES), // {values:[{x:ts,y:usd}, ...]}
    ]);
    const mc = (mcSeries.market_caps || []).map(([t,v])=>({t:Math.floor(t/1000), v}));
    const tv = (txvSeries.values || []).map(o=>({t:o.x, v:o.y}));
    function joinSeries(a,b){
      const out=[]; let j=0;
      for(let i=0;i<a.length;i++){
        const ta=a[i].t;
        while(j<b.length-1 && b[j+1].t<=ta) j++;
        const tb=b[j]?.t;
        if(Math.abs((tb||0)-ta)<=86400*1.5){
          out.push({t:ta, a:a[i].v, b:b[j].v});
        }
      }
      return out;
    }
    const joined = joinSeries(mc, tv).filter(x=>x.a>0 && x.b>0);
    if(joined.length){
      const nvtSeries = joined.map(x=>({t:x.t, v:x.a / x.b}));
      const latest = nvtSeries[nvtSeries.length-1].v;

      let nvtTone="neu", nvtMsg="Neutral zone";
      if(latest < 20){ nvtTone="bull"; nvtMsg="Strong buying opportunity"; score+=0.6; }
      else if(latest < 40){ nvtTone="bull"; nvtMsg="Fair value / potential buy"; score+=0.2; }
      else if(latest >= 70 && latest < 80){ nvtTone="warn"; nvtMsg="Potential overvaluation"; score-=0.2; }
      else if(latest >= 80){ nvtTone="bear"; nvtMsg="Bubble risk — selling opportunity"; score-=0.6; }

      cards.push(card("NVT (Network Value to Tx)", `
        <div class="kv"><span>Latest</span><span class="big">${latest.toFixed(1)}</span></div>
        <div class="muted">${nvtMsg}</div>
      `, nvtTone));

      // Golden Cross (MA10 vs MA30 of NVT)
      const nvts = nvtSeries.map(x=>x.v);
      const ma10 = SMA(nvts,10), ma30 = SMA(nvts,30);
      if(ma30.length){
        const gc = (ma10[ma10.length-1] - ma30[ma30.length-1]) / ma30[ma30.length-1];
        let gcTone="neu", gcMsg="Fair value";
        if(gc < -0.015){ gcTone="bull"; gcMsg="Undervalue"; score+=0.3; }
        else if(gc > 0.021){ gcTone="bear"; gcMsg="Overvalue"; score-=0.3; }
        cards.push(card("NVT Golden Cross (approx)", `
          <div class="kv"><span>GC value</span><span class="big">${(gc*100).toFixed(2)}%</span></div>
          <div class="muted">${gcMsg}</div>
        `, gcTone));
      }
    } else {
      cards.push(card("NVT / Golden Cross", `<div class="muted">Not enough data</div>`));
    }
  }catch(e){
    cards.push(card("NVT / Golden Cross", `<div class="muted">Error: ${e.message}</div>`));
  }

  // Render + score
  $("#grid").innerHTML = cards.join("");
  $("#marketScore").textContent = "Market Score: " + scoreLabel(score);
  $("#asof").textContent = "Updated at " + new Date().toLocaleString();
  $("#refreshBtn").disabled = false;
}

$("#refreshBtn").addEventListener("click", main);
main();
// Auto-refresh كل 10 دقائق
setInterval(main, 10*60*1000);
</script>
</body>
</html>

