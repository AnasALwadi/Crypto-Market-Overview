// netlify/functions/debug_env.js
exports.handler = async () => {
  const c = process.env.CQ_COOKIE || "";
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      CQ_COOKIE_present: c.length > 0,
      CQ_COOKIE_length: c.length
    }),
  };
};
