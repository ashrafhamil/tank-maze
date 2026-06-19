// Vercel serverless function: GET /api/presence?id=<tabId>&new=<0|1>
// Heartbeat + public counters backed by Upstash Redis (free, no card).
//   - "online now": a sorted set of tab ids scored by timestamp; entries older
//     than TTL are pruned, so the live count = fresh heartbeats.
//   - "visits": an all-time counter, incremented once per new browser (new=1).
//
// Required Vercel env vars (auto-added by the Vercel<->Upstash integration, or set
// manually):  UPSTASH_REDIS_REST_URL,  UPSTASH_REDIS_REST_TOKEN
//
// Returns { online, total }. If unconfigured/errored, returns nulls (200) so the
// client just hides the badge — never breaks the page.

const TTL_MS = 45000; // a tab counts as online if it pinged within 45s

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { res.status(200).json({ online: null, total: null }); return; }

  const id = (req.query.id || "anon").toString().slice(0, 64);
  const isNew = req.query.new === "1";
  const now = Date.now();

  const cmds = [
    ["ZADD", "tm:online", now, id],                       // 0: record this tab
    ["ZREMRANGEBYSCORE", "tm:online", 0, now - TTL_MS],   // 1: drop stale tabs
    ["ZCARD", "tm:online"],                               // 2: live count
    ["GET", "tm:visits"],                                 // 3: all-time visits
  ];
  if (isNew) cmds.push(["INCR", "tm:visits"]);            // 4: count a new browser

  try {
    const r = await fetch(url + "/pipeline", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(cmds),
    });
    const data = await r.json(); // [{result},...]
    const online = data[2] && data[2].result != null ? Number(data[2].result) : null;
    let total = data[3] && data[3].result != null ? Number(data[3].result) : 0;
    if (isNew && data[4] && data[4].result != null) total = Number(data[4].result);
    res.status(200).json({ online, total });
  } catch (e) {
    res.status(200).json({ online: null, total: null });
  }
}
