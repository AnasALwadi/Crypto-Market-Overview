// netlify/functions/cq_scrape.js
// Robust scraper for CryptoQuant public indicator pages (SOPR / MVRV)
// Requires env var CQ_COOKIE (copied from your logged-in browser)

export async function handler(event) {
  try {
    const metric = (event.queryStringParameters?.metric || "").toLowerCase();
    const MAP = {
      sopr: "https://cryptoquant.com/asset/btc/indicator/sopr",
      mvrv: "https://cryptoquant.com/asset/btc/indicator/mvrv",
    };
    if (!MAP[metric]) {
      return json(400, { error: "Use ?metric=sopr or ?metric=mvrv" });
    }

    const cookie = process.env.CQ_COOKIE || "";
    if (!cookie) return json(500, { error: "CQ_COOKIE is not set" });

    const res = await fetch(MAP[metric], {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        Cookie: cookie,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const html = await res.text();

    // pull __NEXT_DATA__
    const m = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/
    );
    if (!m) return json(502, { error: "Unable to locate __NEXT_DATA__" });

    let root;
    try {
      root = JSON.parse(m[1]);
    } catch (e) {
      return json(502, { error: "Failed to parse __NEXT_DATA__ JSON" });
    }

    // Heuristic deep scan for time-series arrays
    const candidates = [];
    deepScan(root, (node) => {
      // look for arrays of objects with (time,x,t) + (value,y,v)
      if (Array.isArray(node) && node.length >= 30 && typeof node[0] === "object") {
        const keys = Object.keys(node[0] || {});
        const tKey = keys.find((k) => /^(time|timestamp|t|x|date)$/i.test(k));
        const vKey = keys.find((k) => /^(value|y|v|val|price|close)$/i.test(k));
        if (!tKey || !vKey) return;

        // Verify timestamps + numeric values
        let ok = 0;
        for (let i = 0; i < Math.min(node.length, 50); i++) {
          const t = node[i]?.[tKey];
          const v = node[i]?.[vKey];
          if (!isFiniteNumber(v)) break;
          const ts = normalizeTS(t);
          if (!ts) break;
          ok++;
        }
        if (ok >= 20) {
          candidates.push({ arr: node, tKey, vKey });
        }
      }
      // also allow arrays of [ts, value]
      if (Array.isArray(node) && node.length >= 30 && Array.isArray(node[0])) {
        let ok = 0;
        for (let i = 0; i < Math.min(node.length, 50); i++) {
          const a = node[i];
          if (!Array.isArray(a) || a.length < 2) break;
          const ts = normalizeTS(a[0]);
          const v = a[1];
          if (!ts || !isFiniteNumber(v)) break;
          ok++;
        }
        if (ok >= 20) candidates.push({ arr: node, tuple: true });
      }
    });

    if (!candidates.length) return json(404, { error: "No time series found" });

    // Pick the "best" by length, then by most recent timestamp
    candidates.sort((A, B) => {
      const lenA = A.arr.length;
      const lenB = B.arr.length;
      if (lenA !== lenB) return lenB - lenA;

      const lastA = getLastTS(A);
      const lastB = getLastTS(B);
      return (lastB || 0) - (lastA || 0);
    });

    const best = candidates[0];
    const series = best.arr.map((row) => {
      let ts, val;
      if (best.tuple) {
        ts = normalizeTS(row[0]);
        val = Number(row[1]);
      } else {
        ts = normalizeTS(row[best.tKey]);
        val = Number(row[best.vKey]);
      }
      return ts && isFiniteNumber(val) ? { t: ts, v: val } : null;
    }).filter(Boolean);

    if (!series.length) return json(404, { error: "Parsed empty series" });

    const latest = series[series.length - 1];

    // optional debug
    if (event.queryStringParameters?.debug === "1") {
      return json(200, {
        ok: true,
        candidateCount: candidates.length,
        picked: {
          length: series.length,
          lastTS: latest.t,
          lastVal: latest.v,
        },
      });
    }

    return json(200, {
      metric,
      unit: metric === "sopr" ? "" : "",
      latest: latest.v,
      series, // array of {t (seconds), v}
    });
  } catch (e) {
    return json(500, { error: e.message || "Internal error" });
  }
}

// ---------- helpers ----------
function json(status, obj) {
  return {
    statusCode: status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

function deepScan(node, fn) {
  try {
    fn(node);
  } catch {}
  if (Array.isArray(node)) {
    for (const x of node) deepScan(x, fn);
  } else if (node && typeof node === "object") {
    for (const k of Object.keys(node)) deepScan(node[k], fn);
  }
}

function normalizeTS(t) {
  // Accept seconds (10 digits) or ms (13 digits) or ISO date strings
  if (typeof t === "number") {
    if (t > 1e12) return Math.floor(t / 1000);
    if (t > 1e9) return Math.floor(t);
  }
  if (typeof t === "string") {
    // numeric string
    if (/^\d+$/.test(t)) return normalizeTS(Number(t));
    // ISO
    const d = Date.parse(t);
    if (!isNaN(d)) return Math.floor(d / 1000);
  }
  return null;
}

function isFiniteNumber(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function getLastTS(cand) {
  if (cand.tuple) {
    const a = cand.arr[cand.arr.length - 1];
    return normalizeTS(a?.[0]);
  }
  const row = cand.arr[cand.arr.length - 1] || {};
  return normalizeTS(row?.[cand.tKey]);
}

