// A customer's question once reached the CRM as the lead's name
// ("Mennyibe kerülne?"). Check that only a real name gets through, on every
// path the name can arrive by: typed into the chat box, the contact form, and
// a value already sitting in the state (the widget or the model's DATA block).
// Run: node test-name.mjs   (exits non-zero on any failure)
import http from "node:http";

// Catch the Zoho webhook locally instead of posting to the real Flow.
const hooks = [];
const catcher = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { hooks.push(JSON.parse(body)); res.end("ok"); });
});
await new Promise((r) => catcher.listen(0, "127.0.0.1", r));
process.env.ZOHO_FLOW_WEBHOOK_URL = `http://127.0.0.1:${catcher.address().port}/hook`;
delete process.env.RESEND_API_KEY;
delete process.env.VERCEL;
console.log = () => {}; // the handler logs every lead; keep the output readable

const { default: handler, nameIssue, budgetBandsFor } = await import("./api/faq-agent.js");

const CASES = [
    ["Mennyibe kerülne?", false],
    ["Kovács Péter", true],
    ["", false],
    ["asd123", false],
    ["Szeretnénk megkérdezni, hogy körülbelül mennyibe kerülne egy teljes fürdőszoba felújítás Budapesten.", false],
];
if (CASES[4][0].length !== 100) throw new Error("the long case must be 100 characters");

// A bathroom with every price question answered: the name is the next thing asked.
const BASE = { projectType: "furdo", size: "s_5_6", tier: "mid", washing: "kad", layout: "marad", heating: "nem", timeline: "t_month" };
const BUDGET = budgetBandsFor(BASE, "hu").chips[0];
const CONTACT = { postal_code: "Sopron", phone: "+36 30 123 4567", email: "", budget: BUDGET };

async function call(body) {
    let out;
    const res = { setHeader() {}, status() { return this; }, json(o) { out = o; return this; }, end() { return this; } };
    await handler({ method: "POST", headers: {}, query: {}, socket: {}, body: { lang: "hu", history: [{ role: "user", content: "Szia" }], ...body } }, res);
    await new Promise((r) => setTimeout(r, 50)); // let the background webhook land
    return out;
}

let fail = 0;
const check = (ok, label) => { if (!ok) fail++; console.info(`${ok ? "PASS" : "FAIL"}  ${label}`); };

for (const [name, valid] of CASES) {
    const tag = JSON.stringify(name.length > 30 ? name.slice(0, 27) + "..." : name);
    check((nameIssue(name) === null) === valid, `nameIssue ${tag} -> ${valid ? "accepted" : "rejected"}`);

    // 1) Typed into the chat box while the contact form is waiting.
    if (name) {
        const r = await call({ question: name, state: BASE });
        check(valid
            ? r.state.name === name && r.form && r.form.fields[0].value === name
            : !r.state.name && /szólíthatjuk/.test(r.answer) && !!r.form,
            `typed ${tag}: ${valid ? "recorded" : "re-asked, form shown again"}`);
    }

    // 2) Submitted through the contact form.
    hooks.length = 0;
    const f = await call({ contact: { name, ...CONTACT }, state: BASE });
    check(valid
        ? !!f.lead && hooks.length === 1 && hooks[0].name === name
        : !f.lead && !!f.formErrors && !!f.formErrors.name && hooks.length === 0,
        `form ${tag}: ${valid ? "quote + webhook with this name" : "name marked, no webhook"}`);

    // 3) Already in the state (widget state / model DATA block), everything else filled.
    hooks.length = 0;
    const s = await call({ question: "Mikor tudnak kijönni?", state: { ...BASE, ...CONTACT, name } });
    check(valid
        ? !!s.lead && hooks.length === 1 && hooks[0].name === name
        : !s.lead && hooks.length === 0 && !!s.form,
        `state ${tag}: ${valid ? "quote + webhook" : "dropped, asked again, no webhook"}`);
}

catcher.close();
console.info(fail ? `\n${fail} FAILED` : "\nAll name checks passed.");
process.exit(fail ? 1 : 0);
