// Provera sadrzaja lekcija. Lekcije se pisu rucno, pa ovaj test cuva ono sto
// se rucnim pisanjem najlakse pokvari.
//
// Najvaznije pravilo: u "situation" zadatku srpski opis NE SME da oda odgovor.
// Opis kaze KO je gost, GDE je i STA korisnik hoce da postigne — nikad sta
// tacno da kaze. Cim u opisu stoji "kazi mu da...", vezba vise nije gradnja
// recenice nego prevod, a cela teza je da se prevodjenje iz glave razbije.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { reviewReason } from "../app/lib/vocab.js";

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, "..", "content", "lekcije");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}
const g = (s) => console.log("\n" + s);

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const lekcije = files.map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")));

const tekst = (v) => typeof v === "string" && v.trim().length > 0;

// ——— Imperativi koji odaju odgovor ————————————————————————————
// Granice su \p{L} a ne \b: "odgovoriš" ne sme da se poklopi sa "odgovori",
// a \b bi se poklopilo jer "š" za JS nije slovo bez /u zastavice.
const NALOZI = [
  "kaži", "kazi", "reci", "poželi", "pozeli", "odgovori", "pitaj", "upitaj",
  "ponudi", "zamoli", "objasni", "potvrdi", "predloži", "predlozi",
  "zahvali", "izvini", "saopšti", "saopsti", "napiši", "napisi", "obavesti",
];
const NALOG = new RegExp(`(?<!\\p{L})(${NALOZI.join("|")})(?!\\p{L})`, "iu");

function recenice(s) {
  return String(s).toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

g("0) Obavezni deo svake lekcije");
// Lekcija NE mora da ima sve korake. M0 je zvuk i pisanje, nema sklapanje
// recenice; M1 je gramatika, nema parove reci. Motor sam izostavi korake
// kojih nema, pa test proverava samo ono sto postoji — ali obavezni deo
// mora svuda.
ok("ima bar jedna lekcija", lekcije.length >= 1, files);
for (const l of lekcije) {
  ok(`${l.id} ima id, modulId, naslov, cilj, fokus`,
    tekst(l.id) && tekst(l.modulId) && tekst(l.naslov) && tekst(l.cilj) && tekst(l.fokus));
  ok(`${l.id} id odgovara imenu fajla i modulu`,
    l.id.startsWith(l.modulId) && files.includes(`${l.id}.json`), l.id);
  ok(`${l.id} ima karticu kraja`,
    l.kraj && Array.isArray(l.kraj.mozes) && l.kraj.mozes.length === 3 && Array.isArray(l.kraj.reci));
  ok(`${l.id} ima zvuk dana`,
    l.zvukDana && tekst(l.zvukDana.naslov) && tekst(l.zvukDana.tekst) &&
      Array.isArray(l.zvukDana.primeri) && l.zvukDana.primeri.length >= 2,
    l.zvukDana ? "primeri" : "fali ceo zvukDana");

  // Lekcija mora da ima bar cetiri koraka sa sadrzajem, inace nije lekcija.
  const koraci = [
    l.zvukDana, l.scena, l.pravilo, l.parovi, l.blokovi, l.pisanje,
    l.situacije, l.diktat, l.razumevanje, l.izgovor, l.miniBoss,
  ].filter(Boolean).length;
  ok(`${l.id} ima bar 4 koraka sa sadrzajem`, koraci >= 4, koraci);
}

g("0b) Koraci koji postoje moraju biti celi");
for (const l of lekcije) {
  if (l.scena) {
    ok(`${l.id} scena ima uvod i bar 2 replike`,
      tekst(l.scena.uvod) && Array.isArray(l.scena.replike) && l.scena.replike.length >= 2);
  }
  if (l.pravilo) {
    ok(`${l.id} pravilo ima tekst i 3 primera`,
      tekst(l.pravilo.tekst) && Array.isArray(l.pravilo.primeri) && l.pravilo.primeri.length === 3);
  }
  if (l.blokovi) ok(`${l.id} ima 3 bloka`, l.blokovi.length === 3, l.blokovi.length);
  if (l.situacije) ok(`${l.id} ima 3 situacije`, l.situacije.length === 3, l.situacije.length);
  if (l.diktat) ok(`${l.id} diktat ima en i sr`, tekst(l.diktat.en) && tekst(l.diktat.sr));
  if (l.razumevanje) {
    ok(`${l.id} razumevanje je celo`,
      tekst(l.razumevanje.pasus) && tekst(l.razumevanje.pitanje) && tekst(l.razumevanje.odgovor));
  }
  if (l.izgovor) ok(`${l.id} ima 2 recenice za izgovor`, l.izgovor.length === 2, l.izgovor.length);
  if (l.miniBoss) {
    ok(`${l.id} mini-boss ima situaciju i prvu repliku`,
      tekst(l.miniBoss.situacija) && tekst(l.miniBoss.pocetna));
  }
}

g("0c) Parovi reci — dve reci, jedna razlika");
for (const l of lekcije) {
  if (!l.parovi) continue;
  ok(`${l.id} parovi imaju uputstvo i bar 3 stavke`,
    tekst(l.parovi.uputstvo) && Array.isArray(l.parovi.stavke) && l.parovi.stavke.length >= 3,
    l.parovi.stavke?.length);
  l.parovi.stavke.forEach((p, i) => {
    const gde = `${l.id} par ${i + 1}`;
    ok(`${gde}: ima obe reci, oba prevoda i objasnjenje razlike`,
      tekst(p.a) && tekst(p.b) && tekst(p.srA) && tekst(p.srB) && tekst(p.razlika));
    ok(`${gde}: reci nisu iste`, p.a.toLowerCase() !== p.b.toLowerCase(), [p.a, p.b]);
    ok(`${gde}: obe su jedna rec`, !/\s/.test(p.a.trim()) && !/\s/.test(p.b.trim()), [p.a, p.b]);
    ok(`${gde}: prevodi se razlikuju`, p.srA.toLowerCase() !== p.srB.toLowerCase(), [p.srA, p.srB]);
  });
}

g("0d) Pisanje — rec, znacenje i u cemu je zamka");
for (const l of lekcije) {
  if (!l.pisanje) continue;
  ok(`${l.id} pisanje ima uputstvo i bar 3 reci`,
    tekst(l.pisanje.uputstvo) && Array.isArray(l.pisanje.reci) && l.pisanje.reci.length >= 3,
    l.pisanje.reci?.length);
  l.pisanje.reci.forEach((r, i) => {
    const gde = `${l.id} pisanje ${i + 1}`;
    ok(`${gde}: ima en, sr i zamku`, tekst(r.en) && tekst(r.sr) && tekst(r.zamka));
    // Vezba je kucanje jedne reci, ne recenice.
    ok(`${gde}: "${r.en}" je jedna rec`, r.en.trim().split(/\s+/).length === 1, r.en);
    // Zamka mora da objasni gresku, ne samo da ponovi rec.
    ok(`${gde}: zamka nesto objasnjava`, r.zamka.trim().length >= 20, r.zamka);
  });
}

g("1) Situacija ne sme da oda odgovor");
for (const l of lekcije) {
  if (!l.situacije) continue;
  l.situacije.forEach((s, i) => {
    const gde = `${l.id} situacija ${i + 1}`;

    ok(`${gde}: ima opis i model odgovor`, tekst(s.opis) && tekst(s.model));

    // a) nema naloga sta tacno da kaze
    const nalog = s.opis.match(NALOG);
    ok(`${gde}: bez naloga "kaži / poželi / odgovori"`, nalog === null, nalog && nalog[0]);

    // b) model odgovor se ne pojavljuje doslovno u opisu
    ok(`${gde}: model odgovor nije prepisan u opis`,
      !s.opis.toLowerCase().includes(s.model.toLowerCase().replace(/[.?!]+$/, "")),
      s.model);

    // c) nema tri uzastopne reci iz model odgovora u opisu — ovo hvata
    //    engleske fraze podmetnute u srpski opis. Replika gosta sme da bude
    //    na engleskom, ali se ne sme poklapati sa onim sto korisnik treba da
    //    kaze.
    const m = recenice(s.model);
    const o = recenice(s.opis).join(" ");
    let preklop = null;
    for (let k = 0; k + 3 <= m.length; k++) {
      const trojka = m.slice(k, k + 3).join(" ");
      if (o.includes(trojka)) { preklop = trojka; break; }
    }
    ok(`${gde}: nema tri uzastopne reci iz odgovora`, preklop === null, preklop);

    // d) opis mora da bude scena, ne jedna naredba
    ok(`${gde}: opis je dovoljno opisan (40+ znakova)`, s.opis.trim().length >= 40, s.opis.length);
  });
}

g("2) Kontrola samog testa — namerno los opis mora da padne");
{
  const los = "Gosti su dobili piće. Ti im poželi prijatno i kaži da uživaju u piću.";
  ok("hvata 'poželi'", NALOG.test(los), los);
  const dobar = "Gosti su dobili piće. Hoćeš da budeš ljubazan pre nego što odeš od stola.";
  ok("propusta ispravan opis", !NALOG.test(dobar), dobar);
  ok("ne hvata 'odgovoriš' (nije imperativ)", !NALOG.test("Šta mu odgovoriš?"));
  ok("ne hvata 'kažeš' (nije imperativ)", !NALOG.test("Šta kažeš gostu?"));
  ok("hvata 'kaži' i na latinici bez kvacica", NALOG.test("Kazi mu da je sto slobodan."));
}

g("3) Reci sa kartice kraja prolaze isto pravilo kao rucno dodate");
for (const l of lekcije) {
  for (const r of l.kraj.reci) {
    const razlog = reviewReason(r.term, r.meaning, null);
    ok(`${l.id}: "${r.term}" je kartica, ne rečenica`, razlog === null, razlog);
  }
}

g("4) Blokovi: resenje se stvarno moze sklopiti od ponudjenih reci");
for (const l of lekcije) {
  if (!l.blokovi) continue;
  l.blokovi.forEach((b, i) => {
    ok(`${l.id} blok ${i + 1}: ima trazi, resenje i mamce`,
      tekst(b.trazi) && tekst(b.resenje) && Array.isArray(b.mamci) && b.mamci.length >= 2);
    ok(`${l.id} blok ${i + 1}: mamci nisu u resenju`,
      !b.mamci.some((m) => b.resenje.replace(/[.,!?]/g, "").split(/\s+/).includes(m)),
      b.mamci);
  });
}

console.log(`\n${pass} prosло, ${fail} palo`);
process.exit(fail ? 1 : 0);
