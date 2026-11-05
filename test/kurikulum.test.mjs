// Proverava skelet kurikuluma. JSON se menja rucno, pa ovaj test postoji da
// rucna izmena ne pokvari oblik koji aplikacija ocekuje.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = join(here, "..", "content", "modules");
const LOADER = join(here, "..", "app", "lib", "kurikulum.js");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}
function grupa(naslov) { console.log("\n" + naslov); }

const files = readdirSync(MODULES_DIR).filter((f) => f.endsWith(".json")).sort();
const moduli = files.map((f) => JSON.parse(readFileSync(join(MODULES_DIR, f), "utf8")));

grupa("1) Ima ih 16 i poredjani su bez praznine");
ok("16 fajlova", files.length === 16, files.length);
ok("imena fajlova su m00.json … m15.json",
  files.join(",") === Array.from({ length: 16 }, (_, i) => `m${String(i).padStart(2, "0")}.json`).join(","),
  files);
ok("redni brojevi su 0..15 bez praznine",
  moduli.map((m) => m.redni).join(",") === Array.from({ length: 16 }, (_, i) => i).join(","),
  moduli.map((m) => m.redni));
ok("id odgovara rednom broju",
  moduli.every((m) => m.id === `m${String(m.redni).padStart(2, "0")}`));
ok("nema dva ista naslova", new Set(moduli.map((m) => m.naslov)).size === 16);

grupa("2) Etape: A1 m00-m05, A2 m06-m10, B1 m11-m15");
const ocekivanNivo = (r) => (r <= 5 ? "A1" : r <= 10 ? "A2" : "B1");
const ocekivanaEtapa = { A1: 1, A2: 2, B1: 3 };
for (const m of moduli) {
  ok(`${m.id} nivo ${ocekivanNivo(m.redni)}`, m.nivo === ocekivanNivo(m.redni), m.nivo);
  ok(`${m.id} etapa odgovara nivou`, m.etapa === ocekivanaEtapa[m.nivo], { nivo: m.nivo, etapa: m.etapa });
}
ok("6 modula na A1", moduli.filter((m) => m.nivo === "A1").length === 6);
ok("5 modula na A2", moduli.filter((m) => m.nivo === "A2").length === 5);
ok("5 modula na B1", moduli.filter((m) => m.nivo === "B1").length === 5);

grupa("3) Svaki modul ima naslov, outcome, zasto, gramatiku i teme");
const tekst = (v) => typeof v === "string" && v.trim().length > 0;
const nizTeksta = (v) => Array.isArray(v) && v.length > 0 && v.every(tekst);
for (const m of moduli) {
  ok(`${m.id} naslov`, tekst(m.naslov));
  ok(`${m.id} outcome`, tekst(m.outcome));
  ok(`${m.id} zasto`, tekst(m.zasto));
  ok(`${m.id} gramatika nije prazna`, nizTeksta(m.gramatika), m.gramatika);
  ok(`${m.id} teme nisu prazne`, nizTeksta(m.teme), m.teme);
  // Outcome se u UI-ju cita kao "Na kraju ces umeti da <outcome>",
  // pa mora da pocne malim slovom i da nema tacku na kraju.
  ok(`${m.id} outcome pocinje malim slovom`,
    m.outcome[0] === m.outcome[0].toLowerCase(), m.outcome.slice(0, 20));
  ok(`${m.id} outcome bez tacke na kraju`, !m.outcome.trim().endsWith("."), m.outcome.slice(-20));
}

grupa("4) Lekcije: id, red, naslov, fokus");
const sviIdLekcija = [];
for (const m of moduli) {
  ok(`${m.id} ima najmanje 3 lekcije`, Array.isArray(m.lekcije) && m.lekcije.length >= 3,
    m.lekcije && m.lekcije.length);
  m.lekcije.forEach((l, i) => {
    ok(`${m.id} lekcija ${i + 1} id`, l.id === `${m.id}l${i + 1}`, l.id);
    ok(`${m.id} lekcija ${i + 1} redni`, l.redni === i + 1, l.redni);
    ok(`${m.id} lekcija ${i + 1} naslov`, tekst(l.naslov), l.naslov);
    ok(`${m.id} lekcija ${i + 1} fokus`, tekst(l.fokus), l.fokus);
    sviIdLekcija.push(l.id);
  });
}
ok("nijedan id lekcije se ne ponavlja",
  new Set(sviIdLekcija).size === sviIdLekcija.length, sviIdLekcija.length);
ok("ukupan broj lekcija je oko 105", sviIdLekcija.length >= 100 && sviIdLekcija.length <= 115,
  sviIdLekcija.length);

grupa("5) Loader uvozi svih 16 i nijedan vise");
const loader = readFileSync(LOADER, "utf8");
for (const m of moduli) {
  ok(`loader uvozi ${m.id}`, loader.includes(`content/modules/${m.id}.json`));
}
const uvezeni = [...loader.matchAll(/content\/modules\/(m\d\d)\.json/g)].map((x) => x[1]);
ok("loader uvozi tacno 16 fajlova", new Set(uvezeni).size === 16, uvezeni.length);

console.log(`\n${pass} prosло, ${fail} palo`);
process.exit(fail ? 1 : 0);
