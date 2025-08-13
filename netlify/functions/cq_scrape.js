// netlify/functions/cq_scrape.js
export const config = { path: "/.netlify/functions/cq_scrape" };

/**
 * Scrape SOPR / MVRV time-series from CryptoQuant public pages (requires logged-in cookie).
 * Set env var: CQ_COOKIE (copy full cookie string from browser).
 *
 * Test:
 *  /.netlify/functions/cq_scrape?metric=sopr
 *  /.netlify/functions/cq_scrape?metric=mvrv
 *  /.netlify/functions/cq_scrape?metric=sopr&debug=1
 */

const MAP = {
  sopr: "https://cryptoquant.com/asset/btc/indicator/sopr",
  mvrv: "https://cryptoquant.com/asset/btc/indicator/mvrv",
};

// -------- small utils --------
function jsonSafeParse(s) { try { return JSON.parse(s); } catch { return null; } }

// recursive finder for any array of { time/value }-like points
function findTimeSeries(node) {
  const paths = [];
  function rec(n, path) {
    if (!n) return;
    if (Array.isArray(n) && n.length > 10 && typeof n[0] === "object") {
      const keys = Object.keys(n[0] || {});
      const hasTime = keys.some(k => /time|date|t|x/i.test(k));
      const hasVal  = keys.some(k => /value|v|y|val/i.test(k));
      if (hasTime && hasVal) paths.push({ path, sample: n.slice(-5) });
    }
    if (typeof n === "object") {
      for (const k of Object.keys(n)) rec(n[k], path.concat(k));
    }
  }
  rec(node, []);
  return paths;
}

function ok(json) {
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function bad(status, msg) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function handler(event) {
  try {
    const metric = (event.queryStringParameters?.metric || "").toLowerCase();
    const debug  = event.queryStringParameters?.debug === "1";
    if (!MAP[metric]) return bad(400, "Use ?metric=sopr or ?metric=mvrv");

    const COOKIE = process.env.CQ_COOKIE || "";
    if (!COOKIE || COOKIE.length < 50) {
      return bad(500, "CQ_COOKIE missing or too short in environment");
    }

    const url = MAP[metric];

    // Stronger headers help avoid being served a stripped page
    const res = await fetch(url, {
      headers: {
        "cookie": COOKIE,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "referer": "https://cryptoquant.com/",
      },
    });

    const html = await res.text();

    if (debug) {
      return ok({
        status: res.status,
        url,
        length: html.length,
        hasNextData: html.includes('__NEXT_DATA__'),
        snippet: html.slice(0, 200),
      });
    }

    if (res.status >= 400) {
      return bad(res.status, `Upstream status ${res.status}`);
    }

    // 1) Extract Next.js data blob
    const m = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/
    );
    if (!m) return bad(502, "Could not find __NEXT_DATA__ in page");

    const nextData = jsonSafeParse(m[1]);
    if (!nextData) return bad(502, "Failed to parse __NEXT_DATA__ JSON");

    // 2) Search inside for time-series arrays
    const found = findTimeSeries(nextData);
    if (!found.length) return bad(404, "No time series found");

    // 3) Heuristic: pick the LONGEST candidate (most points)
    let best = found[0];
    let bestLen = best.sample.length;
    function getByPath(obj, path) {
      return path.reduce((acc, k) => (acc ? acc[k] : undefined), obj);
    }
    for (const cand of found) {
      const arr = getByPath(nextData, cand.path) || [];
      if (Array.isArray(arr) && arr.length > bestLen) {
        best = cand;
        bestLen = arr.length;
      }
    }
    const fullArr = getByPath(nextData, best.path);

    // 4) Normalize points → { time, value }
    const norm = fullArr.map(p => {
      // try common key names
      const t = p.time ?? p.t ?? p.date ?? p.x ?? null;
      const v = p.value ?? p.v ?? p.y ?? p.val ?? null;
      return { time: t, value: v };
    }).filter(d => d.time != null && d.value != null);

    if (!norm.length) return bad(404, "Parsed array but points were empty");

    return ok({
      metric,
      count: norm.length,
      // send last 200 points to keep payload small
      data: norm.slice(-200),
    });
  } catch (e) {
    return bad(500, `Exception: ${e.message}`);
  }
}
