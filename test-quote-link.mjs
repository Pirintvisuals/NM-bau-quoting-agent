// A quote link ends up in a Bigin URL field, which holds at most 255
// characters. Check every flow, language, size form and tier - with the largest
// amounts - stays under that, and that no contact detail ends up in the link.
import { buildQuoteLink } from "./api/faq-agent.js";

const LIMIT = 255;
const HOST = "nm-bau-quoting-agent.vercel.app";
let fail = 0;
let longest = 0;

for (const lang of ["hu", "en", "de"]) {
    for (const projectType of ["furdo", "konyha", "lakas", "haz", "szoba"]) {
        for (const size of ["s_3_4", "s_11p", "nem_tudom", "999,5", "120 m2", "", null]) {
            for (const tier of ["basic", "premium", "nem_tudom", null]) {
                const sel = { projectType, size, tier, name: "Teszt Elek", email: "teszt@example.com", phone: "+36 30 000 0000" };
                const quote = { low: 9_999_999_999, high: 9_999_999_999, currency: lang === "hu" ? "huf" : "eur", basis: "turnkey" };
                const link = buildQuoteLink(sel, quote, lang, HOST);
                const d = new URL(link).searchParams.get("d");
                const a = JSON.parse(Buffer.from(d, "base64url").toString("utf8"));
                longest = Math.max(longest, link.length);
                const problems = [];
                if (link.length > LIMIT) problems.push(`${link.length} karakter`);
                if (!Array.isArray(a) || a.length !== 10 || a[0] !== 2) problems.push("rossz formátum");
                if (/Teszt|example|000 0000/.test(JSON.stringify(a))) problems.push("személyes adat a linkben");
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

console.log(fail ? `\n✗ ${fail} hibás eset` : `\n✓ minden árajánlat-link belefér a 255 karakterbe (leghosszabb: ${longest})`);
process.exitCode = fail ? 1 : 0;
