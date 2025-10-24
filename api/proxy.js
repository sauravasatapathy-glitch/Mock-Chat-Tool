export default async function handler(req, res) {
  const targetUrl = "https://script.google.com/macros/s/AKfycbxn1WhLs8RR2KgdIUGYggiDsUZcjbLKPvPjlU4kMqi-zyIkugS3ACPLdkhTVn4AJI7K/exec";

  try {
    const method = req.method;
    const headers = { "Content-Type": "application/json" };

    // Forward GET or POST to Apps Script
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.text();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }

    res.status(response.status).send(data);
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: "Proxy failed", details: error.message });
  }
}
