// A quote link ends up in a Bigin URL field, which holds at most 255
// characters. Check every flow, language, size form and tier - with the largest
// amounts and a conversation id - stays under that, and that no contact detail
// ends up in the link.
import { buildQuoteLink, transcriptMessages } from "./api/faq-agent.js";

const LIMIT = 255;
const HOST = "nm-bau-quoting-agent.vercel.app";
const CHAT_ID = "A".repeat(32);
let fail = 0;
let longest = 0;

for (const lang of ["hu", "en", "de"]) {
    for (const projectType of ["furdo", "konyha", "lakas", "haz", "szoba"]) {
        for (const size of ["s_3_4", "s_11p", "nem_tudom", "999,5", "120 m2", "", null]) {
            for (const tier of ["basic", "premium", "nem_tudom", null]) {
                const sel = { projectType, size, tier, name: "Teszt Elek", email: "teszt@example.com", phone: "+36 30 000 0000" };
                const quote = { low: 9_999_999_999, high: 9_999_999_999, currency: lang === "hu" ? "huf" : "eur", basis: "turnkey" };
                const link = buildQuoteLink(sel, quote, lang, HOST, CHAT_ID);
                const url = new URL(link);
                const d = url.searchParams.get("d");
                const a = JSON.parse(Buffer.from(d, "base64url").toString("utf8"));
                longest = Math.max(longest, link.length);
                const problems = [];
                if (link.length > LIMIT) problems.push(`${link.length} karakter`);
                if (!Array.isArray(a) || a.length !== 10 || a[0] !== 2) problems.push("rossz formátum");
                if (url.searchParams.get("c") !== CHAT_ID) problems.push("hiányzik a beszélgetés azonosítója");
                if (/Teszt|example|000 0000/.test(link + JSON.stringify(a))) problems.push("személyes adat a linkben");
                if (problems.length) {
                    fail++;
                    console.log(`✗ ${lang} ${projectType} size=${JSON.stringify(size)} tier=${tier}: ${problems.join(", ")}`);
                }
            }
        }
    }
}

// A host that is not a plain hostname must not produce a link at all.
if (buildQuoteLink({ projectType: "furdo" }, { low: 1, high: 2 }, "hu", 'evil.com/"><script>') !== null) {
    fail++;
    console.log("✗ hamis host mellett is készült link");
}

// No id (Blob store not connected) or a malformed one: the link has no c= part.
for (const id of [null, "short", "A".repeat(31) + "/"]) {
    const link = buildQuoteLink({ projectType: "furdo" }, { low: 1, high: 2 }, "hu", HOST, id);
    if (new URL(link).searchParams.has("c")) {
        fail++;
        console.log(`✗ érvénytelen azonosítóval (${JSON.stringify(id)}) is került c= a linkbe`);
    }
}

// What gets saved: the hidden kickoff and the model's control blocks left out.
// Every customer message keeps its exact wording and how it was given.
const saved = transcriptMessages([
    { role: "user", content: "Szeretnék árajánlatot egy felújításra." },
    { role: "assistant", content: "Milyen munkáról van szó?<!--DATA:{\"projectType\":null}--><!--CHIPS:[\"Fürdő\"]-->" },
    { role: "user", content: "Fürdő", via: "chip" },
    { role: "model", content: "**Mekkora?**" },
    { role: "user", content: "kb 2x3 meter asszem", via: "typed" },
    { role: "user", content: "Teszt Elek · 1134", via: "form" },
    { role: "model", content: "Kész.[[SPLIT]]Második buborék", via: "typed" },
    { role: "user", content: "régi widget", via: "valami" },
    { role: "system", content: "rejtett" },
    { role: "user", content: "   " },
]);
const expected = [
    { role: "assistant", text: "Milyen munkáról van szó?" },
    { role: "customer", text: "Fürdő", via: "chip" },
    { role: "assistant", text: "Mekkora?" },
    { role: "customer", text: "kb 2x3 meter asszem", via: "typed" },
    { role: "customer", text: "Teszt Elek · 1134", via: "form" },
    { role: "assistant", text: "Kész.\n\nMásodik buborék" },
    { role: "customer", text: "régi widget" },
];
if (JSON.stringify(saved) !== JSON.stringify(expected)) {
    fail++;
    console.log("✗ a mentett beszélgetés nem az elvárt:", JSON.stringify(saved));
}

console.log(fail ? `\n✗ ${fail} hibás eset` : `\n✓ minden árajánlat-link belefér a 255 karakterbe (leghosszabb: ${longest}), a beszélgetés tisztán mentődik`);
process.exitCode = fail ? 1 : 0;
