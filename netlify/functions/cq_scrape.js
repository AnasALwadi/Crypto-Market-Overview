// netlify/functions/cq_scrape.js
// Scrape SOPR / MVRV from CryptoQuant public pages.
// إن احتاجت الصفحة تسجيل دخول، أضف متغير بيئة في Netlify باسم CQ_COOKIE بقيمة الكوكي.

const MAP = {
  sopr: "https://cryptoquant.com/asset/btc/indicator/sopr",
  mvrv: "https://cryptoquant.com/asset/btc/indicator/mvrv",
};

export async function handler(event) {
  try {
    const metric = (event.queryStringParameters?.metric || "").toLowerCase();
    if (!MAP[metric]) return json(400, { error: "Use ?metric=sopr or ?metric=mvrv" });

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    };
    const cookie = process.env.CQ_COOKIE;
    if (cookie) headers["Cookie"] = cookie;

    const r = await fetch(MAP[metric], { headers });
    const html = await r.text();
    if (!r.ok) return json(r.status, { error: "Fetch failed", htmlSnippet: html.slice(0, 260) });

    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return json(502, { error: "NEXT_DATA not found (page changed or login required)" });

    let nextData;
    try { nextData = JSON.parse(m[1]); }
    catch { return json(502, { error: "Parse NEXT_DATA failed" }); }

    const candidates = [];
    walk(nextData, (arr) => {
      if (!Array.isArray(arr) || arr.length < 5) return;
      let ok = 0;
      for (const p of arr) {
        if (p && typeof p === "object") {
          const t = p.t ?? p.time ?? p.timestamp ?? p.x ?? null;
          const v = p.v ?? p.value ?? p.y ?? null;
          if (isFiniteNum(t) && isFiniteNum(v)) ok++;
        }
      }
      if (ok >= Math.max(5, Math.floor(arr.length * 0.6))) candidates.push(arr);
    });
    if (!candidates.length) return json(502, { error: "No time series found" });

    candidates.sort((a, b) => b.length - a.length);
    const series = candidates[0];

    let lastPoint = null;
    for (let i = series.length - 1; i >= 0; i--) {
      const p = series[i];
      const t = p.t ?? p.time ?? p.timestamp ?? p.x ?? null;
      const v = p.v ?? p.value ?? p.y ?? null;
      if (isFiniteNum(t) && isFiniteNum(v)) { lastPoint = { t, v }; break; }
    }
    if (!lastPoint) return json(502, { error: "No valid last point" });

    return json(200, { metric, latest: lastPoint, seriesLen: series.length, note: cookie ? "cookie:used" : "cookie:none" });
  } catch (e) {
    return json(500, { error: e.message || String(e) });
  }
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
  };
}
function isFiniteNum(x){ return typeof x === "number" && isFinite(x); }
function walk(node, visitArr){
  if (Array.isArray(node)) { visitArr(node); for (const it of node) walk(it, visitArr); }
  else if (node && typeof node === "object") { for (const k of Object.keys(node)) walk(node[k], visitArr); }
}
