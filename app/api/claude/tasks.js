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
    description: "JEDNA rec ili kratka fraza na engleskom (najvise 5 reci) koja se pamti",
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

  drill: {
    model: SMART,
    maxTokens: 4000,
    effort: "high",
    fields: { level: 4 },
    required: [],
    maxWords: 12,
    system: (f) => `Pravis dnevni trening engleskog za konobara iz Srbije sa 20+ godina iskustva u ugostiteljstvu.

${levelRules(f.level)}

Teme drzi oko onoga o cemu gosti u restoranu i hotelu pricaju: putovanja i rute, grad i preporuke, hrana i porudzbine, posao i zivot, sport i vreme.

Napravi tacno 6 zadataka ovim redom: listen, gist, situation, listen, gist, choice.

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

export { FAST, SMART };
