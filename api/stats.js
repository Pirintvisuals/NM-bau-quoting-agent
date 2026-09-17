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

    const since = `timestamp > now() - INTERVAL ${days} DAY`;
    const sid = "properties.$session_id";
    // Unique visits (PostHog sessions) that reached each step, per widget.
    const u = (ev) => `count(DISTINCT if(event = '${ev}', ${sid}, NULL))`;
    const funnelQ = `
        SELECT
            coalesce(properties.client, '(unknown)') AS client,
            ${u("widget_loaded")}          AS loaded,
            ${u("chat_opened")}            AS opened,
            ${u("quote_started")}          AS started,
            ${u("question_answered")}      AS answered_one,
            ${u("contact_form_shown")}     AS contact_form,
            ${u("quote_completed")}        AS completed,
            ${u("email_requested")}        AS emails,
            ${u("widget_error")}           AS errors,
            count(DISTINCT person_id)       AS people
        FROM events
        WHERE ${since}
        GROUP BY client
        ORDER BY loaded DESC
        LIMIT 1000
    `;
    // Last question each visit answered (field name only).
    const lastFieldQ = `
        SELECT coalesce(properties.client, '(unknown)') AS client, ${sid} AS sid,
               argMax(properties.field, timestamp) AS last_field,
               count() AS answers
        FROM events
        WHERE ${since} AND event = 'question_answered'
        GROUP BY client, sid
        LIMIT 50000
    `;
    // Visits that started / finished, so we know who dropped.
    const sessionsQ = `
        SELECT coalesce(properties.client, '(unknown)') AS client, ${sid} AS sid,
               max(if(event = 'quote_completed', 1, 0)) AS done
        FROM events
        WHERE ${since} AND event IN ('quote_started', 'quote_completed')
        GROUP BY client, sid
        LIMIT 50000
    `;

    async function runQuery(hogql) {
        const r = await fetch(`${POSTHOG_API}/api/projects/${PROJECT_ID}/query/`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql } }),
        });
        if (!r.ok) {
            const text = await r.text();
            const err = new Error(`PostHog said ${r.status}.`);
            err.detail = text.slice(0, 500);
            throw err;
        }
        const data = await r.json();
        return data.results || [];
    }

    try {
        const [funnel, lastFields, sessions] = await Promise.all([
            runQuery(funnelQ), runQuery(lastFieldQ), runQuery(sessionsQ),
        ]);

        const rows = funnel.map((row) => ({
            client: row[0],
            loaded: row[1],
            opened: row[2],
            started: row[3],
            answeredOne: row[4],
            contactForm: row[5],
            completed: row[6],
            emails: row[7],
            errors: row[8],
            people: row[9],
        }));

        // Drop-off: every visit that started but never finished, bucketed by the
        // last question it answered ("(none)" = left before answering anything).
        const last = new Map();
        lastFields.forEach(([client, id, field]) => last.set(client + "|" + id, field));
        const dropoff = {};
        sessions.forEach(([client, id, done]) => {
            if (done) return;
            const field = last.get(client + "|" + id) || "(none)";
            dropoff[client] = dropoff[client] || {};
            dropoff[client][field] = (dropoff[client][field] || 0) + 1;
        });

        return res.status(200).json({ days, rows, dropoff });
    } catch (e) {
        if (e && e.detail) return res.status(502).json({ error: e.message, detail: e.detail });
        return res.status(500).json({ error: String(e && e.message || e) });
    }
}
