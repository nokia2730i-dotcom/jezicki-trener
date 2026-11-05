"use client";

import { useState, useEffect, useRef } from "react";
import { migrateVocab, reviewReason, MAX_TERM } from "../lib/vocab";

// Samo engleski. Nemacki i grcki su izbaceni — nivo odredjuje ulazni test,
// ne birac na ekranu.
const SCENARIOS = [
  { id: "trip", label: "Odakle su i kuda idu" },
  { id: "city", label: "Grad i preporuke" },
  { id: "life", label: "Život i posao" },
  { id: "smalltalk", label: "Sport, vreme, opušteno" },
  { id: "interview", label: "Razgovor za posao" },
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

const VOCAB_KEY = "jezicki-trener:vocab";
const STATS_KEY = "jezicki-trener:stats";
const PROGRESS_KEY = "jezicki-trener:progress";
const PIN_KEY = "jezicki-trener:pin";

export default function JezickiTrener() {
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
  const [reviewing, setReviewing] = useState(false);

  const [drill, setDrill] = useState([]);
  const [dIdx, setDIdx] = useState(0);
  const [dAnswer, setDAnswer] = useState("");
  const [dResult, setDResult] = useState(null);
  const [dBusy, setDBusy] = useState(false);
  const [dDone, setDDone] = useState(0);

  const [stats, setStats] = useState({ streak: 0, lastDay: null, total: 0 });
  const [progress, setProgress] = useState({ level: "A1" });

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const scrollRef = useRef(null);

  const [pin, setPin] = useState(null);
  const [pinChecked, setPinChecked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  useEffect(() => {
    let migrated = [];
    try {
      const stored = JSON.parse(localStorage.getItem(VOCAB_KEY) || "[]");
      migrated = migrateVocab(stored);
      // Upisi natrag samo ako se oblik stvarno promenio.
      if (JSON.stringify(stored) !== JSON.stringify(migrated)) {
        localStorage.setItem(VOCAB_KEY, JSON.stringify(migrated));
      }
    } catch {
      migrated = [];
    }
    setVocab(migrated);
    setVocabReady(true);

    try {
      const s = localStorage.getItem(STATS_KEY);
      if (s) setStats(JSON.parse(s));
    } catch {
      /* prvi put — ostaje podrazumevano */
    }
    try {
      const p = localStorage.getItem(PROGRESS_KEY);
      if (p) setProgress({ level: "A1", ...JSON.parse(p) });
    } catch {
      /* prvi put */
    }
    try {
      setPin(localStorage.getItem(PIN_KEY));
    } catch {
      setPin(null);
    }
    setPinChecked(true);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  // Greska i obavestenje ne smeju da vise kad predjes na drugi tab.
  useEffect(() => {
    setError("");
    setNotice("");
  }, [tab]);

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

  // Klijent salje samo ime zadatka i svoja polja. System prompt, model i
  // max_tokens su na serveru.
  async function callClaude(task, fields) {
    const response = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-pin": pin || "" },
      body: JSON.stringify({ task, fields }),
    });

    if (response.status === 401) {
      lock();
      throw new Error("PIN više ne važi");
    }

    let json = {};
    try {
      json = await response.json();
    } catch {
      throw new Error("Odgovor nije stigao.");
    }

    if (!response.ok || json.data === undefined) {
      // Server vraca poruku na srpskom — prikazi je, ne generiku.
      throw new Error(json.error || `Greška ${response.status}.`);
    }
    return json.data;
  }

  // ——— Recnik ————————————————————————————————————————————————

  function saveVocab(next) {
    setVocab(next);
    try {
      localStorage.setItem(VOCAB_KEY, JSON.stringify(next));
    } catch {
      setError("Rečnik nije sačuvan. Pokušaj ponovo.");
    }
  }

  // Kartica je JEDNA rec ili fraza. Cele recenice se odbijaju — to je bio bug.
  function addToVocab(term, meaning) {
    const t = String(term || "").trim();
    const m = String(meaning || "").trim();

    // Isto pravilo koje ocenjuje stare kartice odbija i nove — da se bug 1
    // ne moze ponoviti ni iz jednog novog mesta u aplikaciji.
    const problem = reviewReason(t, m, null);
    if (problem === "nedostaje polje") {
      setError("Kartica nije sačuvana — nedostaje reč ili značenje.");
      return;
    }
    if (problem === "cela rečenica") {
      setError("Kartica nije sačuvana — to je cela rečenica. Kartica treba da bude reč ili kratka fraza.");
      return;
    }
    if (problem) {
      setError(`Kartica nije sačuvana — ${problem}.`);
      return;
    }
    if (vocab.some((v) => (v.term || "").toLowerCase() === t.toLowerCase())) {
      setNotice(`„${t}" je već u rečniku.`);
      return;
    }

    saveVocab([
      {
        id: Date.now() + Math.random(),
        term: t,
        meaning: m,
        seen: 0,
        known: 0,
        added: new Date().toISOString().slice(0, 10),
      },
      ...vocab,
    ]);
    setNotice(`„${t}" je u rečniku.`);
  }

  function removeFromVocab(id) {
    saveVocab(vocab.filter((v) => v.id !== id));
  }

  function swapSides(id) {
    saveVocab(
      vocab.map((v) => {
        if (v.id !== id) return v;
        const flipped = { ...v, term: v.meaning, meaning: v.term };
        const reason = reviewReason(flipped.term, flipped.meaning, null);
        if (reason) return { ...flipped, needsReview: reason };
        const { needsReview, ...clean } = flipped;
        return clean;
      })
    );
  }

  function keepCard(id) {
    saveVocab(
      vocab.map((v) => {
        if (v.id !== id) return v;
        const { needsReview, ...clean } = v;
        return clean;
      })
    );
  }

  const toReview = vocab.filter((v) => v.needsReview);
  const healthy = vocab.filter((v) => !v.needsReview);

  function drawCard() {
    if (!healthy.length) return;
    const weighted = healthy.slice().sort((a, b) => {
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
    const pool = next.filter((v) => !v.needsReview);
    const others = pool.filter((v) => v.id !== card.id);
    const source = others.length ? others : pool;
    setCard(source.length ? source[Math.floor(Math.random() * source.length)] : null);
    setRevealed(false);
  }

  // ——— Alati ————————————————————————————————————————————————

  function speak(text, rate = 0.92) {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = rate;
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
    try {
      setLookup(await callClaude("lookup", { word: w, context: lookupCtx.trim() }));
    } catch (e) {
      setError(e.message);
    }
    setLBusy(false);
  }

  async function translate() {
    const trimmed = srcText.trim();
    if (!trimmed || tBusy) return;
    setError("");
    setTBusy(true);
    setTranslation(null);
    try {
      setTranslation(await callClaude("translate", { text: trimmed }));
    } catch (e) {
      setError(e.message);
    }
    setTBusy(false);
  }

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    setError("");
    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    try {
      const parsed = await callClaude("free_chat", {
        scenario,
        level: progress.level,
        messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
      });
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: parsed.reply,
          sr: parsed.reply_sr,
          correction: parsed.correction || null,
        },
      ]);
    } catch (e) {
      setError(e.message);
      setMessages(nextMessages);
    }
    setBusy(false);
  }

  // ——— Trening ———————————————————————————————————————————————
  // Ostaje privremeno, dok ga ne zameni motor lekcije. Sada ide kroz
  // registar zadataka na serveru.

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
    try {
      const parsed = await callClaude("drill", {
        level: progress.level,
        words: healthy.slice(0, 12).map((v) => v.term),
      });
      setDrill(Array.isArray(parsed.tasks) ? parsed.tasks : []);
    } catch (e) {
      setError(e.message);
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
      /* statistika nije kriticna */
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
      setDResult({ ok: null, right: q.text, why: q.why });
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

  const css = `
    .jt { --bg:#E7EBE7; --paper:#FDFDFB; --ink:#16231D; --muted:#5F6D66; --line:#C9D2CC;
          --accent:#1D4ED8; --soft:#DEE7FE; --warn:#A9491B; --warnsoft:#F6E7DE;
          --ok:#1B6B46; --oksoft:#DFF0E6;
          background:var(--bg); color:var(--ink); min-height:100vh; padding:24px 16px 40px;
          font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .jt-wrap { max-width:760px; margin:0 auto; }
    .jt h1 { font-family:Georgia,"Times New Roman",serif; font-weight:400; font-size:30px;
             letter-spacing:-0.4px; margin:0 0 4px; }
    .jt .sub { color:var(--muted); font-size:14px; margin:0 0 20px; }
    .jt-tabs { display:flex; gap:22px; border-bottom:1px solid var(--line); margin:18px 0 20px;
               overflow-x:auto; }
    .jt-tabs button { border:0; background:transparent; padding:0 0 10px; font-size:15px; cursor:pointer;
                      color:var(--muted); font-family:inherit; border-bottom:2px solid transparent;
                      margin-bottom:-1px; white-space:nowrap; }
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
    .jt-btn.small { padding:7px 13px; font-size:13px; }
    .jt-empty { color:var(--muted); font-size:14px; line-height:1.6; }
    .jt-item { display:flex; justify-content:space-between; align-items:flex-start; gap:12px;
               padding:12px 0; border-bottom:1px solid var(--line); }
    .jt-item:last-child { border-bottom:0; }
    .jt-x { border:0; background:transparent; color:var(--muted); cursor:pointer; font-size:18px; line-height:1; padding:2px 4px; }
    .jt-err { background:var(--warnsoft); color:var(--warn); padding:9px 12px; border-radius:8px; font-size:13.5px; margin-bottom:12px; }
    .jt-ok { background:var(--oksoft); color:var(--ok); padding:9px 12px; border-radius:8px; font-size:13.5px; margin-bottom:12px; }
    .jt-flag { display:inline-block; background:var(--warnsoft); color:var(--warn); font-size:11.5px;
               padding:2px 7px; border-radius:999px; margin-top:4px; }
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
        <p className="sub">
          Engleski · nivo {progress.level} <span className="jt-stat">(odrediće ga ulazni test)</span>
        </p>

        <div className="jt-tabs">
          <button className={tab === "znaci" ? "on" : ""} onClick={() => setTab("znaci")}>Šta znači</button>
          <button className={tab === "trening" ? "on" : ""} onClick={() => setTab("trening")}>
            Trening{stats.streak ? ` · ${stats.streak}` : ""}
          </button>
          <button className={tab === "razgovor" ? "on" : ""} onClick={() => setTab("razgovor")}>Razgovor</button>
          <button className={tab === "prevod" ? "on" : ""} onClick={() => setTab("prevod")}>Prevod</button>
          <button className={tab === "recnik" ? "on" : ""} onClick={() => setTab("recnik")}>
            Rečnik {healthy.length ? `(${healthy.length})` : ""}
            {toReview.length ? " ⚠" : ""}
          </button>
        </div>

        {error && <div className="jt-err">{error}</div>}
        {notice && <div className="jt-ok">{notice}</div>}

        {tab === "trening" && (
          <div className="jt-card">
            {drill.length === 0 && (
              <div>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 18, marginBottom: 6 }}>
                  Šest zadataka, oko deset minuta
                </div>
                <p className="jt-empty" style={{ marginTop: 0 }}>
                  Dva diktata, dva slušanja bez teksta, jedna situacija i jedan izbor.
                  {healthy.length > 0
                    ? ` Zadaci se prave i oko ${healthy.length} reči iz tvog rečnika.`
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
                      {drill[dIdx].sr}
                    </div>
                    {(drill[dIdx].options || []).map((o, i) => (
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

                {drill[dIdx].type === "situation" && (
                  <div>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 17, marginBottom: 10 }}>
                      Šta kažeš
                    </div>
                    <div style={{ fontSize: 16, marginBottom: 12, lineHeight: 1.5 }}>
                      {drill[dIdx].sr}
                    </div>
                    <input
                      type="text"
                      value={dAnswer}
                      placeholder="Napiši na engleskom"
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
                      <div style={{ color: "var(--ok)", fontSize: 15.5, marginBottom: 6 }}>Tačno.</div>
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
                      {drill[dIdx].key_word && (
                        <button
                          className="jt-btn ghost"
                          onClick={() => addToVocab(drill[dIdx].key_word, drill[dIdx].key_word_sr)}
                        >
                          Sačuvaj „{drill[dIdx].key_word}"
                        </button>
                      )}
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
                maxLength={80}
                placeholder="Reč koju nisi razumeo — piši kako si je čuo"
                onChange={(e) => setLookupWord(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doLookup(); }}
              />
              <input
                type="text"
                style={{ marginTop: 8 }}
                value={lookupCtx}
                maxLength={300}
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
                    onClick={() => addToVocab(lookup.actual, lookup.meaning)}
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  className={scenario === s.id ? "jt-btn small" : "jt-btn small ghost"}
                  onClick={() => { setScenario(s.id); setMessages([]); }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="jt-card">
              <div className="jt-chat" ref={scrollRef}>
                {messages.length === 0 && (
                  <p className="jt-empty">
                    Napiši prvu rečenicu na engleskom. Sagovornik ostaje u ulozi, a ispod svake tvoje
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
                        {m.correction.key_word && (
                          <button
                            className="jt-btn ghost small"
                            style={{ marginTop: 8 }}
                            onClick={() => addToVocab(m.correction.key_word, m.correction.key_word_sr)}
                          >
                            Sačuvaj „{m.correction.key_word}"
                          </button>
                        )}
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
                  maxLength={600}
                  placeholder="Piši na engleskom"
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                />
                <button className="jt-btn" onClick={send} disabled={busy || !input.trim()}>
                  Pošalji
                </button>
              </div>
              {messages.length > 0 && (
                <button
                  className="jt-btn ghost small"
                  style={{ marginTop: 10 }}
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
              maxLength={500}
              placeholder="Napiši na srpskom šta hoćeš da kažeš"
              onChange={(e) => setSrcText(e.target.value)}
            />
            <button className="jt-btn" style={{ marginTop: 10 }} onClick={translate} disabled={tBusy || !srcText.trim()}>
              {tBusy ? "Prevodim…" : "Prevedi na engleski"}
            </button>

            {translation && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 19, lineHeight: 1.45 }}>
                  {translation.main}
                  <button className="jt-x" onClick={() => speak(translation.main)} aria-label="Izgovori">🔊</button>
                </div>
                <div className="jt-sr" style={{ marginTop: 10 }}>{translation.note}</div>
                <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <div style={{ fontSize: 14.5, marginBottom: 6 }}>
                    <span className="jt-stat">formalno · </span>{translation.formal}
                  </div>
                  <div style={{ fontSize: 14.5 }}>
                    <span className="jt-stat">opušteno · </span>{translation.casual}
                  </div>
                </div>
                {translation.key_word && (
                  <button
                    className="jt-btn ghost"
                    style={{ marginTop: 14 }}
                    onClick={() => addToVocab(translation.key_word, translation.key_word_sr)}
                  >
                    Sačuvaj „{translation.key_word}" u rečnik
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "recnik" && (
          <div className="jt-card">
            {!vocabReady && <p className="jt-empty">Učitavam…</p>}

            {vocabReady && toReview.length > 0 && !reviewing && (
              <div className="jt-err" style={{ marginBottom: 14 }}>
                {toReview.length} {toReview.length === 1 ? "kartica" : "kartice"} iz starog rečnika nisu
                upotrebljive — stara verzija je u njih upisivala cele rečenice i okretala strane.
                Ništa nije obrisano.
                <div style={{ marginTop: 10 }}>
                  <button className="jt-btn small" onClick={() => setReviewing(true)}>
                    Pregledaj ih
                  </button>
                </div>
              </div>
            )}

            {vocabReady && reviewing && (
              <div>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 18, marginBottom: 4 }}>
                  Pregled starih kartica
                </div>
                <p className="jt-empty" style={{ marginTop: 0 }}>
                  Za svaku odluči: zameni strane ako je naopako, zadrži ako je u redu, obriši ako je
                  bezvredna. Kartice sa cele rečenice najbolje je obrisati — reč ćeš ponovo sačuvati
                  kad naiđe.
                </p>

                {toReview.length === 0 && (
                  <div className="jt-ok">Sve je pregledano.</div>
                )}

                {toReview.map((v) => (
                  <div key={v.id} style={{ borderBottom: "1px solid var(--line)", padding: "14px 0" }}>
                    <div style={{ fontSize: 15.5, wordBreak: "break-word" }}>{v.term || "—"}</div>
                    <div className="jt-sr" style={{ wordBreak: "break-word" }}>{v.meaning || "—"}</div>
                    <div className="jt-flag">{v.needsReview}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <button className="jt-btn small ghost" onClick={() => swapSides(v.id)}>
                        Zameni strane
                      </button>
                      <button className="jt-btn small ghost" onClick={() => keepCard(v.id)}>
                        Zadrži
                      </button>
                      <button className="jt-btn small" onClick={() => removeFromVocab(v.id)}>
                        Obriši
                      </button>
                    </div>
                  </div>
                ))}

                <button className="jt-btn ghost small" style={{ marginTop: 16 }} onClick={() => setReviewing(false)}>
                  Nazad na rečnik
                </button>
              </div>
            )}

            {vocabReady && !reviewing && healthy.length === 0 && (
              <p className="jt-empty">
                Rečnik je prazan. Sačuvaj reč iz objašnjenja, prevoda ili ispravke u razgovoru, pa se
                ovde vraćaj da je ponoviš.
              </p>
            )}

            {vocabReady && !reviewing && healthy.length > 0 && !card && (
              <div>
                <button className="jt-btn" onClick={drawCard}>Vežbaj ({healthy.length})</button>
                <div style={{ marginTop: 18 }}>
                  {healthy.map((v) => (
                    <div className="jt-item" key={v.id}>
                      <div>
                        <div style={{ fontSize: 15.5 }}>{v.term}</div>
                        <div className="jt-sr">{v.meaning}</div>
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

            {!reviewing && card && (
              <div style={{ textAlign: "center", padding: "24px 8px" }}>
                <div className="jt-stat">kako se kaže</div>
                <div style={{ fontSize: 21, margin: "10px 0 22px", fontFamily: "Georgia, serif" }}>{card.meaning}</div>

                {!revealed ? (
                  <button className="jt-btn" onClick={() => setRevealed(true)}>Prikaži odgovor</button>
                ) : (
                  <div>
                    <div style={{ fontSize: 19, marginBottom: 20 }}>
                      {card.term}
                      <button className="jt-x" onClick={() => speak(card.term)} aria-label="Izgovori">🔊</button>
                    </div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                      <button className="jt-btn ghost" onClick={() => grade(false)}>Nisam znao</button>
                      <button className="jt-btn" onClick={() => grade(true)}>Znao sam</button>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 26 }}>
                  <button className="jt-btn ghost small" onClick={() => setCard(null)}>
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
