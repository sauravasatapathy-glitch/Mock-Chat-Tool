// /api/proxy.js
export default async function handler(req, res) {
const BACKEND_URL = "https://script.google.com/macros/s/AKfycbxn1WhLs8RR2KgdIUGYggiDsUZcjbLKPvPjlU4kMqi-zyIkugS3ACPLdkhTVn4AJI7K/exec";

  try {
    // Determine method (GET or POST)
    const method = req.method;

    // Construct target URL
    const url = new URL(BACKEND_URL);
    if (method === "GET") {
      Object.keys(req.query).forEach(k => url.searchParams.append(k, req.query[k]));
    }

    // Prepare fetch options
    const options = { method };
    if (method === "POST") {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(req.body);
    }

    // Forward the request
    const response = await fetch(url.toString(), options);
    const text = await response.text();

    // Try parsing JSON, fallback to text
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(response.status).json(JSON.parse(text));
    } catch {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(response.status).send(text);
    }
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: err.message });
  }
}
