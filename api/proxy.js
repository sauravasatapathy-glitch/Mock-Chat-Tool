export default async function handler(req, res) {
  // 🔹 Replace this with your actual Google Apps Script Web App URL
  const SCRIPT_URL = "https://script.google.com/a/macros/24-7intouch.com/s/AKfycbxn1WhLs8RR2KgdIUGYggiDsUZcjbLKPvPjlU4kMqi-zyIkugS3ACPLdkhTVn4AJI7K/exec";

  try {
    // Forward the request to your Apps Script web app
    const response = await fetch(SCRIPT_URL, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
      },
      body: req.method === "POST" ? JSON.stringify(req.body) : undefined,
    });

    // Get text response (Apps Script may return plain text or JSON)
    const data = await response.text();

    // Forward status + data back to the browser
    res.status(response.status).send(data);
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: "Proxy failed to reach Apps Script" });
  }
}
