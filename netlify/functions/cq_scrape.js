// netlify/functions/cq_scrape.js
const MAP = {
  sopr: "https://cryptoquant.com/asset/btc/indicator/sopr",
  mvrv: "https://cryptoquant.com/asset/btc/indicator/mvrv",
};

exports.handler = async (event) => {
  try {
    const metric = (event.queryStringParameters?.metric || "").toLowerCase();
    if (!MAP[metric]) return json(400, { error: "Use ?metric=sopr or ?metric=mvrv" });

    const cookie = process.env.CQ_COOKIE || "";
    if (!cookie) return json(500, { error: "CQ_COOKIE is missing in environment" });

    const url = MAP[metric];
    const r = await fetch(url, {
      headers: {
        cookie,
        "user-agent": "Mozilla/5.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        referer: "https://cryptoquant.com/",
      },
      redirect: "manual",
    });

    const html = await r.text();

    // لو في تحويل (تسجيل دخول مثلاً)
    if (r.status >= 300 && r.status < 400) {
      return json(502, { error: "Redirected (probably not logged in)", status: r.status, location: r.headers.get("location") });
    }
    if (!html || !html.includes("<script")) {
      return json(502, { error: "Unexpected body from CQ", status: r.status, snippet: (html || "").slice(0, 160) });
    }

    // ✅ Regex أقوى يلتقط سكربت __NEXT_DATA__
    const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!m) {
      return json(502, { error: "Could not find __NEXT_DATA__ in page", status: r.status, snippet: html.slice(0, 160) });
    }

    let nextData;
    try {
      nextData = JSON.parse(m[1]);
    } catch (e) {
      return json(502, { error: "Parse __NEXT_DATA__ failed", msg: e.message });
    }

    const series = findSeries(nextData);
    if (!series || !series.length) return json(404, { error: "No time series found" });

    const last = series[series.length - 1];
    return json(200, { metric, points: series.slice(-120), latest: last });

  } catch (e) {
    return json(500, { error: e.message });
  }
};

function json(code, obj) {
  return { statusCode: code, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}

function findSeries(root) {
  // نمشي داخل الشجرة ونلتقط أي مصفوفة على شكل {t,time}/{v,value}
  let found = null;
  (function walk(obj) {
    if (found) return;
    if (Array.isArray(obj)) {
      if (
        obj.length &&
        typeof obj[0] === "object" &&
        obj[0] &&
        ("t" in obj[0] || "time" in obj[0]) &&
        ("v" in obj[0] || "value" in obj[0])
      ) {
        found = obj
          .map(o => ({ t: o.t ?? o.time, v: o.v ?? o.value }))
          .filter(x => x.t != null && x.v != null);
        return;
      }
      for (const it of obj) walk(it);
      return;
    }
    if (obj && typeof obj === "object") {
      for (const k of Object.keys(obj)) {
        walk(obj[k]);
        if (found) return;
      }
    }
  })(root);
  return found;
}
