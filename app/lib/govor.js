// Audio sloj. Samo browser API — nista se ne instalira i nista ne kosta.
//
// Dve zamke koje ovde resavamo:
//  1) getVoices() na Chromeu prvi put vrati PRAZAN niz. Glasovi dolaze
//     asinhrono, uz "voiceschanged". Zato se ceka, sa gornjom granicom.
//  2) speak() posle cancel() ume da se izgubi ako se pozove u istom tiku.

export const BRZINE = [
  { oznaka: "0.8×", vrednost: 0.8, opis: "sporo" },
  { oznaka: "1×", vrednost: 1.0, opis: "normalno" },
  { oznaka: "1.15×", vrednost: 1.15, opis: "kao u životu" },
];

let kesGlasova = null;

export function imaGovor() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function glasovi() {
  if (!imaGovor()) return Promise.resolve([]);
  if (kesGlasova && kesGlasova.length) return Promise.resolve(kesGlasova);

  return new Promise((resolve) => {
    const s = window.speechSynthesis;
    const odmah = s.getVoices();
    if (odmah && odmah.length) {
      kesGlasova = odmah;
      return resolve(odmah);
    }

    let zavrseno = false;
    const zavrsi = () => {
      if (zavrseno) return;
      zavrseno = true;
      clearTimeout(tajmer);
      try {
        s.removeEventListener("voiceschanged", zavrsi);
      } catch {
        /* stariji Safari nema removeEventListener na ovome */
      }
      kesGlasova = s.getVoices() || [];
      resolve(kesGlasova);
    };

    const tajmer = setTimeout(zavrsi, 1500);
    try {
      s.addEventListener("voiceschanged", zavrsi);
    } catch {
      s.onvoiceschanged = zavrsi;
    }
  });
}

// Engleski glas, po redu zelje: en-GB, pa en-US, pa bilo koji en.
export async function engleskiGlas() {
  const lista = await glasovi();
  if (!lista.length) return null;
  const en = lista.filter((v) => /^en[-_]/i.test(v.lang || ""));
  if (!en.length) return null;
  return (
    en.find((v) => /^en[-_]GB/i.test(v.lang)) ||
    en.find((v) => /^en[-_]US/i.test(v.lang)) ||
    en[0]
  );
}

// Svez Android ume da nema nijedan engleski glas dok se ne skine u
// podesavanjima. Tada speak() ne pusti nista, a korisnik gleda u dugme i
// misli da je aplikacija pukla. Zato lekcija ovo proverava i kaze mu.
export async function imaEngleskiGlas() {
  return (await engleskiGlas()) !== null;
}

/**
 * Izgovori tekst. Vraca obecanje koje se resava kad govor stane.
 * Nikad ne puca — ako govor ne radi, resava se sa { ok: false }.
 */
export async function izgovori(tekst, { brzina = 1.0 } = {}) {
  if (!imaGovor() || !String(tekst || "").trim()) {
    return { ok: false, greska: "Izgovor ne radi u ovom pregledaču." };
  }
  const glas = await engleskiGlas();

  return new Promise((resolve) => {
    try {
      const s = window.speechSynthesis;
      s.cancel();
      const u = new SpeechSynthesisUtterance(String(tekst));
      if (glas) u.voice = glas;
      u.lang = glas?.lang || "en-US";
      u.rate = brzina;
      u.onend = () => resolve({ ok: true });
      u.onerror = () => resolve({ ok: false, greska: "Izgovor je prekinut." });
      // Mali pomak: posle cancel() u istom tiku Chrome ume da preskoci speak().
      setTimeout(() => s.speak(u), 60);
      // Sigurnosna mreza: ako onend nikad ne dodje, ne visi zauvek.
      setTimeout(() => resolve({ ok: true }), 1500 + String(tekst).length * 90);
    } catch {
      resolve({ ok: false, greska: "Izgovor ne radi u ovom pregledaču." });
    }
  });
}

export function prekini() {
  try {
    if (imaGovor()) window.speechSynthesis.cancel();
  } catch {
    /* nema sta da se prekine */
  }
}

// ——— Prepoznavanje govora ————————————————————————————————————

function Prepoznavac() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function imaSlusanje() {
  return !!Prepoznavac();
}

/**
 * Slusa jednu izgovorenu recenicu.
 * Resava se sa { ok: true, tekst } ili { ok: false, greska, fallback }.
 * `fallback: true` znaci "pregledac ovo ne ume — ponudi kucanje".
 */
export function slusaj({ jezik = "en-US", tajmaut = 12000 } = {}) {
  const P = Prepoznavac();
  if (!P) {
    return Promise.resolve({
      ok: false,
      fallback: true,
      greska: "Ovaj pregledač ne ume da sluša. Ukucaj rečenicu.",
    });
  }

  return new Promise((resolve) => {
    let zavrseno = false;
    const kraj = (r) => {
      if (zavrseno) return;
      zavrseno = true;
      clearTimeout(tajmer);
      if (!r.ok) {
        try {
          prepoznavac.abort();
        } catch {
          /* vec je stao */
        }
      }
      resolve(r);
    };

    let prepoznavac;
    try {
      prepoznavac = new P();
    } catch {
      return resolve({
        ok: false,
        fallback: true,
        greska: "Mikrofon nije dostupan. Ukucaj rečenicu.",
      });
    }

    prepoznavac.lang = jezik;
    prepoznavac.interimResults = false;
    prepoznavac.maxAlternatives = 1;
    prepoznavac.continuous = false;

    const tajmer = setTimeout(
      () => kraj({ ok: false, greska: "Nisam ništa čuo. Pokušaj ponovo ili ukucaj." }),
      tajmaut
    );

    prepoznavac.onresult = (e) => {
      const tekst = e?.results?.[0]?.[0]?.transcript || "";
      kraj(tekst.trim() ? { ok: true, tekst: tekst.trim() } : { ok: false, greska: "Nisam razumeo." });
    };
    prepoznavac.onerror = (e) => {
      const vrsta = e?.error || "";
      if (vrsta === "not-allowed" || vrsta === "service-not-allowed") {
        kraj({
          ok: false,
          fallback: true,
          greska: "Mikrofon nije dozvoljen. Dozvoli ga u pregledaču ili ukucaj rečenicu.",
        });
      } else if (vrsta === "no-speech") {
        kraj({ ok: false, greska: "Nisam ništa čuo. Pokušaj ponovo." });
      } else {
        kraj({ ok: false, greska: "Slušanje nije uspelo. Ukucaj rečenicu." });
      }
    };
    prepoznavac.onend = () => kraj({ ok: false, greska: "Nisam ništa čuo. Pokušaj ponovo." });

    try {
      prepoznavac.start();
    } catch {
      kraj({ ok: false, fallback: true, greska: "Slušanje se nije pokrenulo. Ukucaj rečenicu." });
    }
  });
}
