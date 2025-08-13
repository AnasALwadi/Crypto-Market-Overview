// netlify/functions/crypto.js

const fetch = require('node-fetch');

exports.handler = async function () {
  try {
    // API مجاني من CoinGecko
    const btcRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const btcData = await btcRes.json();

    // API مجاني لمؤشر NVT من blockchaincenter.net (مثال)
    const nvtRes = await fetch("https://api.blockchaincenter.net/en/nvt-ratio/");
    const nvtHtml = await nvtRes.text();

    return {
      statusCode: 200,
      body: JSON.stringify({
        bitcoin_price_usd: btcData.bitcoin.usd,
        nvt_ratio_source: "blockchaincenter.net",
        nvt_page_snippet: nvtHtml.substring(0, 300) // قصينا النص لأنه HTML
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
