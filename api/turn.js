// Vercel serverless function: GET /api/turn
// Mints short-lived Cloudflare TURN credentials so the secret API token never
// reaches the browser. Returns { iceServers: [...] } for RTCPeerConnection/PeerJS.
//
// Required Vercel env vars (Production + Preview):
//   TURN_KEY_ID     - Cloudflare Realtime TURN "Turn Token ID"
//   TURN_API_TOKEN  - Cloudflare Realtime TURN "API Token" (secret)
//
// Falls back (client-side) to STUN-only if this is unconfigured or errors,
// so same-network play still works without Cloudflare.

export default async function handler(req, res) {
  const keyId = process.env.TURN_KEY_ID;
  const apiToken = process.env.TURN_API_TOKEN;

  res.setHeader("Cache-Control", "no-store");

  if (!keyId || !apiToken) {
    res.status(503).json({ error: "TURN not configured (missing TURN_KEY_ID / TURN_API_TOKEN)" });
    return;
  }

  try {
    const cf = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 86400 }), // 24h credentials
      }
    );

    const text = await cf.text();
    if (!cf.ok) {
      res.status(502).json({ error: "cloudflare", status: cf.status, detail: text.slice(0, 500) });
      return;
    }

    const data = JSON.parse(text);
    // Cloudflare returns iceServers as a single object; normalize to an array.
    let ice = data.iceServers;
    if (ice && !Array.isArray(ice)) ice = [ice];
    if (!Array.isArray(ice) || ice.length === 0) {
      res.status(502).json({ error: "unexpected response shape", detail: text.slice(0, 500) });
      return;
    }
    res.status(200).json({ iceServers: ice });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
}
