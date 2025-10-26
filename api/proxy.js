// /api/proxy.js
export default async function handler(req, res) {
  const BACKEND_URL =
    "https://script.google.com/macros/s/AKfycbxn1WhLs8RR2KgdIUGYggiDsUZcjbLKPvPjlU4kMqi-zyIkugS3ACPLdkhTVn4AJI7K/exec"; 

  try {
    const method = req.method;
    const url = new URL(BACKEND_URL);
    const options = { method };

    if (method === "GET") {
      for (const [k, v] of Object.entries(req.query || {})) {
        url.searchParams.append(k, v);
      }
    } else if (method === "POST") {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(req.body || {})) {
        body.append(k, typeof v === "object" ? JSON.stringify(v) : v);
      }
      options.headers = { "Content-Type": "application/x-www-form-urlencoded" };
      options.body = body.toString();
    }

    const response = await fetch(url.toString(), options);
    const text = await response.text();

    res.setHeader("Access-Control-Allow-Origin", "*");

    try {
      res.status(response.status).json(JSON.parse(text));
    } catch {
      res.status(response.status).send(text);
    }
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: err.message });
  }
}
