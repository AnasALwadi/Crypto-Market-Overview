<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>BTC/USDT — Market Overview</title>
<style>
  :root { color-scheme: dark; }
  body{margin:0;background:#0f1115;color:#e6e6e6;font-family:Arial,Helvetica,sans-serif}
  .wrap{max-width:1150px;margin:18px auto;padding:0 14px}
  .brand{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
  .brand .made{font-weight:800;color:#ffcc70}
  .brand .right{font-size:14px;color:#9aa0a6}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
  .card{background:#171a21;border:1px solid #262b36;border-radius:12px;padding:12px}
  .title{font-weight:700;margin-bottom:8px}
  .kv{display:flex;justify-content:space-between;margin:6px 0}
  .muted{color:#9aa0a6}
  .bull{border-color:#2e7d32;background:#142017}
  .bear{border-color:#c62828;background:#221618}
  .warn{border-color:#ff9800;background:#241d11}
  .neu{border-color:#2a2f3a;background:#171a21}
  .score{display:inline-block;padding:6px 10px;border-radius:999px;background:#21242c;margin-left:8px}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">
    <div>
      <div class="made">Made by <b>Anas Alwadi</b></div>
      <div class="title" id="headline">BTC/USDT — Market Overview</div>
    </div>
    <div class="right">
      <div>BTC Price: <span id="btcPrice">–</span></div>
      <div>Updated: <span id="updated">–</span></div>
      <div>Market Score: <span id="marketScore" class="score">Neutral (0.0)</span></div>
    </div>
  </div>

  <div id="grid" class="grid"></div>
</div>

<script>
/* ========= Helpers ========= */
const $ = s => document.querySelector(s);
const fmt = x => Number(x).toLocaleString();
const pct = x => (x*100).toFixed(2) + "%";
const nowStr = () => new Date().toLocaleString();

/* Cards */
function card(title, html, mood="neu"){
  return `<div class="card ${mood}">
    <div class="title">${title}</div>
    ${html}
  </div>`;
}

/* Simple score -> label */
function scoreLabel(sc){
  if(sc>=1.5) return "Bullish";
  if(sc<=-1.5) return "Bearish";
  if(sc>0.5) return "Mild Bullish";
  if(sc<-0.5) return "Mild Bearish";
  return "Neutral";
}

/* ========= Public APIs =========
   CoinGecko: price, market cap, supply (BTC + stables)
   Blockchain.com: estimated tx volume USD (time series)
*/
const CG_MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,tether,usd-coin,dai,true-usd,binance-usd&per_page=250&page=1&sparkline=false&locale=en";
const CG_MCAP_SERIES = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=120&interval=daily";
const BC_TXV_SERIES  = "https://api.blockchain.info/charts/estimated-transaction-volume-usd?timespan=120days&format=json";

/* ========= Main ========= */
async function main(){
  $("#updated").textContent = nowStr();

  const grid = $("#grid");
  let score = 0;

  // 1) CoinGecko markets batch (BTC + top stables)
  const mk = await fetch(CG_MARKETS_URL, {cache:"no-store"}).then(r=>r.json());
  const byId = {};
  mk.forEach(o=>byId[o.id]=o);

  const btc = byId["bitcoin"];
  if(!btc) throw new Error("CoinGecko BTC unavailable");

  $("#btcPrice").textContent = "$" + fmt(btc.current_price.toFixed(2));

  // 2) Stablecoins ratio (approx)
  // Sum current market caps and reconstruct "yesterday" via market_cap_change_percentage_24h
  const stableIds = ["tether","usd-coin","dai","true-usd","binance-usd"].filter(id => byId[id]);
  let stableCapNow = 0, stableCapPrev = 0;
  stableIds.forEach(id=>{
    const c = byId[id];
    const now = c.market_cap || 0;
    const prev = c.market_cap_change_percentage_24h != null
        ? now / (1 + (c.market_cap_change_percentage_24h/100))
        : now;
    stableCapNow += now;
    stableCapPrev += prev;
  });

  const btcCapNow = btc.market_cap || 0;
  const btcCapPrev = btc.market_cap_change_percentage_24h != null
      ? btcCapNow / (1 + (btc.market_cap_change_percentage_24h/100))
      : btcCapNow;

  const ratioNow  = stableCapNow / (btcCapNow || 1);
  const ratioPrev = stableCapPrev / (btcCapPrev || 1);
  const ratioUp   = ratioNow > ratioPrev + 1e-9;
  const btcUp     = (btc.price_change_percentage_24h || 0) > 0;

  // Signal per الجدول المبسّط
  let srTone="neu", srMsg="stability with no clear direction";
  if (ratioUp && btcUp) { srTone="warn"; srMsg="warning of a potential correction soon"; score-=0.2; }
  else if (ratioUp && !btcUp) { srTone="bull"; srMsg="altcoins may rise"; score+=0.3; }
  else if (!ratioUp && btcUp) { srTone="bull"; srMsg="sustained uptrend"; score+=0.5; }
  else if (!ratioUp && !btcUp) { srTone="bear"; srMsg="bearish market bias"; score-=0.4; }

  grid.insertAdjacentHTML("beforeend", card("Stablecoins Ratio (approx)", `
    <div class="kv"><span>Stables mcap</span><span>$${fmt(stableCapNow.toFixed(0))}</span></div>
    <div class="kv"><span>BTC mcap</span><span>$${fmt(btcCapNow.toFixed(0))}</span></div>
    <div class="kv"><span>Ratio (stables/BTC)</span><span>${ratioNow.toFixed(3)}</span></div>
    <div class="kv"><span>24h change dir</span><span>${ratioUp?"↑ up":"↓ down"} vs BTC ${btcUp?"↑":"↓"}</span></div>
    <div class="muted">${srMsg}</div>
  `, srTone));

  // 3) Stock-to-Flow (approx)
  const supply = btc.circulating_supply || 0;
  const flowYear = 3.125 * 144 * 365; // بعد Halving 2024
  const s2f = supply / flowYear;
  let s2fTone="neu", s2fMsg="Informational only";
  if (s2f > 100) { s2fTone="bull"; s2fMsg="High scarcity"; score+=0.2; }
  grid.insertAdjacentHTML("beforeend", card("Stock-to-Flow (approx)", `
    <div class="kv"><span>Stock (circulating)</span><span>${fmt(supply.toFixed(0))} BTC</span></div>
    <div class="kv"><span>Flow/yr (est.)</span><span>${fmt(flowYear.toFixed(0))} BTC</span></div>
    <div class="kv"><span>S2F</span><span>${s2f.toFixed(1)}</span></div>
    <div class="muted">${s2fMsg}</div>
  `, s2fTone));

  // 4) NVT (Market Cap / Daily Tx Volume)
  //   market cap series (CG) + tx volume series (Blockchain.com) → latest day + GC signal
  const [mcSeries, txvSeries] = await Promise.all([
    fetch(CG_MCAP_SERIES, {cache:"no-store"}).then(r=>r.json()),
    fetch(BC_TXV_SERIES,  {cache:"no-store"}).then(r=>r.json())
  ]);

  // CG returns {market_caps:[[ts, cap], ...]}
  const mc = (mcSeries.market_caps || []).map(([t,v])=>({t:Math.floor(t/1000), v}));
  // Blockchain.com returns {values:[{x:ts,y:val},...]}
  const tv = (txvSeries.values || []).map(o=>({t:o.x, v:o.y}));

  // sync by day (use last 120, join by closest same-day ts)
  function joinSeries(a,b){
    const out=[];
    let j=0;
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

    // NVT card & classification
    let nvtTone="neu", nvtMsg="Neutral zone";
    if(latest < 20){ nvtTone="bull"; nvtMsg="Strong buying opportunity (undervalued)"; score+=0.7; }
    else if(latest < 40){ nvtTone="bull"; nvtMsg="Fair value / potential buy"; score+=0.3; }
    else if(latest >= 70 && latest < 80){ nvtTone="warn"; nvtMsg="Potential overvaluation"; score-=0.2; }
    else if(latest >= 80){ nvtTone="bear"; nvtMsg="Bubble risk — selling opportunity"; score-=0.8; }

    grid.insertAdjacentHTML("beforeend", card("NVT (Network Value to Tx)", `
      <div class="kv"><span>Latest</span><span>${latest.toFixed(1)}</span></div>
      <div class="muted">${nvtMsg}</div>
    `, nvtTone));

    // 5) NVT Golden Cross (approx): (MA10 - MA30)/MA30
    function SMA(arr, win){
      const out=[]; let s=0;
      for(let i=0;i<arr.length;i++){
        s += arr[i];
        if(i>=win) s -= arr[i-win];
        if(i>=win-1) out.push(s/win);
      }
      return out;
    }
    const nvts = nvtSeries.map(x=>x.v);
    const ma10 = SMA(nvts,10);
    const ma30 = SMA(nvts,30);
    let gc = null;
    if(ma30.length){
      const last10 = ma10[ma10.length-1];
      const last30 = ma30[ma30.length-1];
      gc = (last10 - last30) / last30; // نسبة
      let gcTone="neu", gcMsg="Fair value";
      if(gc < -0.015){ gcTone="bull"; gcMsg="Undervalue"; score+=0.4; }
      else if(gc > 0.021){ gcTone="bear"; gcMsg="Overvalue"; score-=0.4; }
      grid.insertAdjacentHTML("beforeend", card("NVT Golden Cross (approx)", `
        <div class="kv"><span>GC value</span><span>${(gc*100).toFixed(2)}%</span></div>
        <div class="muted">${gcMsg}</div>
      `, gcTone));
    }
  } else {
    grid.insertAdjacentHTML("beforeend", card("NVT / Golden Cross", `<div class="muted">Not enough data</div>`));
  }

  // Score header
  $("#marketScore").textContent = `${scoreLabel(score)} (${score.toFixed(1)})`;
}

main().catch(e=>{
  console.error(e);
  $("#grid").innerHTML = `<div class="card bear"><div class="title">Error</div><div>${e.message}</div></div>`;
});
</script>
</body>
</html>
