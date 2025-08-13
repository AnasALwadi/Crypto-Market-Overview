// netlify/functions/test_fetch.js
exports.handler = async () => {
  try {
    const cookie = process.env.CQ_COOKIE || "";
    if (!cookie) return { statusCode: 400, body: "CQ_COOKIE missing" };

    const url = "https://cryptoquant.com/asset/btc/indicator/sopr";
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

    const text = await r.text();
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: r.status,
        location: r.headers.get("location") || null,
        snippet: text.slice(0, 160),
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: "ERR: " + e.message };
  }
};
