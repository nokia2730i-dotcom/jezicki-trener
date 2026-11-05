// Registar zadataka. Sve sto model vidi definisano je OVDE, na serveru.
// Klijent salje samo ime zadatka i svoja polja — nikad system prompt,
// nikad naziv modela, nikad max_tokens.

const FAST = process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-5-5";
const SMART = process.env.ANTHROPIC_MODEL_SMART || "claude-sonnet-5-5";

// Nivo odreduje ULAZNI TEST. Dok test ne postoji, podrazumevano je A1.
// Nijedan prompt vise ne tvrdi da je korisnik napredan.
export const LEVELS = ["A1", "A2", "B1"];

const LEVEL_RULES = {
  A1: `Nivo korisnika: A1 (pocetni).
Koristi SAMO: to be, present simple, present continuous, osnovne predloge, a/an/the, brojive i nebrojive imenice, can.
Recenice do 10 reci. Bez present perfecta, bez uslovnih recenica, bez reported speecha, bez phrasal verbova.
Korisnik poznaje osnovni restoranski vokabular iz 20 godina posla, ali mu gramatika i gradnja recenice NISU utvrdjene. Ne pretpostavljaj da zna vremena.`,

  A2: `Nivo korisnika: A2 (srednji).
Mozes koristiti: sve iz A1 plus past simple, was/were, did pitanja, going to, will, could/would/may za ljubaznost, poredjenje prideva.
Recenice do 14 reci. Bez present perfecta, bez uslovnih recenica tipa 2, bez reported speecha.`,

  B1: `Nivo korisnika: B1.
Mozes koristiti: sve iz A2 plus present perfect, past continuous, uslovne recenice 1 i 2, relativne recenice, reported speech, uobicajene phrasal verbove, skracenice i prirodan tempo.`,
};

function levelRules(level) {
  return LEVEL_RULES[level] || LEVEL_RULES.A1;
}

export const SCENARIOS = {
  trip: {
    label: "Odakle su i kuda idu",
    desc: "Gost prica o putu, ruti, mestima kroz koja je prosao i koliko ostaje",
  },
  city: {
    label: "Grad i preporuke",
    desc: "Gost pita sta da vidi, gde da izadje, kako da stigne; prica o utiscima",
  },
  life: {
    label: "Zivot i posao",
    desc: "Gost prica cime se bavi, o deci, cenama, poredjenju sa svojom zemljom",
  },
  smalltalk: {
    label: "Sport, vreme, opusteno",
    desc: "Utakmica, vremenska prognoza, sale, sve sto se isprica izmedju dva stola",
  },
  interview: {
    label: "Razgovor za posao",
    desc: "Customer support / success pozicija u tech kompaniji",
  },
};

// Jedna recnicka kartica = JEDNA rec ili fraza. Nikad cela recenica.
// Model sam imenuje rec koja se pamti, da je UI ne izvlaci iz recenice.
const VOCAB_FIELDS = {
  key_word: {
    type: "string",
    description:
      "JEDNA rec ili ustaljena fraza na engleskom (najvise 5 reci) koja se pamti. NIJE recenica i NIJE pitanje — bez tacke, znaka pitanja i uzvicnika. Dobro: 'receipt', 'by the window', 'run out of'. Lose: 'Are you Mr. Novak?', 'I'm sorry'.",
  },
  key_word_sr: { type: "string", description: "znacenje te reci ili fraze na srpskom" },
};

function obj(properties) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export const TASKS = {
  lookup: {
    model: FAST,
    maxTokens: 600,
    effort: "low",
    fields: { word: 80, context: 300 },
    required: ["word"],
    system: () => `Korisnik je konobar u Srbiji sa 20+ godina iskustva. Radi sa stranim gostima i tokom razgovora nije razumeo rec ili izraz na engleskom.

On poznaje osnovni restoranski vokabular iz prakse, ali mu gramatika, vremena i gradnja recenice nisu utvrdjene, i ne poznaje idiome i sleng. Objasni jasno i konkretno, bez skolskog tona i bez snishodljivosti.

Rec ili izraz moze biti pogresno zapisan jer ga je cuo, ne procitao. Ako lici na nesto drugo, pretpostavi najverovatniju stvarnu rec i to napisi u "actual".`,
    messages: (f) => [
      {
        role: "user",
        content: f.context
          ? `Rec: ${f.word}\nKontekst razgovora: ${f.context}`
          : `Rec: ${f.word}`,
      },
    ],
    schema: obj({
      actual: { type: "string", description: "rec kako se stvarno pise" },
      meaning: { type: "string", description: "znacenje NA SRPSKOM, konkretno" },
      type: {
        type: "string",
        enum: ["rec", "idiom", "sleng", "naziv mesta", "skracenica"],
      },
      example: { type: "string", description: "kratka recenica na engleskom u kojoj se koristi" },
      reply: { type: "string", description: "sta korisnik moze da odgovori gostu, na engleskom" },
      reply_sr: { type: "string", description: "prevod tog odgovora na srpski" },
    }),
  },

  translate: {
    model: FAST,
    maxTokens: 700,
    effort: "low",
    fields: { text: 500 },
    required: ["text"],
    system: () => `Prevodis sa srpskog na engleski. Korisnik je ugostitelj iz Srbije koji uci engleski za rad sa gostima i za svakodnevni zivot.

Daj prevod koji bi izvorni govornik stvarno upotrebio, ne bukvalan prevod. U "note" objasni jednom recenicom zasto se tako kaze ili sta se tu najcesce gresi.`,
    messages: (f) => [{ role: "user", content: f.text }],
    schema: obj({
      main: { type: "string", description: "najprirodniji prevod" },
      formal: { type: "string", description: "formalna varijanta" },
      casual: { type: "string", description: "opustena varijanta" },
      note: { type: "string", description: "jedna recenica NA SRPSKOM" },
      ...VOCAB_FIELDS,
    }),
  },

  free_chat: {
    model: SMART,
    maxTokens: 800,
    effort: "medium",
    fields: { scenario: 40, level: 4 },
    required: ["scenario"],
    // Istorija razgovora se proverava posebno (maxTurns / maxCharsPerTurn).
    maxTurns: 40,
    maxCharsPerTurn: 600,
    system: (f) => {
      const sc = SCENARIOS[f.scenario] || SCENARIOS.trip;
      return `Ti si partner za vezbanje engleskog. Maternji jezik korisnika je srpski.

${levelRules(f.level)}

Situacija: ${sc.label} — ${sc.desc}. Ti igras drugu stranu u toj situaciji (gosta, prodavca, kolegu, poslodavca). Ostani u ulozi, odgovaraj kratko i prirodno, 1-3 recenice, i uvek postavi pitanje ili daj repliku koja tera razgovor dalje. Drzi se gramatike dozvoljene za nivo gore.

Posle svake poruke korisnika proveri njegovu recenicu. Ako ima gresku ili postoji prirodniji nacin da se to kaze, popuni "correction". Ako je recenica dobra, stavi null.

U "correction.key_word" upisi JEDNU rec ili kratku frazu koju vredi zapamtiti iz te ispravke — nikad celu recenicu.`;
    },
    messages: (f) => f.messages,
    schema: obj({
      reply: { type: "string", description: "replika na engleskom" },
      reply_sr: { type: "string", description: "prevod replike na srpski" },
      correction: {
        anyOf: [
          { type: "null" },
          obj({
            issue: { type: "string", description: "kratko objasnjenje greske NA SRPSKOM" },
            better: { type: "string", description: "ispravljena recenica na engleskom" },
            ...VOCAB_FIELDS,
          }),
        ],
      },
    }),
  },

  // Korak 4 i korak 5 lekcije: ocena jednog kratkog odgovora.
  // Diktat i izgovor se ocenjuju LOKALNO (app/lib/ocena.js) i ne dolaze ovde.
  oceni: {
    model: FAST,
    maxTokens: 500,
    effort: "low",
    fields: { lekcijaId: 24, vrsta: 16, odgovor: 300, level: 4 },
    required: ["lekcijaId", "vrsta", "odgovor"],
    // Tekst zadatka i model odgovor NE dolaze od klijenta — ruta ih izvlaci
    // iz content/lekcije i daje ovde kao `k`.
    trebaLekciju: true,
    system: (f, k) => {
      const jeGist = f.vrsta === "razumevanje";
      return `Ocenjujes jedan odgovor coveka koji uci engleski. Maternji jezik mu je srpski, konobar je sa 20+ godina iskustva u ugostiteljstvu.

${levelRules(f.level)}

${
  jeGist
    ? `Dobijas pitanje o sadrzaju pasusa koji je korisnik SLUSAO, tacan odgovor i njegov odgovor. Odgovor je na srpskom jer se proverava razumevanje, ne produkcija. Tacan je ako je uhvatio sustinu — ne trazi iste reci.`
    : `Dobijas opis situacije na srpskom, model odgovor na engleskom i ono sto je korisnik napisao na engleskom. Korisnik je recenicu sklapao sam, nije prevodio. Tacan je svaki odgovor koji bi u toj situaciji prosao kao prirodan — ne mora da se poklapa sa modelom.`
}

Budi posten ali ne cepidlaka. Sitna greska u clanu ili interpunkciji nije "netacno", to je "blizu".

U "sta_nije" napisi NA SRPSKOM, u jednoj recenici, sta konkretno nije u redu. Ako je sve u redu, stavi prazan string.
U "prirodnije" napisi na engleskom kako bi to rekao izvorni govornik${jeGist ? ", ili prazan string ako je pitanje bilo o razumevanju i odgovor je na srpskom" : ""}.
U "key_word" i "key_word_sr" upisi JEDNU rec ili kratku frazu iz ovog zadatka koju vredi zapamtiti — nikad celu recenicu.`;
    },
    messages: (f, k) => [
      {
        role: "user",
        content: [
          f.vrsta === "razumevanje" ? `Pitanje: ${k.zadatak}` : `Situacija: ${k.zadatak}`,
          k.ocekivano ? `Tacan/model odgovor: ${k.ocekivano}` : null,
          `Odgovor korisnika: ${f.odgovor}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    schema: obj({
      ocena: { type: "string", enum: ["tacno", "blizu", "netacno"] },
      sta_nije: { type: "string", description: "jedna recenica NA SRPSKOM, ili prazan string" },
      prirodnije: { type: "string", description: "prirodnija verzija na engleskom, ili prazan string" },
      ...VOCAB_FIELDS,
    }),
  },

  // Korak 7: mini-boss. Gost reaguje na mene i istovremeno ocenjuje sta sam rekao.
  mini_boss: {
    model: SMART,
    maxTokens: 800,
    effort: "medium",
    fields: { lekcijaId: 24, level: 4 },
    required: ["lekcijaId"],
    maxTurns: 12,
    maxCharsPerTurn: 500,
    // Situacija i gramaticki fokus dolaze iz content/lekcije, ne od klijenta.
    trebaLekciju: true,
    system: (f, k) => `Ti si gost u restoranu ili hotelu u Nisu. Korisnik je konobar koji uci engleski; maternji jezik mu je srpski.

${levelRules(f.level)}

Situacija: ${k.situacija}
${k.fokus ? `Gramatika koju ova lekcija vezba: ${k.fokus}. Postavljaj replike tako da mora da je upotrebi.` : ""}

Ostani u ulozi gosta. Odgovaraj kratko i prirodno, 1-2 recenice, i svaki put daj repliku na koju konobar MORA nesto da odgovori. Ne izlazi iz uloge, ne objasnjavaj gramatiku u "reply".

Posle svake poruke korisnika oceni njegovu recenicu:
- "tacno" ako bi u ovoj situaciji prosla kao prirodna,
- "blizu" ako se razume ali ima gresku ili zvuci kao prevod,
- "netacno" ako se ne razume ili je promasio situaciju.

"sta_nije" je jedna recenica NA SRPSKOM, prazan string kad je sve u redu. "prirodnije" je ista stvar kako bi rekao izvorni govornik, prazan string kad nema sta da se popravi.

U "key_word" upisi JEDNU rec ili kratku frazu iz ove razmene koju vredi zapamtiti — nikad celu recenicu.`,
    messages: (f) => f.messages,
    schema: obj({
      reply: { type: "string", description: "replika gosta na engleskom" },
      reply_sr: { type: "string", description: "prevod te replike na srpski" },
      ocena: { type: "string", enum: ["tacno", "blizu", "netacno"] },
      sta_nije: { type: "string", description: "jedna recenica NA SRPSKOM, ili prazan string" },
      prirodnije: { type: "string", description: "prirodnija verzija na engleskom, ili prazan string" },
      ...VOCAB_FIELDS,
    }),
  },

  drill: {
    model: SMART,
    // Bio je effort "high" i 6 zadataka: 2566 izlaznih tokena, $0.029 po
    // pokretanju — skuplje od cele lekcije. Sada 4 zadatka na "medium".
    // max_tokens je i dalje sa zalihom: ako odgovor bude presecen, ruta
    // pokusava ponovo i to kosta dvostruko, pa stednja nema smisla do daske.
    maxTokens: 2400,
    effort: "medium",
    fields: { level: 4 },
    required: [],
    maxWords: 12,
    system: (f) => `Pravis dnevni trening engleskog za konobara iz Srbije sa 20+ godina iskustva u ugostiteljstvu.

${levelRules(f.level)}

Teme drzi oko onoga o cemu gosti u restoranu i hotelu pricaju: putovanja i rute, grad i preporuke, hrana i porudzbine, posao i zivot, sport i vreme.

Napravi tacno 4 zadatka ovim redom: listen, gist, situation, choice.

- "listen": recenica koju ce mu aplikacija procitati naglas, a on kuca sta je cuo. Prirodna govorna recenica, duzina prema nivou.
- "gist": pasus od 3 do 4 recenice koji mu se cita naglas dok NE vidi tekst — kao da gost prica za stolom. Uz njega jedno pitanje NA SRPSKOM o sadrzaju, na koje se ne moze odgovoriti pogadjanjem. Pitaj konkretan detalj, ne opstu temu.
- "situation": opis situacije NA SRPSKOM u kojoj gost nesto kaze ili uradi, a korisnik treba da odgovori na engleskom. NE daj mu srpsku recenicu za prevod — daj mu situaciju, da recenicu sklopi sam. Polje "sr" je opis situacije, "text" je model odgovor.
- "choice": pitanje sa 3 ponudjena odgovora gde su bar dva gramaticki tacna, ali samo jedan zvuci kao izvorni govornik. Polje "sr" je pitanje ili situacija NA SRPSKOM, "options" su tri opcije, "correct" je indeks tacne, "why" objasnjenje. Polje "text" stavi na tacnu opciju.

U svakom zadatku popuni key_word i key_word_sr: JEDNA rec ili kratka fraza iz tog zadatka koju vredi zapamtiti.`,
    messages: (f) => [
      {
        role: "user",
        content: f.words && f.words.length
          ? `Napravi danasnji trening. Ako prirodno mozes, upotrebi neke od ovih reci koje ucim: ${f.words.join(", ")}.`
          : "Napravi danasnji trening.",
      },
    ],
    schema: obj({
      tasks: {
        type: "array",
        items: obj({
          type: { type: "string", enum: ["listen", "gist", "situation", "choice"] },
          text: { type: "string", description: "recenica/pasus na engleskom, ili model odgovor" },
          sr: { type: "string", description: "prevod, ili opis situacije na srpskom" },
          question: { type: "string", description: "samo za gist: pitanje NA SRPSKOM; inace prazan string" },
          answer: { type: "string", description: "samo za gist: tacan odgovor NA SRPSKOM; inace prazan string" },
          options: {
            type: "array",
            items: { type: "string" },
            description: "samo za choice: 3 opcije; inace prazan niz",
          },
          correct: { type: "integer", description: "samo za choice: indeks tacne opcije; inace 0" },
          why: { type: "string", description: "objasnjenje NA SRPSKOM; za ostale tipove kratka napomena" },
          ...VOCAB_FIELDS,
        }),
      },
    }),
  },
};

// Promptovi su pisani bez dijakritika (da se ne lome kroz alate), pa je model
// i odgovarao bez njih — "neodredjeni clan" umesto "neodređeni član". Korisnik
// to cita na ekranu, pa pravilo ide na svaki system prompt, na jednom mestu.
const SRPSKI =
  "Kad pises srpski, pisi ga pravilno, sa dijakritikama: š, đ, č, ć, ž. Nikad 's' umesto 'š' ni 'dj' umesto 'đ'.";

for (const spec of Object.values(TASKS)) {
  const osnovni = spec.system;
  spec.system = (f, k) => `${osnovni(f, k)}\n\n${SRPSKI}`;
}

export { FAST, SMART, SRPSKI };
