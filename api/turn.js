// Vercel serverless function: GET /api/turn
// Returns { iceServers: [...] } for RTCPeerConnection/PeerJS using Metered's
// free TURN (no credit card). The secret API key never reaches the browser.
//
// Required Vercel env vars (Production):
//   METERED_APP      - Metered app subdomain (the "xxxx" in xxxx.metered.live)
//   METERED_API_KEY  - Metered secret / API key
//
// If unconfigured or errored, the client falls back to STUN-only so
// same-network play still works.

export default async function handler(req, res) {
  const app = process.env.METERED_APP;
  const key = process.env.METERED_API_KEY;

  res.setHeader("Cache-Control", "no-store");

  if (!app || !key) {
    res.status(503).json({ error: "TURN not configured (missing METERED_APP / METERED_API_KEY)" });
    return;
  }

  try {
    const url = `https://${app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`;
    const r = await fetch(url);
    const text = await r.text();

    if (!r.ok) {
      res.status(502).json({ error: "metered", status: r.status, detail: text.slice(0, 500) });
      return;
    }

    let ice = JSON.parse(text);
    // Metered returns a bare array of iceServers; accept a wrapped shape too.
    if (ice && !Array.isArray(ice) && Array.isArray(ice.iceServers)) ice = ice.iceServers;
    if (!Array.isArray(ice) || ice.length === 0) {
      res.status(502).json({ error: "unexpected response shape", detail: text.slice(0, 500) });
      return;
    }

    res.status(200).json({ iceServers: ice });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
