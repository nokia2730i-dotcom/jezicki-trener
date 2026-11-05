// Ocena po recima, lokalno i bez API-ja. Koristi se za diktat (korak 5) i za
// izgovor (korak 6, nad transkriptom iz SpeechRecognition).
//
// Cilj nije ocena nego da se vidi KOJA rec je promasena. Zato poravnanje ide
// preko najduzeg zajednickog podniza, a ne rec-po-rec sa istog mesta: kad
// jednu rec izostavis, ostatak recenice ne sme da se oboji kao greska.

// Skracenice koje se svode na isti oblik, da "I am" i "I'm" budu isto.
// Namerno samo one koje nisu dvosmislene — "he's" moze biti i "he is" i
// "he has", pa se ne razvezuje.
const SKRACENICE = {
  "i'm": "i am",
  "you're": "you are",
  "we're": "we are",
  "they're": "they are",
  "isn't": "is not",
  "aren't": "are not",
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "can't": "cannot",
  "won't": "will not",
  "i'll": "i will",
  "i've": "i have",
  "let's": "let us",
};

export function reci(tekst) {
  const osnovno = String(tekst || "")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!osnovno) return [];
  return osnovno
    .split(" ")
    .flatMap((w) => (SKRACENICE[w] ? SKRACENICE[w].split(" ") : [w]))
    .filter(Boolean);
}

// Rastojanje izmene, ograniceno — treba nam samo "da li je blizu".
export function rastojanje(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

// Rec se racuna kao "blizu" ako je promaseno jedno slovo, i to samo kod reci
// od 4 slova i vise — kod kratkih reci jedno slovo je druga rec (he/we, in/on).
export function blizu(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  return rastojanje(a, b) <= 1;
}

// Poravnanje preko najduzeg zajednickog podniza.
function zajednicki(a, b, isto) {
  const m = a.length;
  const n = b.length;
  const t = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      t[i][j] = isto(a[i], b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  const parovi = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (isto(a[i], b[j])) {
      parovi.push([i, j]);
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return parovi;
}

/**
 * Uporedi ocekivanu recenicu sa onim sto je korisnik dao.
 *
 * @param {string} ocekivano  recenica koja je procitana
 * @param {string} dato       sta je korisnik ukucao ili izgovorio
 * @param {{blago?: boolean}} opcije  blago: priznaje i rec promasenu za jedno slovo
 * @returns {{
 *   delovi: Array<{rec: string, status: "tacno"|"blizu"|"falila", dato?: string}>,
 *   viska: string[], tacno: number, ukupno: number, procenat: number, prolaz: boolean
 * }}
 */
export function uporedi(ocekivano, dato, opcije = {}) {
  const blago = !!opcije.blago;
  const a = reci(ocekivano);
  const b = reci(dato);
  const isto = blago ? (x, y) => x === y || blizu(x, y) : (x, y) => x === y;

  const parovi = zajednicki(a, b, isto);
  const mapaA = new Map(parovi);
  const spojeniB = new Set(parovi.map(([, j]) => j));

  const delovi = a.map((rec, i) => {
    if (!mapaA.has(i)) return { rec, status: "falila" };
    const datoRec = b[mapaA.get(i)];
    return datoRec === rec
      ? { rec, status: "tacno" }
      : { rec, status: "blizu", dato: datoRec };
  });

  const viska = b.filter((_, j) => !spojeniB.has(j));
  const tacno = delovi.filter((d) => d.status === "tacno" || d.status === "blizu").length;
  const ukupno = a.length;
  const procenat = ukupno ? Math.round((tacno / ukupno) * 100) : 0;

  return {
    delovi,
    viska,
    tacno,
    ukupno,
    procenat,
    // Prolaz trazi i da nema mnogo dodatih reci — inace bi nabacivanje reci
    // proslo samo zato sto su tacne usle medju njih.
    prolaz: procenat >= 80 && viska.length <= Math.max(1, Math.floor(ukupno * 0.2)),
  };
}

// Kratka recenica za korisnika: sta tacno fali.
export function staFali(rezultat) {
  const falile = rezultat.delovi.filter((d) => d.status === "falila").map((d) => d.rec);
  const priblizne = rezultat.delovi.filter((d) => d.status === "blizu");
  const delovi = [];
  if (falile.length) delovi.push(`fali: ${falile.join(", ")}`);
  if (priblizne.length) {
    delovi.push(`skoro: ${priblizne.map((d) => `${d.dato} → ${d.rec}`).join(", ")}`);
  }
  if (rezultat.viska.length) delovi.push(`viška: ${rezultat.viska.join(", ")}`);
  return delovi.join(" · ");
}
