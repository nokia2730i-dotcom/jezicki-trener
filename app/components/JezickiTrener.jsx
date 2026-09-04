"use client";

import { useState, useEffect, useRef } from "react";

const LANGS = [
  { code: "en", name: "Engleski", native: "English" },
  { code: "de", name: "Nemački", native: "Deutsch" },
  { code: "el", name: "Grčki", native: "Ελληνικά" },
];

const SCENARIOS = [
  {
    id: "trip",
    label: "Odakle su i kuda idu",
    desc: "Gost priča o putu, ruti, mestima kroz koja je prošao i koliko ostaje",
  },
  {
    id: "city",
    label: "Grad i preporuke",
    desc: "Gost pita šta da vidi, gde da izađe, kako da stigne; priča o utiscima",
  },
  {
    id: "life",
    label: "Život i posao",
    desc: "Gost priča čime se bavi, o deci, cenama, poređenju sa svojom zemljom",
  },
  {
    id: "smalltalk",
    label: "Sport, vreme, opušteno",
    desc: "Utakmica, vremenska prognoza, šale, sve što se ispriča između dva stola",
  },
  {
    id: "interview",
    label: "Razgovor za posao",
    desc: "Customer support / success pozicija u tech kompaniji",
  },
];

const RESCUE = [
  { en: "Sorry, do you mean…?", sr: "Izvinite, mislite na…? — najbolja opšta spasilačka fraza" },
  { en: "Sorry, could you say that again? It's a bit loud in here.", sr: "Krivicu prebacuješ na buku, ne na sebe" },
  { en: "Where is that, exactly? I'd love to know.", sr: "Kad ne znaš mesto koje je pomenuo — zvuči kao interesovanje" },
  { en: "What does that mean? I've never heard it.", sr: "Za idiom ili sleng; gostima je drago da objasne" },
  { en: "Sorry, one more time — a little slower?", sr: "Direktno traženje sporijeg tempa, potpuno prihvatljivo" },
  { en: "So you're saying that…?", sr: "Prepričaš svojim rečima i proveriš da li si dobro razumeo" },
  { en: "Is that the same as…?", sr: "Kad naslutiš značenje pa hoćeš potvrdu" },
  { en: "My English is decent, but that one's new to me.", sr: "Iskreno i sa samopouzdanjem, bez izvinjavanja" },
];

const LEVELS = ["Početni", "Srednji", "Napredni"];

const VOCAB_KEY = "jezicki-trener:vocab";
const STATS_KEY = "jezicki-trener:stats";
const PIN_KEY = "jezicki-trener:pin";

export default function JezickiTrener() {
  const [lang, setLang] = useState("en");
  const [level, setLevel] = useState("Srednji");
  const [tab, setTab] = useState("znaci");

  const [scenario, setScenario] = useState("trip");

  const [lookupWord, setLookupWord] = useState("");
  const [lookupCtx, setLookupCtx] = useState("");
  const [lookup, setLookup] = useState(null);
  const [lBusy, setLBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const [srcText, setSrcText] = useState("");
  const [translation, setTranslation] = useState(null);
  const [tBusy, setTBusy] = useState(false);

  const [vocab, setVocab] = useState([]);
  const [vocabReady, setVocabReady] = useState(false);
  const [card, setCard] = useState(null);
  const [revealed, setRevealed] = useState(false);

  const [drill, setDrill] = useState([]);
  const [dIdx, setDIdx] = useState(0);
  const [dAnswer, setDAnswer] = useState("");
  const [dResult, setDResult] = useState(null);
  const [dBusy, setDBusy] = useState(false);
  const [dDone, setDDone] = useState(0);
  const [stats, setStats] = useState({ streak: 0, lastDay: null, total: 0 });

  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  const [pin, setPin] = useState(null);
  const [pinChecked, setPinChecked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  const langName = LANGS.find((l) => l.code === lang).name;
  const langNative = LANGS.find((l) => l.code === lang).native;

  useEffect(() => {
    try {
      const res = localStorage.getItem(VOCAB_KEY);
      setVocab(res ? JSON.parse(res) : []);
    } catch {
      setVocab([]);
    }
    setVocabReady(true);
    try {
      const s = localStorage.getItem(STATS_KEY);
      if (s) setStats(JSON.parse(s));
    } catch {
      /* prvi put — ostaje podrazumevano */
    }
    try {
      setPin(localStorage.getItem(PIN_KEY));
    } catch {
      setPin(null);
    }
    setPinChecked(true);
  }, []);

  async function unlock() {
    const trimmed = pinInput.trim();
    if (!trimmed || pinBusy) return;
    setPinBusy(true);
    setPinError("");
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-pin": trimmed },
        body: JSON.stringify({ check: true }),
      });
      if (res.ok) {
        try {
          localStorage.setItem(PIN_KEY, trimmed);
        } catch {
          /* i bez pamcenja radi, samo se pita svaki put */
        }
        setPin(trimmed);
        setPinInput("");
      } else {
        setPinError("Pogrešan PIN.");
      }
    } catch {
      setPinError("Nema veze sa serverom. Pokušaj ponovo.");
    }
    setPinBusy(false);
  }

  function lock() {
    try {
      localStorage.removeItem(PIN_KEY);
    } catch {
      /* nema veze */
    }
    setPin(null);
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  function saveVocab(next) {
    setVocab(next);
    try {
      localStorage.setItem(VOCAB_KEY, JSON.stringify(next));
    } catch {
      setError("Rečnik nije sačuvan. Pokušaj ponovo.");
    }
  }

  async function callClaude(payloadMessages, system) {
    const response = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-pin": pin || "" },
      body: JSON.stringify({
        system,
        messages: payloadMessages,
      }),
    });
    if (response.status === 401) {
      lock();
      throw new Error("PIN više ne važi");
    }
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.content)) {
      console.error("Claude API greška:", data.detail || data.error || data);
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  }

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    setError("");
    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);

    const sc = SCENARIOS.find((s) => s.id === scenario);
    const system = `Ti si partner za vežbanje jezika. Ciljni jezik: ${langNative} (${langName}). Nivo korisnika: ${level}. Maternji jezik korisnika: srpski.

Situacija: ${sc.label} — ${sc.desc}. Ti igraš drugu stranu u toj situaciji (poslodavca, gosta, prodavca, kolegu). Ostani u ulozi, odgovaraj kratko i prirodno, 1-3 rečenice, i uvek postavi pitanje ili daj repliku koja tera razgovor dalje. Prilagodi težinu jezika nivou korisnika.

Posle svake poruke korisnika proveri njegovu rečenicu. Ako ima grešku ili postoji prirodniji način da se to kaže, popuni "correction". Ako je rečenica dobra, stavi null.

Odgovori ISKLJUČIVO validnim JSON objektom, bez ikakvog teksta pre ili posle, bez markdown ograda:
{"reply": "tvoja replika na ciljnom jeziku", "reply_sr": "prevod tvoje replike na srpski", "correction": {"issue": "kratko objašnjenje greške NA SRPSKOM", "better": "ispravljena rečenica na ciljnom jeziku"} ili null}`;

    try {
      const parsed = await callClaude(
        nextMessages.map((m) =>
          m.role === "user"
            ? { role: "user", content: m.content }
            : { role: "assistant", content: m.content }
        ),
        system
      );
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: parsed.reply,
          sr: parsed.reply_sr,
          correction: parsed.correction || null,
        },
      ]);
    } catch {
      setError("Odgovor nije stigao. Pošalji poruku ponovo.");
      setMessages(nextMessages);
    }
    setBusy(false);
  }

  async function translate() {
    const trimmed = srcText.trim();
    if (!trimmed || tBusy) return;
    setError("");
    setTBusy(true);
    setTranslation(null);

    const system = `Prevodiš sa srpskog na ${langNative} (${langName}). Korisnik je ugostitelj iz Srbije koji uči jezik za rad sa gostima i za razgovore za posao u tehnološkim kompanijama.

Odgovori ISKLJUČIVO validnim JSON objektom, bez teksta pre ili posle, bez markdown ograda:
{"main": "najprirodniji prevod", "formal": "formalna varijanta", "casual": "opuštena varijanta", "note": "jedna rečenica NA SRPSKOM o tome zašto se glavni prevod tako kaže ili šta se najčešće greši", "key_word": "jedna ključna reč ili fraza iz prevoda", "key_word_sr": "njeno značenje na srpskom"}`;

    try {
      const parsed = await callClaude([{ role: "user", content: trimmed }], system);
      setTranslation(parsed);
    } catch {
      setError("Prevod nije uspeo. Pokušaj ponovo.");
    }
    setTBusy(false);
  }

  function speak(text) {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === "en" ? "en-US" : lang === "de" ? "de-DE" : "el-GR";
      u.rate = 0.92;
      window.speechSynthesis.speak(u);
    } catch {
      setError("Izgovor ne radi u ovom pregledaču.");
    }
  }

  async function doLookup() {
    const w = lookupWord.trim();
    if (!w || lBusy) return;
    setError("");
    setLBusy(true);
    setLookup(null);

    const system = `Korisnik je konobar u Srbiji sa 20+ godina iskustva. Radi sa stranim gostima i tokom razgovora nije razumeo reč ili izraz na jeziku: ${langNative} (${langName}). Njegov nivo je dobar — ne treba mu osnovna škola, treba mu tačno značenje i kako da odgovori.

Reč ili izraz može biti pogrešno zapisan jer ga je čuo, ne pročitao. Ako liči na nešto drugo, pretpostavi najverovatniju stvarnu reč i to napiši u "actual".

Odgovori ISKLJUČIVO validnim JSON objektom, bez teksta pre ili posle, bez markdown ograda:
{"actual": "reč kako se stvarno piše", "meaning": "značenje NA SRPSKOM, konkretno", "type": "reč | idiom | sleng | naziv mesta | skraćenica", "example": "kratka rečenica na ciljnom jeziku u kojoj se koristi", "reply": "šta korisnik može da odgovori gostu, na ciljnom jeziku", "reply_sr": "prevod tog odgovora na srpski"}`;

    const content = lookupCtx.trim()
      ? `Reč: ${w}\nKontekst razgovora: ${lookupCtx.trim()}`
      : `Reč: ${w}`;

    try {
      const parsed = await callClaude([{ role: "user", content }], system);
      setLookup(parsed);
    } catch {
      setError("Nije uspelo. Pokušaj ponovo.");
    }
    setLBusy(false);
  }

  function norm(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[.,!?;:'"“”„–—-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function buildDrill() {
    if (dBusy) return;
    setError("");
    setDBusy(true);
    setDrill([]);
    setDIdx(0);
    setDAnswer("");
    setDResult(null);
    setDDone(0);

    const mine = langVocab.slice(0, 12).map((v) => v.dst).join(", ");
    const system = `Praviš dnevni trening jezika za konobara iz Srbije sa 20+ godina iskustva. Ciljni jezik: ${langNative} (${langName}). Nivo: ${level}. On već tečno radi sa gostima i zna gastro vokabular — NE daj mu početničke rečenice tipa "the boy eats an apple". Cilj je skok ka prirodnom, tečnom govoru: kolokacije, idiomi, brz govor, nijansa između gramatički tačnog i onoga što izvorni govornik stvarno kaže.

Teme drži oko onoga o čemu gosti u restoranu pričaju: putovanja i rute, grad i preporuke, posao i život, sport i vreme, kao i profesionalna komunikacija za customer support poziciju.
${mine ? `\nAko prirodno možeš, upotrebi neke od ovih reči koje on uči: ${mine}.` : ""}

Napravi tačno 6 zadataka ovim redom: listen, gist, translate, listen, gist, choice.

- "listen": rečenica koju će mu aplikacija pročitati naglas, a on kuca šta je čuo. Prirodna govorna rečenica od 8 do 14 reči, sa skraćivanjima i spojenim rečima kakve se stvarno izgovaraju (gonna, wanna, kind of, I've been, we'd rather).
- "gist": pasus od 3 do 4 rečenice koji mu se čita naglas dok NE vidi tekst — kao da gost priča za stolom. Uz njega jedno pitanje NA SRPSKOM o sadržaju, na koje se ne može odgovoriti pogađanjem, nego samo ako je stvarno razumeo. Pitaj konkretan detalj ili poentu, ne opštu temu.
- "translate": kratka rečenica na srpskom koju treba da kaže na ciljnom jeziku.
- "choice": pitanje sa 3 ponuđena odgovora gde su bar dva gramatički tačna, ali samo jedan zvuči kao izvorni govornik.

Odgovori ISKLJUČIVO validnim JSON nizom, bez teksta pre ili posle, bez markdown ograda:
[{"type":"listen","text":"rečenica na ciljnom jeziku","sr":"prevod na srpski"},
{"type":"gist","text":"pasus na ciljnom jeziku","question":"pitanje NA SRPSKOM o sadržaju","answer":"tačan odgovor NA SRPSKOM","sr":"prevod celog pasusa na srpski"},
{"type":"translate","sr":"rečenica na srpskom","text":"model odgovor na ciljnom jeziku","note":"kratka napomena NA SRPSKOM"},
{"type":"choice","prompt":"pitanje ili situacija NA SRPSKOM","options":["a","b","c"],"correct":0,"why":"objašnjenje NA SRPSKOM zašto je taj prirodniji"}]`;

    try {
      const parsed = await callClaude(
        [{ role: "user", content: "Napravi današnji trening." }],
        system
      );
      setDrill(Array.isArray(parsed) ? parsed : []);
    } catch {
      setError("Trening nije generisan. Pokušaj ponovo.");
    }
    setDBusy(false);
  }

  function bumpStreak() {
    const today = new Date().toISOString().slice(0, 10);
    if (stats.lastDay === today) return;
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const next = {
      streak: stats.lastDay === y ? stats.streak + 1 : 1,
      lastDay: today,
      total: stats.total + 1,
    };
    setStats(next);
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(next));
    } catch {
      /* statistika nije kritična */
    }
  }

  function checkDrill() {
    const q = drill[dIdx];
    if (!q) return;
    if (q.type === "choice") {
      const ok = Number(dAnswer) === q.correct;
      setDResult({ ok, right: q.options[q.correct], why: q.why });
    } else if (q.type === "listen") {
      const ok = norm(dAnswer) === norm(q.text);
      setDResult({ ok, right: q.text, why: q.sr });
    } else if (q.type === "gist") {
      setDResult({ ok: null, right: q.answer, why: q.text, extra: q.sr });
    } else {
      setDResult({ ok: null, right: q.text, why: q.note });
    }
  }

  function nextDrill(scored) {
    if (dResult && (dResult.ok === true || scored === true)) setDDone(dDone + 1);
    setDResult(null);
    setDAnswer("");
    if (dIdx + 1 >= drill.length) {
      bumpStreak();
      setDIdx(drill.length);
    } else {
      setDIdx(dIdx + 1);
    }
  }

  function addToVocab(src, dst) {
    const entry = {
      id: Date.now() + Math.random(),
      lang,
      src,
      dst,
      seen: 0,
      known: 0,
      added: new Date().toISOString().slice(0, 10),
    };
    saveVocab([entry, ...vocab]);
  }

  function removeFromVocab(id) {
    saveVocab(vocab.filter((v) => v.id !== id));
  }

  const langVocab = vocab.filter((v) => v.lang === lang);

  function drawCard() {
    if (!langVocab.length) return;
    const weighted = langVocab.slice().sort((a, b) => {
      const scoreA = a.seen === 0 ? -1 : a.known / a.seen;
      const scoreB = b.seen === 0 ? -1 : b.known / b.seen;
      return scoreA - scoreB;
    });
    const pool = weighted.slice(0, Math.max(3, Math.ceil(weighted.length / 2)));
    setCard(pool[Math.floor(Math.random() * pool.length)]);
    setRevealed(false);
  }

  function grade(knew) {
    const next = vocab.map((v) =>
      v.id === card.id ? { ...v, seen: v.seen + 1, known: v.known + (knew ? 1 : 0) } : v
    );
    saveVocab(next);
    const pool = next.filter((v) => v.lang === lang);
    const others = pool.filter((v) => v.id !== card.id);
    const source = others.length ? others : pool;
    setCard(source[Math.floor(Math.random() * source.length)]);
    setRevealed(false);
  }

  const css = `
    .jt { --bg:#E7EBE7; --paper:#FDFDFB; --ink:#16231D; --muted:#5F6D66; --line:#C9D2CC;
          --accent:#1D4ED8; --soft:#DEE7FE; --warn:#A9491B; --warnsoft:#F6E7DE;
          background:var(--bg); color:var(--ink); min-height:100vh; padding:24px 16px 40px;
          font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .jt-wrap { max-width:760px; margin:0 auto; }
    .jt h1 { font-family:Georgia,"Times New Roman",serif; font-weight:400; font-size:30px;
             letter-spacing:-0.4px; margin:0 0 4px; }
    .jt .sub { color:var(--muted); font-size:14px; margin:0 0 20px; }
    .jt-row { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
    .jt-seg { display:inline-flex; border:1px solid var(--line); border-radius:999px; overflow:hidden; background:var(--paper); }
    .jt-seg button { border:0; background:transparent; padding:7px 15px; font-size:13.5px; color:var(--muted);
                     cursor:pointer; font-family:inherit; }
    .jt-seg button.on { background:var(--ink); color:#fff; }
    .jt-tabs { display:flex; gap:22px; border-bottom:1px solid var(--line); margin:18px 0 20px; }
    .jt-tabs button { border:0; background:transparent; padding:0 0 10px; font-size:15px; cursor:pointer;
                      color:var(--muted); font-family:inherit; border-bottom:2px solid transparent; margin-bottom:-1px; }
    .jt-tabs button.on { color:var(--ink); border-bottom-color:var(--accent); }
    .jt-card { background:var(--paper); border:1px solid var(--line); border-radius:10px; padding:16px; }
    .jt-chat { height:340px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; padding:4px 2px; }
    .jt-msg { max-width:82%; padding:10px 13px; border-radius:12px; font-size:15px; line-height:1.5; }
    .jt-me { align-self:flex-end; background:var(--soft); }
    .jt-them { align-self:flex-start; background:var(--paper); border:1px solid var(--line); }
    .jt-sr { font-size:12.5px; color:var(--muted); margin-top:6px; }
    .jt-fix { align-self:flex-start; max-width:82%; background:var(--warnsoft); border-left:3px solid var(--warn);
              padding:9px 12px; border-radius:0 8px 8px 0; font-size:13.5px; line-height:1.5; }
    .jt-fix b { color:var(--warn); font-weight:600; }
    .jt input[type=text], .jt input[type=password], .jt textarea { width:100%; box-sizing:border-box; font-family:inherit; font-size:15px;
      padding:11px 13px; border:1px solid var(--line); border-radius:8px; background:var(--paper); color:var(--ink); }
    .jt input:focus, .jt textarea:focus { outline:2px solid var(--accent); outline-offset:1px; }
    .jt-btn { background:var(--ink); color:#fff; border:0; border-radius:8px; padding:11px 18px; font-size:14.5px;
              cursor:pointer; font-family:inherit; }
    .jt-btn:disabled { opacity:.45; cursor:default; }
    .jt-btn.ghost { background:transparent; color:var(--accent); border:1px solid var(--line); }
    .jt-empty { color:var(--muted); font-size:14px; line-height:1.6; }
    .jt-item { display:flex; justify-content:space-between; align-items:flex-start; gap:12px;
               padding:12px 0; border-bottom:1px solid var(--line); }
    .jt-item:last-child { border-bottom:0; }
    .jt-x { border:0; background:transparent; color:var(--muted); cursor:pointer; font-size:18px; line-height:1; padding:2px 4px; }
    .jt-err { background:var(--warnsoft); color:var(--warn); padding:9px 12px; border-radius:8px; font-size:13.5px; margin-bottom:12px; }
    .jt-stat { font-size:12px; color:var(--muted); }
    @media (max-width:520px){ .jt-msg,.jt-fix{max-width:94%} .jt h1{font-size:25px} }
  `;

  if (!pinChecked) {
    return <div className="jt"><style>{css}</style></div>;
  }

  if (!pin) {
    return (
      <div className="jt">
        <style>{css}</style>
        <div className="jt-wrap" style={{ maxWidth: 360, paddingTop: 60 }}>
          <h1>Jezički trener</h1>
          <p className="sub">Unesi PIN. Telefon će ga zapamtiti, pa se pita samo prvi put.</p>
          {pinError && <div className="jt-err">{pinError}</div>}
          <div className="jt-card">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlock()}
            />
            <button
              className="jt-btn"
              style={{ marginTop: 10 }}
              onClick={unlock}
              disabled={pinBusy || !pinInput.trim()}
            >
              {pinBusy ? "Proveravam…" : "Otključaj"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jt">
      <style>{css}</style>
      <div className="jt-wrap">
        <h1>Jezički trener</h1>
        <p className="sub">Reč koja te je oborila na smeni — objasni je, sačuvaj je, ponovi je.</p>

        <div className="jt-row">
          <div className="jt-seg">
            {LANGS.map((l) => (
              <button key={l.code} className={lang === l.code ? "on" : ""} onClick={() => setLang(l.code)}>
                {l.name}
              </button>
            ))}
          </div>
          <div className="jt-seg">
            {LEVELS.map((lv) => (
              <button key={lv} className={level === lv ? "on" : ""} onClick={() => setLevel(lv)}>
                {lv}
              </button>
            ))}
          </div>
        </div>

        <div className="jt-tabs">
          <button className={tab === "znaci" ? "on" : ""} onClick={() => setTab("znaci")}>Šta znači</button>
          <button className={tab === "trening" ? "on" : ""} onClick={() => setTab("trening")}>
            Trening{stats.streak ? ` · ${stats.streak}` : ""}
          </button>
          <button className={tab === "razgovor" ? "on" : ""} onClick={() => setTab("razgovor")}>Razgovor</button>
          <button className={tab === "prevod" ? "on" : ""} onClick={() => setTab("prevod")}>Prevod</button>
          <button className={tab === "recnik" ? "on" : ""} onClick={() => setTab("recnik")}>
            Rečnik {langVocab.length ? `(${langVocab.length})` : ""}
          </button>
        </div>

        {error && <div className="jt-err">{error}</div>}

        {tab === "trening" && (
          <div className="jt-card">
            {drill.length === 0 && (
              <div>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 18, marginBottom: 6 }}>
                  Šest zadataka, oko deset minuta
                </div>
                <p className="jt-empty" style={{ marginTop: 0 }}>
                  Dva diktata, dva slušanja bez teksta, prevod i jedan izbor. Bez ponuđenih odgovora tamo gde je
                  bitno — ili si razumeo ili nisi.
                  {langVocab.length > 0
                    ? ` Zadaci se prave i oko ${langVocab.length} reči iz tvog rečnika.`
                    : " Kad napuniš rečnik, zadaci će koristiti tvoje reči."}
                </p>
                <button className="jt-btn" onClick={buildDrill} disabled={dBusy}>
                  {dBusy ? "Spremam trening…" : "Počni trening"}
                </button>
                {(stats.streak > 0 || stats.total > 0) && (
                  <div className="jt-stat" style={{ marginTop: 16 }}>
                    Niz: {stats.streak} {stats.streak === 1 ? "dan" : "dana"} · ukupno treninga: {stats.total}
                    {stats.lastDay ? ` · poslednji: ${stats.lastDay}` : ""}
                  </div>
                )}
              </div>
            )}

            {drill.length > 0 && dIdx >= drill.length && (
              <div style={{ textAlign: "center", padding: "20px 8px" }}>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 22 }}>
                  {dDone} od {drill.length}
                </div>
                <p className="jt-empty" style={{ marginTop: 8 }}>
                  Niz: {stats.streak} {stats.streak === 1 ? "dan" : "dana"}. Sutra opet, isto vreme.
                </p>
                <button className="jt-btn" style={{ marginTop: 8 }} onClick={() => setDrill([])}>
                  Zatvori
                </button>
              </div>
            )}

            {drill.length > 0 && dIdx < drill.length && (
              <div>
                <div className="jt-stat" style={{ marginBottom: 14 }}>
                  {dIdx + 1} / {drill.length}
                </div>

                {drill[dIdx].type === "listen" && (
                  <div>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 17, marginBottom: 10 }}>
                      Slušaj i napiši
                    </div>
                    <button className="jt-btn" onClick={() => speak(drill[dIdx].text)}>
                      🔊 Pusti rečenicu
                    </button>
                    <input
                      type="text"
                      style={{ marginTop: 12 }}
                      value={dAnswer}
                      placeholder="Šta si čuo"
                      disabled={!!dResult}
                      onChange={(e) => setDAnswer(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !dResult) checkDrill(); }}
                    />
                  </div>
                )}

                {drill[dIdx].type === "choice" && (
                  <div>
                    <div style={{ fontSize: 16, marginBottom: 12, lineHeight: 1.5 }}>
                      {drill[dIdx].prompt}
                    </div>
                    {drill[dIdx].options.map((o, i) => (
                      <div
                        key={i}
                        onClick={() => !dResult && setDAnswer(String(i))}
                        style={{
                          padding: "11px 13px",
                          marginBottom: 8,
                          border: "1px solid var(--line)",
                          borderRadius: 8,
                          cursor: dResult ? "default" : "pointer",
                          background: String(i) === dAnswer ? "var(--soft)" : "transparent",
                          fontSize: 15,
                        }}
                      >
                        {o}
                      </div>
                    ))}
                  </div>
                )}

                {drill[dIdx].type === "gist" && (
                  <div>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 17, marginBottom: 6 }}>
                      Slušaj i reci šta je rekao
                    </div>
                    <p className="jt-empty" style={{ marginTop: 0, marginBottom: 10 }}>
                      Tekst se ne prikazuje. Pusti koliko god puta treba, pa odgovori na srpskom.
                    </p>
                    <button className="jt-btn" onClick={() => speak(drill[dIdx].text)}>
                      🔊 Pusti
                    </button>
                    <div style={{ fontSize: 16, margin: "14px 0 10px", lineHeight: 1.5 }}>
                      {drill[dIdx].question}
                    </div>
                    <input
                      type="text"
                      value={dAnswer}
                      placeholder="Odgovori na srpskom"
                      disabled={!!dResult}
                      onChange={(e) => setDAnswer(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !dResult) checkDrill(); }}
                    />
                  </div>
                )}

                {drill[dIdx].type === "translate" && (
                  <div>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 17, marginBottom: 10 }}>
                      Kako bi ovo rekao gostu
                    </div>
                    <div style={{ fontSize: 16, marginBottom: 12 }}>{drill[dIdx].sr}</div>
                    <input
                      type="text"
                      value={dAnswer}
                      placeholder={`Napiši na ${langNative}`}
                      disabled={!!dResult}
                      onChange={(e) => setDAnswer(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !dResult) checkDrill(); }}
                    />
                  </div>
                )}

                {!dResult && (
                  <button
                    className="jt-btn"
                    style={{ marginTop: 14 }}
                    onClick={checkDrill}
                    disabled={dAnswer === ""}
                  >
                    Proveri
                  </button>
                )}

                {dResult && (
                  <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                    {dResult.ok === true && (
                      <div style={{ color: "var(--accent)", fontSize: 15.5, marginBottom: 6 }}>Tačno.</div>
                    )}
                    {dResult.ok === false && (
                      <div style={{ color: "var(--warn)", fontSize: 15.5, marginBottom: 6 }}>Nije tačno.</div>
                    )}
                    <div style={{ fontSize: 16, lineHeight: 1.5 }}>
                      {dResult.right}
                      <button className="jt-x" onClick={() => speak(dResult.right)} aria-label="Izgovori">🔊</button>
                    </div>
                    {dResult.why && <div className="jt-sr" style={{ marginTop: 6 }}>{dResult.why}</div>}
                    {dResult.extra && <div className="jt-sr" style={{ marginTop: 6 }}>{dResult.extra}</div>}

                    <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                      {dResult.ok === null ? (
                        <>
                          <button className="jt-btn ghost" onClick={() => nextDrill(false)}>Promašio sam</button>
                          <button className="jt-btn" onClick={() => nextDrill(true)}>Pogodio sam</button>
                        </>
                      ) : (
                        <button className="jt-btn" onClick={() => nextDrill()}>Dalje</button>
                      )}
                      <button
                        className="jt-btn ghost"
                        onClick={() => addToVocab(dResult.why || drill[dIdx].sr || "iz treninga", dResult.right)}
                      >
                        Sačuvaj u rečnik
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "znaci" && (
          <div>
            <div className="jt-card">
              <input
                type="text"
                value={lookupWord}
                placeholder="Reč koju nisi razumeo — piši kako si je čuo"
                onChange={(e) => setLookupWord(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doLookup(); }}
              />
              <input
                type="text"
                style={{ marginTop: 8 }}
                value={lookupCtx}
                placeholder="O čemu se pričalo (nije obavezno)"
                onChange={(e) => setLookupCtx(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doLookup(); }}
              />
              <button className="jt-btn" style={{ marginTop: 10 }} onClick={doLookup} disabled={lBusy || !lookupWord.trim()}>
                {lBusy ? "Tražim…" : "Objasni mi"}
              </button>

              {lookup && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 21, fontFamily: "Georgia, serif" }}>{lookup.actual}</span>
                    <span className="jt-stat">{lookup.type}</span>
                    <button className="jt-x" onClick={() => speak(lookup.actual)} aria-label="Izgovori">🔊</button>
                  </div>
                  <div style={{ fontSize: 15.5, marginTop: 8, lineHeight: 1.5 }}>{lookup.meaning}</div>
                  <div className="jt-sr" style={{ marginTop: 10, fontStyle: "italic" }}>{lookup.example}</div>

                  <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                    <div className="jt-stat">odgovori gostu</div>
                    <div style={{ fontSize: 15.5, marginTop: 5 }}>
                      {lookup.reply}
                      <button className="jt-x" onClick={() => speak(lookup.reply)} aria-label="Izgovori">🔊</button>
                    </div>
                    <div className="jt-sr">{lookup.reply_sr}</div>
                  </div>

                  <button
                    className="jt-btn ghost"
                    style={{ marginTop: 16 }}
                    onClick={() => addToVocab(lookup.meaning, lookup.actual)}
                  >
                    Sačuvaj u rečnik
                  </button>
                </div>
              )}
            </div>

            <div className="jt-card" style={{ marginTop: 14 }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 17, marginBottom: 4 }}>
                Kad zapneš usred razgovora
              </div>
              <p className="jt-empty" style={{ margin: "0 0 12px" }}>
                Nauči ovih osam napamet. Gost ne primeti da nešto nisi razumeo — čuje da te zanima.
              </p>
              {RESCUE.map((r, i) => (
                <div className="jt-item" key={i}>
                  <div>
                    <div style={{ fontSize: 15.5 }}>{r.en}</div>
                    <div className="jt-sr">{r.sr}</div>
                  </div>
                  <button className="jt-x" onClick={() => speak(r.en)} aria-label="Izgovori">🔊</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "razgovor" && (
          <div>
            <div className="jt-row">
              <div className="jt-seg">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.id}
                    className={scenario === s.id ? "on" : ""}
                    onClick={() => { setScenario(s.id); setMessages([]); }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="jt-card">
              <div className="jt-chat" ref={scrollRef}>
                {messages.length === 0 && (
                  <p className="jt-empty">
                    Napiši prvu rečenicu na jeziku koji učiš. Sagovornik ostaje u ulozi, a ispod svake tvoje
                    poruke dobijaš ispravku ako je ima.
                  </p>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={{ display: "contents" }}>
                    <div className={m.role === "user" ? "jt-msg jt-me" : "jt-msg jt-them"}>
                      {m.content}
                      {m.sr && <div className="jt-sr">{m.sr}</div>}
                    </div>
                    {m.correction && (
                      <div className="jt-fix">
                        <b>Bolje:</b> {m.correction.better}
                        <div className="jt-sr">{m.correction.issue}</div>
                        <button
                          className="jt-btn ghost"
                          style={{ marginTop: 8, padding: "6px 12px", fontSize: 13 }}
                          onClick={() => addToVocab(m.correction.issue, m.correction.better)}
                        >
                          Sačuvaj u rečnik
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {busy && <div className="jt-msg jt-them jt-empty">piše…</div>}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <input
                  type="text"
                  value={input}
                  placeholder={`Piši na ${langNative}`}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                />
                <button className="jt-btn" onClick={send} disabled={busy || !input.trim()}>
                  Pošalji
                </button>
              </div>
              {messages.length > 0 && (
                <button
                  className="jt-btn ghost"
                  style={{ marginTop: 10, padding: "7px 14px", fontSize: 13 }}
                  onClick={() => setMessages([])}
                >
                  Počni novi razgovor
                </button>
              )}
            </div>
          </div>
        )}

        {tab === "prevod" && (
          <div className="jt-card">
            <textarea
              rows={3}
              value={srcText}
              placeholder="Napiši na srpskom šta hoćeš da kažeš"
              onChange={(e) => setSrcText(e.target.value)}
            />
            <button className="jt-btn" style={{ marginTop: 10 }} onClick={translate} disabled={tBusy || !srcText.trim()}>
              {tBusy ? "Prevodim…" : `Prevedi na ${langName.toLowerCase()}`}
            </button>

            {translation && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 19, lineHeight: 1.45 }}>{translation.main}</div>
                <div className="jt-sr" style={{ marginTop: 10 }}>{translation.note}</div>
                <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <div style={{ fontSize: 14.5, marginBottom: 6 }}>
                    <span className="jt-stat">formalno · </span>{translation.formal}
                  </div>
                  <div style={{ fontSize: 14.5 }}>
                    <span className="jt-stat">opušteno · </span>{translation.casual}
                  </div>
                </div>
                <button
                  className="jt-btn ghost"
                  style={{ marginTop: 14 }}
                  onClick={() => addToVocab(translation.key_word_sr || srcText, translation.key_word || translation.main)}
                >
                  Sačuvaj „{translation.key_word}" u rečnik
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "recnik" && (
          <div className="jt-card">
            {!vocabReady && <p className="jt-empty">Učitavam…</p>}

            {vocabReady && langVocab.length === 0 && (
              <p className="jt-empty">
                Rečnik za {langName.toLowerCase()} je prazan. Sačuvaj reč iz prevoda ili iz ispravke u razgovoru,
                pa se ovde vraćaj da je ponoviš.
              </p>
            )}

            {vocabReady && langVocab.length > 0 && !card && (
              <div>
                <button className="jt-btn" onClick={drawCard}>Vežbaj ({langVocab.length})</button>
                <div style={{ marginTop: 18 }}>
                  {langVocab.map((v) => (
                    <div className="jt-item" key={v.id}>
                      <div>
                        <div style={{ fontSize: 15.5 }}>{v.dst}</div>
                        <div className="jt-sr">{v.src}</div>
                        <div className="jt-stat" style={{ marginTop: 4 }}>
                          {v.seen ? `${v.known}/${v.seen} tačno` : "još nije vežbano"} · {v.added}
                        </div>
                      </div>
                      <button className="jt-x" onClick={() => removeFromVocab(v.id)} aria-label="Obriši">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {card && (
              <div style={{ textAlign: "center", padding: "24px 8px" }}>
                <div className="jt-stat">kako se kaže</div>
                <div style={{ fontSize: 21, margin: "10px 0 22px", fontFamily: "Georgia, serif" }}>{card.src}</div>

                {!revealed ? (
                  <button className="jt-btn" onClick={() => setRevealed(true)}>Prikaži odgovor</button>
                ) : (
                  <div>
                    <div style={{ fontSize: 19, marginBottom: 20 }}>
                      {card.dst}
                      <button className="jt-x" onClick={() => speak(card.dst)} aria-label="Izgovori">🔊</button>
                    </div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                      <button className="jt-btn ghost" onClick={() => grade(false)}>Nisam znao</button>
                      <button className="jt-btn" onClick={() => grade(true)}>Znao sam</button>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 26 }}>
                  <button className="jt-btn ghost" style={{ padding: "7px 14px", fontSize: 13 }} onClick={() => setCard(null)}>
                    Nazad na listu
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
