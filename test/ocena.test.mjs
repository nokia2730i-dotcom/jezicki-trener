// Ocena po recima je jedina stvar u lekciji koju korisnik vidi kao "ocenu",
// a radi lokalno. Zato ide pod test, a ne pod "izgleda da radi".

import { reci, uporedi, staFali, blizu, rastojanje, uporediSlova } from "../app/lib/ocena.js";

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}
const g = (s) => console.log("\n" + s);

g("1) Deljenje na reci");
ok("interpunkcija ne ulazi", reci("I'm the waiter, sir!").join("|") === "i|am|the|waiter|sir",
  reci("I'm the waiter, sir!"));
ok("prazan unos daje prazan niz", reci("").length === 0);
ok("null ne obara", reci(null).length === 0);
ok("I'm = I am", reci("I'm ready").join(" ") === reci("I am ready").join(" "));
ok("don't = do not", reci("I don't know").join(" ") === reci("I do not know").join(" "));
ok("he's se NE razvezuje (dvosmisleno)", reci("he's").join(" ") === "he's");
ok("tipografski apostrof isto kao obican", reci("I’m").join(" ") === reci("I'm").join(" "));

g("2) Savrsen odgovor");
{
  const r = uporedi("I am the waiter.", "I am the waiter");
  ok("100%", r.procenat === 100, r);
  ok("prolaz", r.prolaz === true);
  ok("nista ne fali", r.delovi.every((d) => d.status === "tacno"));
  ok("nista nije viska", r.viska.length === 0);
}
{
  const r = uporedi("I'm the waiter.", "I am the waiter.");
  ok("skracenica se priznaje", r.procenat === 100, r);
}

g("3) Jedna rec fali — ostatak se NE boji kao greska");
{
  const r = uporedi("Are you ready to order?", "Are you ready order?");
  ok("4 od 5 tacno", r.tacno === 4 && r.ukupno === 5, r);
  const falila = r.delovi.filter((d) => d.status === "falila").map((d) => d.rec);
  ok("fali tacno 'to'", falila.join(",") === "to", falila);
  ok("'order' je i dalje tacno (poravnanje radi)",
    r.delovi[4].status === "tacno", r.delovi[4]);
  ok("80% je prolaz", r.prolaz === true, r.procenat);
}

g("4) Rec umetnuta na pocetku ne pomera ostatak");
{
  const r = uporedi("The table is free.", "Well the table is free.");
  ok("sve ocekivane reci su tacne", r.delovi.every((d) => d.status === "tacno"), r.delovi);
  ok("'well' je prijavljen kao viska", r.viska.join(",") === "well", r.viska);
}

g("5) Pogresna rec se vidi, ne samo broj");
{
  const r = uporedi("I'm gonna check with the kitchen.", "I'm gonna ckeck with the kitchen.");
  ok("strogo: 'ckeck' je promasaj", r.delovi.some((d) => d.rec === "check" && d.status === "falila"), r.delovi);
  const b = uporedi("I'm gonna check with the kitchen.", "I'm gonna ckeck with the kitchen.", { blago: true });
  ok("blago: 'ckeck' je 'blizu'",
    b.delovi.some((d) => d.rec === "check" && d.status === "blizu" && d.dato === "ckeck"), b.delovi);
  ok("blago daje 100%", b.procenat === 100, b.procenat);
}

g("6) Blago ne prasta kratke reci");
ok("he / we nisu blizu", blizu("he", "we") === false);
ok("in / on nisu blizu", blizu("in", "on") === false);
ok("waiter / waitor su blizu", blizu("waiter", "waitor") === true);
// check -> ckeck je jedna zamena slova (h na k), ne dve.
ok("rastojanje: jedna zamena", rastojanje("check", "ckeck") === 1, rastojanje("check", "ckeck"));
ok("rastojanje: jedno dodato slovo", rastojanje("waiter", "waiters") === 1);
ok("rastojanje: dve razlike", rastojanje("kitchen", "kichen") + rastojanje("the", "a") === 4,
  [rastojanje("kitchen", "kichen"), rastojanje("the", "a")]);

g("7) Prazan i besmislen odgovor ne prolaze");
{
  const r = uporedi("I am the waiter.", "");
  ok("prazno = 0%", r.procenat === 0 && r.prolaz === false, r);
  ok("sve reci su prijavljene kao falile", r.delovi.every((d) => d.status === "falila"));
}
{
  const r = uporedi("I am the waiter.", "banana banana banana");
  ok("besmislica ne prolazi", r.prolaz === false, r);
}

g("8) Nabacivanje reci ne sme da prodje");
{
  // Sve tacne reci su tu, ali utopljene u gomilu — ne sme da prodje.
  const r = uporedi("Are you ready?", "are you ready and also maybe something else entirely here");
  ok("tacne reci jesu nadjene", r.procenat === 100, r.procenat);
  ok("ali ne prolazi zbog viska", r.prolaz === false, r.viska);
}

g("9) staFali ispisuje konkretno");
{
  const r = uporedi("Are you ready to order?", "Are you ready order now?");
  const t = staFali(r);
  ok("pominje rec koja fali", t.includes("to"), t);
  ok("pominje rec viska", t.includes("now"), t);
}
{
  const r = uporedi("I am the waiter.", "I am the waiter.");
  ok("kad je sve tacno, nema sta da se kaze", staFali(r) === "", staFali(r));
}

g("10) Prag prolaza");
{
  // 4 od 5 = 80% prolazi, 3 od 5 = 60% ne prolazi.
  ok("80% prolazi", uporedi("one two three four five", "one two three four").prolaz === true);
  ok("60% ne prolazi", uporedi("one two three four five", "one two three").prolaz === false);
}

g("11) Pisanje — poredjenje po slovima");
{
  const r = uporediSlova("receipt", "receipt");
  ok("tacno napisano prolazi", r.prolaz === true && r.procenat === 100, r);
}
{
  // Klasicna zamka: "p" u receipt se ne cuje, pa se i ne napise.
  const r = uporediSlova("receipt", "reciept");
  ok("zamenjena slova ne prolaze", r.prolaz === false, r);
  ok("sva slova su tu, samo u drugom redu", r.tacno < r.ukupno, { tacno: r.tacno, ukupno: r.ukupno });
}
{
  const r = uporediSlova("receipt", "receit");
  const falila = r.delovi.filter((d) => d.status === "falilo").map((d) => d.slovo);
  ok("vidi se koje slovo fali", falila.join("") === "p", falila);
  ok("ne prolazi", r.prolaz === false);
}
{
  const r = uporediSlova("Wednesday", "Wendsday");
  ok("Wednesday pogresno ne prolazi", r.prolaz === false, r.procenat);
}
{
  const r = uporediSlova("vegetables", "vegetabless");
  ok("visak slova ne prolazi", r.prolaz === false, r.viska);
  ok("visak je prijavljen", r.viska.join("") === "s", r.viska);
}
{
  const r = uporediSlova("Receipt", "receipt");
  ok("velika i mala slova su isto", r.prolaz === true);
}
{
  const r = uporediSlova("I'm", "im");
  ok("apostrof se racuna", r.prolaz === false, r);
}
{
  const r = uporediSlova("receipt", "");
  ok("prazan odgovor ne prolazi", r.prolaz === false && r.procenat === 0);
}
ok("prazno ocekivano ne puca", uporediSlova("", "").prolaz === false);
ok("null ne puca", uporediSlova(null, null).ukupno === 0);
{
  // Tacka i zarez se ne racunaju, ne vezbamo interpunkciju nego slovo.
  const r = uporediSlova("thank you", "thank you!");
  ok("interpunkcija ne obara", r.prolaz === true, r);
}

console.log(`\n${pass} prosло, ${fail} palo`);
process.exit(fail ? 1 : 0);
