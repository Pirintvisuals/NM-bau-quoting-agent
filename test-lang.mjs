// Language-detection check for the chat.
// Run: node test-lang.mjs   (exits non-zero on any wrong detection)
//
// The rule being tested: the customer's OWN writing decides the language, and a
// wrong guess is worse than no guess. detectMessageLang returns null whenever it
// is not sure, and null means "keep the language we already had".
import { detectMessageLang, conversationLang } from './api/faq-agent.js';

let failed = 0;
const check = (label, got, want) => {
    const ok = got === want;
    if (!ok) failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}  ->  ${JSON.stringify(got)}${ok ? '' : `   (expected ${JSON.stringify(want)})`}`);
};

console.log('\n■ Typed prose - must be detected');
[
    ['Wieviel kostet eine komplette Badrenovierung?', 'de'],
    ['Ich hätte gerne ein Angebot für die Renovierung meiner Wohnung.', 'de'],
    ['Guten Tag, können Sie mir bitte ein Angebot machen?', 'de'],
    ['Hallo, ich brauche einen Kostenvoranschlag.', 'de'],
    ['How much would a full bathroom renovation cost?', 'en'],
    ['Hi, I would like a quote for my flat please.', 'en'],
    ['I am just wondering about the price, thanks', 'en'],
    ['Mennyibe kerülne egy teljes fürdőszoba felújítás?', 'hu'],
    ['Jó napot, szeretnék egy árajánlatot kérni.', 'hu'],
    ['Köszönöm, akkor inkább csak festés kellene', 'hu'],
].forEach(([t, want]) => check(JSON.stringify(t).slice(0, 62), detectMessageLang(t), want));

console.log('\n■ Contact answers - must NEVER switch the language (null = keep current)');
[
    'Hans Müller', 'Teszt Elek', 'John Smith', 'Kovács Béla',      // names
    'Wien', 'Graz', 'Sopron', '8010 Graz', '3525',                  // locations
    'hans.mueller@gmail.com', 'nev@freemail.hu',                    // e-mail
    '+36 20 123 4567', '06301234567',                               // phone
    '6', '60', '120', '',                                           // sizes / empty
].forEach((t) => check(JSON.stringify(t), detectMessageLang(t), null));

console.log('\n■ Too weak to act on - one ambiguous word must not flip anything');
[
    'ja',      // German "yes", but also a Hungarian interjection
    'ok', 'OK', 'igen', 'yes', 'nein', 'nem', 'ok thanks',
    '?', '...', 'aha',
].forEach((t) => check(JSON.stringify(t), detectMessageLang(t), null));

console.log('\n■ Clicked chips - exact strings we generated, so exactly known');
[
    ['Fürdőszoba', 'hu'], ['Teljes lakás', 'hu'], ['Nem tudom', 'hu'], ['Kérek padlófűtést', 'hu'],
    ['Bathroom', 'en'], ['Whole flat', 'en'], ['Not sure', 'en'], ['Mid-range', 'en'],
    ['Badezimmer', 'de'], ['Weiß nicht', 'de'], ['Küche', 'de'],
].forEach(([t, want]) => check(JSON.stringify(t), detectMessageLang(t), want));

console.log('\n■ Chips whose label is identical in several languages - no signal');
[
    '6–10 m²', '10–15 m²', '3 vagy több',
].forEach((t) => {
    const got = detectMessageLang(t);
    check(JSON.stringify(t) + ' (shared or HU-only)', got === 'hu' || got === null, true);
});

console.log('\n■ Whole conversations');
const hist = (...msgs) => msgs.map((c) => ({ role: 'user', content: c }));

check('HU site, customer writes German -> de',
    conversationLang(hist('Szeretnék árajánlatot egy felújításra.', 'Ich hätte gerne ein Angebot für mein Badezimmer.'), null, 'hu'), 'de');

check('HU site, German then a NAME -> stays de',
    conversationLang(hist('Ich hätte gerne ein Angebot für mein Badezimmer.', 'Hans Müller'), null, 'hu'), 'de');

check('HU site, German then a postcode -> stays de',
    conversationLang(hist('Wieviel kostet eine Badrenovierung?', '1010 Wien'), null, 'hu'), 'de');

check('HU site, ordinary Hungarian chat -> stays hu',
    conversationLang(hist('Szeretnék árajánlatot egy felújításra.', 'Fürdőszoba', '5–6 m²', 'Közepes', 'Kovács Béla'), null, 'hu'), 'hu');

check('EN site, customer writes Hungarian -> hu',
    conversationLang(hist("I'd like a quote for a renovation.", 'Mennyibe kerülne egy teljes fürdőszoba felújítás?'), null, 'en'), 'hu');

check('DE site, customer switches back to English -> en',
    conversationLang(hist('Ich hätte gerne ein Angebot.', 'Sorry, could you please continue in English?'), null, 'de'), 'en');

check('no history at all -> falls back to the site language',
    conversationLang([], null, 'de'), 'de');

check('assistant messages are ignored',
    conversationLang([{ role: 'assistant', content: 'Wieviel kostet eine Badrenovierung? Ich frage gerne.' }], null, 'hu'), 'hu');

check('current message not yet in history is still counted',
    conversationLang(hist('Szeretnék árajánlatot.'), 'Wieviel kostet eine komplette Badrenovierung?', 'hu'), 'de');

check('garbage input falls back safely',
    conversationLang(null, undefined, 'en'), 'en');

console.log(failed ? `\n✗ ${failed} case(s) failed\n` : '\n✓ minden nyelvfelismerési eset rendben\n');
process.exit(failed ? 1 : 0);
