// Read-only conversation endpoint for the /ajanlat page:
// GET /api/transcript?id=<32-character id>.
//
// finishQuote() in api/faq-agent.js saves each finished conversation as a
// private Vercel Blob file, transcripts/<id>.json, and puts the id in the quote
// link as &c=<id>. This hands that file back to public/ajanlat-page.js.
//
// The conversation includes the customer's name, phone and e-mail. The id is
// 192 random bits, so it cannot be guessed or listed; anything that is not
// exactly a well-formed id, or not found, gets the same plain 404. Nothing here
// can list, write or delete - only read one file whose id you already hold.

import { get } from "@vercel/blob";

const TRANSCRIPT_PREFIX = "transcripts/"; // same folder saveTranscript() writes to
const ID_RE = /^[A-Za-z0-9_-]{32}$/;

function notFound(res) {
    return res.status(404).json({ error: "not_found" });
}

export default async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Personal data: never cached by a browser, proxy or CDN.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    if (req.method && req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

    const id = req.query && typeof req.query.id === "string" ? req.query.id : "";
    if (!ID_RE.test(id)) return notFound(res);
    // Store connected? (BLOB_STORE_ID + the deployment's OIDC token, or a
    // read-write token - same check as transcriptStoreEnabled in faq-agent.js.)
    if (!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN || "").trim()) return notFound(res);

    try {
        const blob = await get(`${TRANSCRIPT_PREFIX}${id}.json`, { access: "private", useCache: false });
        if (!blob || blob.statusCode !== 200 || !blob.stream) return notFound(res);
        const doc = JSON.parse(await new Response(blob.stream).text());
        if (!doc || !Array.isArray(doc.messages)) return notFound(res);
        return res.status(200).json({
            lang: doc.lang || null,
            created_at: doc.created_at || null,
            messages: doc.messages,
        });
    } catch (err) {
        console.error("Beszelgetes olvasasa sikertelen:", (err && err.message) || String(err));
        return res.status(502).json({ error: "unavailable" });
    }
}
