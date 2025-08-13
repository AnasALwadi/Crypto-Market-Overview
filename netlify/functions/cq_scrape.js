// netlify/functions/cq_scrape.js
// Scrape SOPR / MVRV from CryptoQuant public pages using a session cookie in CQ_COOKIE

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

function deepScan(node, fn) {
  try { fn(node); } catch {}
  if (Array.isArray(node)) for (const x of node) deepScan(x, fn);
  else if (node && typeof node === "object") for (const k of Object.keys(node)) deepScan(node[k], fn);
}

function normalizeTS(t) {
  if (typeof t === "number") {
    if (t > 1e12) return Math.floor(t/1000);
    if (t > 1e9) return Math.floor(t);
  }
  if (typeof t === "string") {
    if (/^\d+$/.test(t)) return normalizeTS(Number(t));
    const d = Date.parse(t);
    if (!isNaN(d)) return Math.floor(d/1000);
  }
  return null;
}

function isFiniteNumber(x){ return typeof x === "number" && Number.isFinite(x); }
function getLastTS(cand){
  if (cand.tuple) return normalizeTS(cand.arr[cand.arr.length-1]?.[0]);
  const row = cand.arr[cand.arr.length-1] || {};
  return normalizeTS(row?.[cand.tKey]);
}

export async function handler(event){
  try{
    const metric = (event.queryStringParameters?.metric || "").toLowerCase();
    const MAP = {
      sopr: "https://cryptoquant.com/asset/btc/indicator/sopr",
      mvrv: "https://cryptoquant.com/asset/btc/indicator/mvrv",
    };
    if(!MAP[metric]) return json(400,{error:"Use ?metric=sopr or ?metric=mvrv"});

    const cookie = process.env.CQ_COOKIE || "";
    if(!cookie) return json(500,{error:"CQ_COOKIE not set on Netlify"});

    // Strong browser-like headers; referrer helps أحيانًا
    const res = await fetch(MAP[metric], {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "upgrade-insecure-requests": "1",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "referer": "https://cryptoquant.com/",
        "cookie": cookie,
      },
      redirect: "follow",
    });

    const status = res.status;
    const finalURL = res.url;
    const html = await res.text();

    // Quick fail if got redirected to login or challenge page
    const looksLikeLogin = /next-auth|signin|sign in|verify you are a human/i.test(html);
    if(status !== 200 || looksLikeLogin){
      if(event.queryStringParameters?.debug === "1"){
        return json(502, {error:"Bad/blocked response", status, finalURL, snippet: html.slice(0,400)});
      }
      return json(502, {error:"Unable to fetch page (blocked/redirected). Add &debug=1 for details."});
    }

    // Try several patterns for __NEXT_DATA__
    let m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/);
    if(!m){
      m = html.match(/window\.__NEXT_DATA__\s*=\s*({[\s\S]+?});?\s*<\/script>/);
    }
    if(!m){
      if(event.queryStringParameters?.debug === "1"){
        return json(502, { error:"Unable to locate __NEXT_DATA__", status, finalURL, snippet: html.slice(0,400) });
      }
      return json(502, { error:"Unable to locate __NEXT_DATA__. Add &debug=1 to inspect." });
    }

    let root;
    try{ root = JSON.parse(m[1]); }
    catch(e){
      if(event.queryStringParameters?.debug === "1"){
        return json(502, { error:"Failed to parse __NEXT_DATA__", msg: e.message, head: m[1].slice(0,200) });
      }
      return json(502, { error:"Failed to parse __NEXT_DATA__" });
    }

    // Deep scan for time-series arrays
    const candidates = [];
    deepScan(root, (node) => {
      // array of objects
      if(Array.isArray(node) && node.length>=30 && typeof node[0]==="object"){
        const keys = Object.keys(node[0] || {});
        const tKey = keys.find(k => /^(time|timestamp|t|x|date)$/i.test(k));
        const vKey = keys.find(k => /^(value|y|v|val|price|close)$/i.test(k));
        if(!tKey || !vKey) return;
        let ok=0;
        for(let i=0;i<Math.min(node.length,50);i++){
          const ts = normalizeTS(node[i]?.[tKey]);
          const v = node[i]?.[vKey];
          if(!ts || !isFiniteNumber(Number(v))) break;
          ok++;
        }
        if(ok>=20) candidates.push({arr:node,tKey,vKey});
      }
      // array of tuples
      if(Array.isArray(node) && node.length>=30 && Array.isArray(node[0])){
        let ok=0;
        for(let i=0;i<Math.min(node.length,50);i++){
          const a=node[i]; if(!Array.isArray(a) || a.length<2) break;
          const ts=normalizeTS(a[0]); const v=Number(a[1]);
          if(!ts || !isFiniteNumber(v)) break;
          ok++;
        }
        if(ok>=20) candidates.push({arr:node,tuple:true});
      }
    });

    if(!candidates.length){
      if(event.queryStringParameters?.debug === "1"){
        return json(404,{error:"No time series found", status, finalURL, hasNext: !!m, keys: Object.keys(root||{}).slice(0,20)});
      }
      return json(404,{error:"No time series found"});
    }

    candidates.sort((A,B)=>{
      const lenDiff = B.arr.length - A.arr.length;
      if(lenDiff) return lenDiff;
      return (getLastTS(B)||0) - (getLastTS(A)||0);
    });

    const best = candidates[0];
    const series = best.arr.map(row=>{
      let ts, val;
      if(best.tuple){ ts = normalizeTS(row[0]); val = Number(row[1]); }
      else { ts = normalizeTS(row[best.tKey]); val = Number(row[best.vKey]); }
      return (ts && isFiniteNumber(val)) ? { t: ts, v: val } : null;
    }).filter(Boolean);

    if(!series.length) return json(404,{error:"Parsed empty series"});

    const latest = series[series.length-1];

    if(event.queryStringParameters?.debug === "1"){
      return json(200,{
        ok:true, status, finalURL,
        candidateCount: candidates.length,
        picked: { length: series.length, lastTS: latest.t, lastVal: latest.v },
      });
    }

    return json(200,{ metric, latest: latest.v, series });

  }catch(e){
    return json(500,{error:e.message || "Internal error"});
  }
}
