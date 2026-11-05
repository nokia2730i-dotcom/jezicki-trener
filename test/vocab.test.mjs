import { migrateVocab, reviewReason } from "../app/lib/vocab.js";

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  OK   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  -> " + JSON.stringify(extra) : "")); }
}

// Realni stari recnik: zdrave kartice iz lookupa/prevoda + smece iz buga 1.
const old = [
  // zdrava, iz "Sta znaci"
  { id: 1, lang: "en", src: "popust", dst: "discount", seen: 4, known: 3, added: "2025-09-01" },
  // zdrava, iz prevoda
  { id: 2, lang: "en", src: "nazdravlje", dst: "cheers", seen: 0, known: 0, added: "2025-09-02" },
  // BUG 1, listen zadatak: cela recenica kao "rec"
  { id: 3, lang: "en", src: "Mislim da cemo ostati tri noci.", dst: "I think we're gonna stay for three nights.", seen: 1, known: 0, added: "2025-09-03" },
  // BUG 1, gist zadatak: OKRENUTO — dst je srpski odgovor
  { id: 4, lang: "en", src: "They drove through Hungary and stopped in Budapest for two days before coming here.", dst: "Prošli su kroz Mađarsku i stali u Budimpešti.", seen: 2, known: 1, added: "2025-09-03" },
  // nemacki — ne brisati
  { id: 5, lang: "de", src: "racun", dst: "die Rechnung", seen: 1, known: 1, added: "2025-09-04" },
  // prazna
  { id: 6, lang: "en", src: "", dst: "", seen: 0, known: 0, added: "2025-09-04" },
  // smece u nizu
  null,
  "ne-objekat",
];

const out = migrateVocab(old);

console.log("\n1) Nista se ne gubi");
ok("6 kartica ulazi (bez null/stringa i prazne), 5 izlazi", out.length === 5, out.length);
ok("prazna kartica je ispala (nema ni rec ni znacenje)", !out.some((v) => v.id === 6));
ok("null i string su preskoceni", out.every((v) => v && typeof v === "object"));

console.log("\n2) Zdrave kartice prolaze netaknute");
const disc = out.find((v) => v.id === 1);
ok("term = engleski", disc.term === "discount", disc);
ok("meaning = srpski", disc.meaning === "popust", disc);
ok("statistika sacuvana", disc.seen === 4 && disc.known === 3, disc);
ok("datum sacuvan", disc.added === "2025-09-01", disc);
ok("nije obelezena za pregled", !disc.needsReview, disc);
ok("druga zdrava takodje cista", !out.find((v) => v.id === 2).needsReview);

console.log("\n3) Pokvarene kartice su obelezene, ne obrisane");
const sentence = out.find((v) => v.id === 3);
ok("cela recenica obelezena", sentence.needsReview === "cela rečenica", sentence.needsReview);
ok("sadrzaj recenice je i dalje tu", sentence.term.includes("three nights"), sentence.term);

const flipped = out.find((v) => v.id === 4);
ok("okrenuta kartica obelezena", flipped.needsReview === "obrnute strane", flipped.needsReview);
ok("sadrzaj okrenute je i dalje tu", flipped.meaning.includes("Hungary"), flipped.meaning);

const de = out.find((v) => v.id === 5);
ok("nemacka kartica obelezena, ne obrisana", de.needsReview === "drugi jezik", de.needsReview);
ok("nemacki sadrzaj sacuvan", de.term === "die Rechnung", de.term);

console.log("\n4) Zamena strana cisti oznaku");
const afterSwap = reviewReason(flipped.meaning, flipped.term, null);
ok("posle zamene je i dalje predugacko (bila je cela recenica)", afterSwap === "cela rečenica", afterSwap);
const smallFlip = reviewReason("Prošli", "passed", null);
ok("kratka okrenuta kartica se prepoznaje", smallFlip === "obrnute strane", smallFlip);
ok("ispravna kratka kartica je cista", reviewReason("passed", "prošli", null) === null);

console.log("\n4b) Pitanje nije kartica");
// Ovo je stvarno uslo u recnik iz lekcije M1 L1: model je kao "rec" vratio
// pitanje od 4 reci, bez tacke, pa je proslo kroz staro pravilo.
ok("pitanje od 4 reci je odbijeno",
  reviewReason("Are you Mr. Novak?", "Vi ste gospodin Novak?", null) === "cela rečenica",
  reviewReason("Are you Mr. Novak?", "Vi ste gospodin Novak?", null));
ok("drugo pitanje je odbijeno",
  reviewReason("Is the fish fresh?", "Da li je riba sveža?", null) === "cela rečenica");
ok("uzvik je odbijen", reviewReason("Welcome!", "Dobro došli!", null) === "cela rečenica");
ok("fraza bez interpunkcije prolazi", reviewReason("by the window", "kod prozora", null) === null);
ok("phrasal verb prolazi", reviewReason("run out of", "ostati bez", null) === null);
ok("jedna rec prolazi", reviewReason("receipt", "račun", null) === null);
ok("znacenje sme da ima znak pitanja", reviewReason("waiter", "konobar?", null) === null);

console.log("\n5) Drugo pokretanje nista ne menja (idempotentno)");
const twice = migrateVocab(out);
ok("drugi prolaz daje isti rezultat", JSON.stringify(twice) === JSON.stringify(out));

console.log("\n6) Ruzni ulazi ne obaraju migraciju");
ok("null", migrateVocab(null).length === 0);
ok("objekat umesto niza", migrateVocab({ a: 1 }).length === 0);
ok("prazan niz", migrateVocab([]).length === 0);
ok("kartica bez polja", migrateVocab([{ id: 9 }]).length === 0);
ok("seen kao tekst -> 0", migrateVocab([{ id: 9, src: "a", dst: "b", seen: "pet" }])[0].seen === 0);

console.log(`\n${pass} prosло, ${fail} palo`);
process.exit(fail ? 1 : 0);
