// Simple read-only stats endpoint.
// Pulls aggregated usage numbers from PostHog and returns them as JSON.
// The PostHog *personal* API key is a SECRET and lives only in the
// POSTHOG_API_KEY environment variable (server-side) - never in the browser.

const PROJECT_ID = process.env.POSTHOG_PROJECT_ID || "207574";
const POSTHOG_API = process.env.POSTHOG_API_HOST || "https://eu.posthog.com";

// Constant-time string compare so the token gate can't be brute-forced by timing.
function safeEqual(a, b) {
    a = String(a == null ? "" : a); b = String(b == null ? "" : b);
    if (a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
}

export default async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.method && req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

    const key = (process.env.POSTHOG_API_KEY || "").trim();

    if (!key) {
        return res.status(500).json({
            error: "POSTHOG_API_KEY is not set in the environment.",
        });
    }

    // Guard only against a masked / mis-pasted value: the bullet dots PostHog
    // shows are non-ASCII and would crash the HTTP header. A real key is plain
    // ASCII, so we don't assume any particular prefix here.
    if (/[^\x20-\x7E]/.test(key)) {
        return res.status(500).json({
            error: "POSTHOG_API_KEY contains masked/invalid characters. Copy the actual key text from PostHog (not the dots) and update it in Vercel, then redeploy.",
        });
    }

    // Optional password gate. If STATS_TOKEN is set in Vercel, the page must
    // send ?token=... that matches it. If it's not set, the page is open.
    const token = process.env.STATS_TOKEN;
    if (token) {
        let given = (req.query && req.query.token) ||
            (req.headers && req.headers["x-stats-token"]) ||
            (req.url && req.url.split("token=")[1]) || "";
        try { given = decodeURIComponent(given); } catch (e) { /* keep raw */ }
        if (!safeEqual(given, token)) {
            return res.status(401).json({ error: "Wrong or missing password." });
        }
    }

    // How many days back to count. ?days=7 etc. Default 30.
    let days = parseInt((req.query && req.query.days) || "30", 10);
    if (!Number.isFinite(days) || days < 1 || days > 365) days = 30;

    const hogql = `
        SELECT
            coalesce(properties.client, '(unknown)') AS client,
            countIf(event = 'widget_loaded')                       AS loaded,
            countIf(event = 'chat_opened')                         AS opened,
            countIf(event = 'quote_started')                       AS started,
            countIf(event = 'quote_completed')                     AS completed,
            countIf(event = 'email_requested')                     AS emails,
            count(DISTINCT person_id)                              AS people
        FROM events
        WHERE timestamp > now() - INTERVAL ${days} DAY
        GROUP BY client
        ORDER BY loaded DESC
    `;

    try {
        const r = await fetch(`${POSTHOG_API}/api/projects/${PROJECT_ID}/query/`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: { kind: "HogQLQuery", query: hogql },
            }),
        });

        if (!r.ok) {
            const text = await r.text();
            return res.status(502).json({
                error: `PostHog said ${r.status}.`,
                detail: text.slice(0, 500),
            });
        }

        const data = await r.json();
        const rows = (data.results || []).map((row) => ({
            client: row[0],
            loaded: row[1],
            opened: row[2],
            started: row[3],
            completed: row[4],
            emails: row[5],
            people: row[6],
        }));

        return res.status(200).json({ days, rows });
    } catch (e) {
        return res.status(500).json({ error: String(e && e.message || e) });
    }
}
