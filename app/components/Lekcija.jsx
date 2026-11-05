"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BRZINE, imaEngleskiGlas, imaSlusanje, izgovori, prekini, slusaj } from "../lib/govor";
import { staFali, uporedi } from "../lib/ocena";
import { reviewReason } from "../lib/vocab";

// Koliko reci sme da ode u recnik iz jedne lekcije. Isti broj kao u
// JezickiTrener.zavrsiLekciju — kartica kraja mora da pokaze ono sto ce
// stvarno biti sacuvano, ne sve sto je usput prikupljeno.
const MAX_RECI = 6;

// Motor lekcije. Devet koraka, aktivnost se menja na svakom.
// Pravilo kroz celu komponentu: korisnik NIKAD ne sme da ostane zaglavljen.
// Ako poziv modela padne, dobija gresku i dugme da ide dalje.

const KORACI = [
  { id: "zagrevanje", naslov: "Zagrevanje", api: false },
  { id: "scena", naslov: "Scena", api: false },
  { id: "pravilo", naslov: "Jedno pravilo", api: false },
  { id: "blokovi", naslov: "Sklapanje", api: false },
  { id: "situacije", naslov: "Situacija → rečenica", api: true },
  { id: "slusanje", naslov: "Slušaj i razumi", api: true },
  { id: "izgovor", naslov: "Izgovori", api: false },
  { id: "boss", naslov: "Mini-boss", api: true },
  { id: "kraj", naslov: "Kartica kraja", api: false },
];

function promesaj(niz, seme) {
  // Namerno nije slucajno na svakom renderu — isti raspored dok je lekcija otvorena.
  const a = [...niz];
  let s = seme;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Reci({ rezultat }) {
  return (
    <div className="lk-reci">
      {rezultat.delovi.map((d, i) => (
        <span key={i} className={`lk-rec lk-${d.status}`}>
          {d.rec}
          {d.status === "blizu" && <i> ({d.dato})</i>}
        </span>
      ))}
      {rezultat.viska.map((w, i) => (
        <span key={`v${i}`} className="lk-rec lk-viska">
          {w}
        </span>
      ))}
    </div>
  );
}

function Zvucnik({ tekst, brzina, label = "Slušaj" }) {
  const [radi, setRadi] = useState(false);
  return (
    <button
      className="jt-btn ghost small"
      disabled={radi}
      onClick={async () => {
        setRadi(true);
        await izgovori(tekst, { brzina });
        setRadi(false);
      }}
    >
      {radi ? "…" : `▶ ${label}`}
    </button>
  );
}

export default function Lekcija({ lekcija, nivo, recnik, callClaude, onZavrseno, onIzlaz }) {
  const [korak, setKorak] = useState(0);
  const [brzina, setBrzina] = useState(1.0);
  const [greska, setGreska] = useState("");
  const [bodovi, setBodovi] = useState({ tacno: 0, ukupno: 0 });
  const noveReci = useRef([]);

  // Korak 0 — zagrevanje
  const zagrevanje = useMemo(() => {
    const zdrave = (recnik || []).filter((v) => !v.needsReview && v.term && v.meaning);
    return promesaj(zdrave, 7).slice(0, 3);
  }, [recnik]);
  const [zIdx, setZIdx] = useState(0);
  const [zOkrenuto, setZOkrenuto] = useState(false);

  // Korak 1 — scena
  const [scenaPustena, setScenaPustena] = useState(false);
  const [scenaVidljiva, setScenaVidljiva] = useState(false);
  const [scenaRadi, setScenaRadi] = useState(false);

  // Korak 3 — blokovi
  const [bIdx, setBIdx] = useState(0);
  const [bOdabrano, setBOdabrano] = useState([]);
  const [bRezultat, setBRezultat] = useState(null);

  // Korak 4 — situacije
  const [sIdx, setSIdx] = useState(0);
  const [sUnos, setSUnos] = useState("");
  const [sOcena, setSOcena] = useState(null);
  const [sBusy, setSBusy] = useState(false);

  // Korak 5 — diktat + razumevanje
  const [faza5, setFaza5] = useState("diktat");
  const [dUnos, setDUnos] = useState("");
  const [dRez, setDRez] = useState(null);
  const [rUnos, setRUnos] = useState("");
  const [rOcena, setROcena] = useState(null);
  const [rBusy, setRBusy] = useState(false);
  const [pasusPusten, setPasusPusten] = useState(false);

  // Korak 6 — izgovor
  const [iIdx, setIIdx] = useState(0);
  const [iSlusa, setISlusa] = useState(false);
  const [iRez, setIRez] = useState(null);
  const [iKucanje, setIKucanje] = useState(!imaSlusanje());
  const [iUnos, setIUnos] = useState("");

  // Korak 7 — mini-boss
  const [razgovor, setRazgovor] = useState([]);
  const [bossUnos, setBossUnos] = useState("");
  const [bossBusy, setBossBusy] = useState(false);
  const [bossRazmena, setBossRazmena] = useState(0);
  const BOSS_RAZMENA = 3;

  const [bezGlasa, setBezGlasa] = useState(false);

  useEffect(() => {
    let ziv = true;
    imaEngleskiGlas().then((ima) => ziv && setBezGlasa(!ima));
    return () => {
      ziv = false;
      prekini();
    };
  }, []);
  useEffect(() => {
    setGreska("");
  }, [korak]);

  function zapisi(tacno) {
    setBodovi((b) => ({ tacno: b.tacno + (tacno ? 1 : 0), ukupno: b.ukupno + 1 }));
  }

  function dodajRec(kw, kwSr) {
    const t = String(kw || "").trim();
    const m = String(kwSr || "").trim();
    if (!t || !m) return;
    if (noveReci.current.some((r) => r.term.toLowerCase() === t.toLowerCase())) return;
    noveReci.current.push({ term: t, meaning: m });
  }

  const tekuciKorak = KORACI[korak];
  const poslednji = korak === KORACI.length - 1;

  function dalje() {
    prekini();
    if (poslednji) return;
    setKorak(korak + 1);
  }

  // ——— Korak 1: pusti scenu red po red ————————————————————————
  async function pustiScenu() {
    setScenaRadi(true);
    for (const r of lekcija.scena.replike) {
      await izgovori(r.en, { brzina });
    }
    setScenaRadi(false);
    setScenaPustena(true);
  }

  // ——— Korak 3: blokovi ——————————————————————————————————————
  const blok = lekcija.blokovi[bIdx];
  const ploce = useMemo(() => {
    if (!blok) return [];
    const reciResenja = blok.resenje.replace(/[.,!?]/g, "").split(/\s+/);
    return promesaj([...reciResenja, ...(blok.mamci || [])], 11 + bIdx * 3);
  }, [blok, bIdx]);

  function proveriBlok() {
    const dato = bOdabrano.map((i) => ploce[i]).join(" ");
    const r = uporedi(blok.resenje, dato);
    const tacno = r.procenat === 100 && r.viska.length === 0;
    setBRezultat({ tacno, resenje: blok.resenje });
    zapisi(tacno);
  }

  function sledeciBlok() {
    setBRezultat(null);
    setBOdabrano([]);
    if (bIdx + 1 < lekcija.blokovi.length) setBIdx(bIdx + 1);
    else dalje();
  }

  // ——— Korak 4: situacija → rečenica ————————————————————————
  async function proveriSituaciju() {
    const odgovor = sUnos.trim();
    if (!odgovor || sBusy) return;
    setSBusy(true);
    setGreska("");
    try {
      const o = await callClaude("oceni", {
        lekcijaId: lekcija.id,
        vrsta: "situacija",
        indeks: sIdx,
        odgovor,
        level: nivo,
      });
      setSOcena(o);
      zapisi(o.ocena === "tacno");
      dodajRec(o.key_word, o.key_word_sr);
    } catch (e) {
      setGreska(e.message);
    }
    setSBusy(false);
  }

  function sledecaSituacija() {
    setSOcena(null);
    setSUnos("");
    if (sIdx + 1 < lekcija.situacije.length) setSIdx(sIdx + 1);
    else dalje();
  }

  // ——— Korak 5: diktat i razumevanje ————————————————————————
  function proveriDiktat() {
    const r = uporedi(lekcija.diktat.en, dUnos);
    setDRez(r);
    zapisi(r.prolaz);
  }

  async function proveriRazumevanje() {
    const odgovor = rUnos.trim();
    if (!odgovor || rBusy) return;
    setRBusy(true);
    setGreska("");
    try {
      const o = await callClaude("oceni", {
        lekcijaId: lekcija.id,
        vrsta: "razumevanje",
        indeks: 0,
        odgovor,
        level: nivo,
      });
      setROcena(o);
      zapisi(o.ocena === "tacno");
      dodajRec(o.key_word, o.key_word_sr);
    } catch (e) {
      setGreska(e.message);
    }
    setRBusy(false);
  }

  // ——— Korak 6: izgovor ——————————————————————————————————————
  const izgovorStavka = lekcija.izgovor[iIdx];

  async function slusajMe() {
    setISlusa(true);
    setGreska("");
    const r = await slusaj({ jezik: "en-US" });
    setISlusa(false);
    if (!r.ok) {
      setGreska(r.greska);
      if (r.fallback) setIKucanje(true);
      return;
    }
    const rez = uporedi(izgovorStavka.en, r.tekst, { blago: true });
    setIRez({ ...rez, cuo: r.tekst });
    zapisi(rez.prolaz);
  }

  function proveriKucanjem() {
    const rez = uporedi(izgovorStavka.en, iUnos, { blago: true });
    setIRez({ ...rez, cuo: iUnos });
    zapisi(rez.prolaz);
  }

  function sledeciIzgovor() {
    setIRez(null);
    setIUnos("");
    if (iIdx + 1 < lekcija.izgovor.length) setIIdx(iIdx + 1);
    else dalje();
  }

  // ——— Korak 7: mini-boss ————————————————————————————————————
  async function posaljiBossu() {
    const moje = bossUnos.trim();
    if (!moje || bossBusy) return;
    setBossBusy(true);
    setGreska("");
    const istorija = [
      { role: "assistant", content: lekcija.miniBoss.pocetna },
      ...razgovor.flatMap((r) => [
        { role: "user", content: r.moje },
        { role: "assistant", content: r.reply },
      ]),
      { role: "user", content: moje },
    ];
    setBossUnos("");
    try {
      const o = await callClaude("mini_boss", {
        lekcijaId: lekcija.id,
        level: nivo,
        messages: istorija,
      });
      setRazgovor([...razgovor, { moje, ...o }]);
      zapisi(o.ocena === "tacno");
      dodajRec(o.key_word, o.key_word_sr);
      setBossRazmena(bossRazmena + 1);
    } catch (e) {
      setGreska(e.message);
      setBossUnos(moje);
    }
    setBossBusy(false);
  }

  // ——— Korak 8: kraj —————————————————————————————————————————
  // Model ume da vrati celu recenicu kao "rec" ("Are you Mr. Novak?"). Isto
  // pravilo kao pri rucnom dodavanju presuduje i ovde, pa takve ne ulaze.
  function zaUpis() {
    const sve = [...(lekcija.kraj.reci || []), ...noveReci.current];
    const videno = new Set();
    const dobre = [];
    for (const r of sve) {
      const t = String(r.term || "").trim();
      const m = String(r.meaning || "").trim();
      if (!t || !m || reviewReason(t, m, null)) continue;
      if (videno.has(t.toLowerCase())) continue;
      videno.add(t.toLowerCase());
      dobre.push({ term: t, meaning: m });
      if (dobre.length >= MAX_RECI) break;
    }
    return dobre;
  }

  const zaRecnik = tekuciKorak.id === "kraj" ? zaUpis() : [];

  function zavrsi() {
    onZavrseno({
      lekcijaId: lekcija.id,
      tacno: bodovi.tacno,
      ukupno: bodovi.ukupno,
      reci: zaUpis(),
    });
  }

  const css = `
    .lk-top { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
    .lk-izlaz { border:0; background:transparent; color:var(--muted); cursor:pointer; font-size:14px;
                padding:4px 2px; font-family:inherit; }
    .lk-traka { flex:1; height:4px; background:var(--line); border-radius:999px; overflow:hidden; }
    .lk-traka i { display:block; height:100%; background:var(--accent); transition:width .3s; }
    .lk-korak { font-size:12.5px; color:var(--muted); white-space:nowrap; }
    .lk-naslov { font-family:Georgia,serif; font-size:19px; margin:0 0 4px; }
    .lk-uvod { color:var(--muted); font-size:14px; line-height:1.6; margin:0 0 14px; }
    .lk-brzine { display:flex; gap:8px; margin:10px 0 0; }
    .lk-brzine button { border:1px solid var(--line); background:var(--paper); color:var(--muted);
      border-radius:999px; padding:5px 12px; font-size:12.5px; cursor:pointer; font-family:inherit; }
    .lk-brzine button.on { border-color:var(--accent); color:var(--accent); }
    .lk-replika { padding:9px 0; border-bottom:1px solid var(--line); font-size:15px; line-height:1.55; }
    .lk-replika:last-child { border-bottom:0; }
    .lk-ko { font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.4px; }
    .lk-sr { font-size:13px; color:var(--muted); margin-top:3px; }
    .lk-pravilo { font-size:15.5px; line-height:1.7; }
    .lk-primer { display:flex; justify-content:space-between; align-items:center; gap:10px;
                 padding:10px 0; border-bottom:1px solid var(--line); }
    .lk-primer:last-child { border-bottom:0; }
    .lk-ploce { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
    .lk-ploca { border:1px solid var(--line); background:var(--paper); border-radius:8px;
      padding:9px 13px; font-size:15px; cursor:pointer; font-family:inherit; color:var(--ink); }
    .lk-ploca:disabled { opacity:.3; }
    .lk-linija { min-height:48px; border:1px dashed var(--line); border-radius:8px; padding:10px;
      display:flex; flex-wrap:wrap; gap:8px; align-items:center; background:var(--bg); }
    .lk-prazno { color:var(--muted); font-size:13.5px; }
    .lk-reci { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; font-size:15px; }
    .lk-rec { padding:2px 7px; border-radius:6px; }
    .lk-tacno { background:var(--oksoft); color:var(--ok); }
    .lk-blizu { background:var(--soft); color:var(--accent); }
    .lk-falila { background:var(--warnsoft); color:var(--warn); text-decoration:line-through; }
    .lk-viska { background:var(--line); color:var(--muted); font-style:italic; }
    .lk-rec i { font-style:normal; opacity:.7; font-size:12.5px; }
    .lk-ishod { padding:11px 13px; border-radius:8px; font-size:14px; line-height:1.6; margin:12px 0; }
    .lk-dobro { background:var(--oksoft); color:var(--ok); }
    .lk-skoro { background:var(--soft); color:var(--accent); }
    .lk-lose { background:var(--warnsoft); color:var(--warn); }
    .lk-ishod b { display:block; margin-bottom:3px; }
    .lk-red { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:12px; }
    .lk-moze { padding:11px 0; border-bottom:1px solid var(--line); }
    .lk-moze:last-child { border-bottom:0; }
    .lk-moze b { font-weight:500; font-size:16px; }
  `;

  const procenat = Math.round(((korak + 1) / KORACI.length) * 100);

  return (
    <div className="jt-card">
      <style>{css}</style>

      <div className="lk-top">
        <button className="lk-izlaz" onClick={() => { prekini(); onIzlaz(); }}>
          ← Izađi
        </button>
        <div className="lk-traka">
          <i style={{ width: `${procenat}%` }} />
        </div>
        <span className="lk-korak">
          {korak + 1}/{KORACI.length}
        </span>
      </div>

      <h2 className="lk-naslov">{tekuciKorak.naslov}</h2>

      {bezGlasa && (
        <div className="jt-err">
          Telefon nema engleski glas, pa zvuk neće raditi. Dodaj ga u Podešavanja → Pristupačnost →
          Text-to-speech → jezik engleski. Lekcija radi i bez zvuka, ali koraci sa slušanjem nemaju smisla.
        </div>
      )}

      {greska && (
        <div className="jt-err">
          {greska}
          {tekuciKorak.api && (
            <>
              {" "}
              <button className="lk-izlaz" style={{ color: "inherit", textDecoration: "underline" }} onClick={dalje}>
                Preskoči ovaj korak
              </button>
            </>
          )}
        </div>
      )}

      {/* ——— 0 Zagrevanje ——— */}
      {tekuciKorak.id === "zagrevanje" && (
        <div>
          {zagrevanje.length === 0 ? (
            <div>
              <p className="lk-uvod">
                Rečnik je još prazan, pa nema šta da se ponovi. Ovaj korak će raditi od druge lekcije,
                kad se u rečniku skupe reči.
              </p>
              <button className="jt-btn" onClick={dalje}>Počni lekciju</button>
            </div>
          ) : (
            <div>
              <p className="lk-uvod">
                Tri reči koje već znaš, za početak. Kartica {zIdx + 1} od {zagrevanje.length}.
              </p>
              <div style={{ textAlign: "center", padding: "22px 0" }}>
                <div style={{ fontSize: 22, fontFamily: "Georgia, serif" }}>
                  {zOkrenuto ? zagrevanje[zIdx].term : zagrevanje[zIdx].meaning}
                </div>
                {zOkrenuto && (
                  <div style={{ marginTop: 10 }}>
                    <Zvucnik tekst={zagrevanje[zIdx].term} brzina={brzina} />
                  </div>
                )}
              </div>
              {!zOkrenuto ? (
                <button className="jt-btn" onClick={() => setZOkrenuto(true)}>Okreni</button>
              ) : (
                <button
                  className="jt-btn"
                  onClick={() => {
                    setZOkrenuto(false);
                    if (zIdx + 1 < zagrevanje.length) setZIdx(zIdx + 1);
                    else dalje();
                  }}
                >
                  {zIdx + 1 < zagrevanje.length ? "Dalje" : "Počni lekciju"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ——— 1 Scena ——— */}
      {tekuciKorak.id === "scena" && (
        <div>
          <p className="lk-uvod">{lekcija.scena.uvod}</p>
          <div className="lk-red">
            <button className="jt-btn" onClick={pustiScenu} disabled={scenaRadi}>
              {scenaRadi ? "Ide…" : scenaPustena ? "Pusti ponovo" : "Pusti scenu"}
            </button>
            {scenaPustena && !scenaVidljiva && (
              <button className="jt-btn ghost" onClick={() => setScenaVidljiva(true)}>
                Pokaži tekst
              </button>
            )}
          </div>
          <div className="lk-brzine">
            {BRZINE.map((b) => (
              <button
                key={b.vrednost}
                className={brzina === b.vrednost ? "on" : ""}
                onClick={() => setBrzina(b.vrednost)}
              >
                {b.oznaka}
              </button>
            ))}
          </div>

          {scenaVidljiva && (
            <div style={{ marginTop: 16 }}>
              {lekcija.scena.replike.map((r, i) => (
                <div className="lk-replika" key={i}>
                  <div className="lk-ko">{r.ko}</div>
                  <div>{r.en}</div>
                  <div className="lk-sr">{r.sr}</div>
                </div>
              ))}
            </div>
          )}

          {scenaPustena && (
            <div className="lk-red">
              <button className="jt-btn" onClick={dalje}>Dalje</button>
            </div>
          )}
        </div>
      )}

      {/* ——— 2 Pravilo ——— */}
      {tekuciKorak.id === "pravilo" && (
        <div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 17, marginBottom: 8 }}>
            {lekcija.pravilo.naslov}
          </div>
          <p className="lk-pravilo">{lekcija.pravilo.tekst}</p>
          <div style={{ marginTop: 14 }}>
            {lekcija.pravilo.primeri.map((p, i) => (
              <div className="lk-primer" key={i}>
                <div>
                  <div style={{ fontSize: 15.5 }}>{p.en}</div>
                  <div className="lk-sr">{p.sr}</div>
                </div>
                <Zvucnik tekst={p.en} brzina={brzina} label="" />
              </div>
            ))}
          </div>
          <div className="lk-red">
            <button className="jt-btn" onClick={dalje}>Razumem, dalje</button>
          </div>
        </div>
      )}

      {/* ——— 3 Blokovi ——— */}
      {tekuciKorak.id === "blokovi" && blok && (
        <div>
          <p className="lk-uvod">
            {blok.trazi} <span className="jt-stat">({bIdx + 1}/{lekcija.blokovi.length})</span>
          </p>

          <div className="lk-linija">
            {bOdabrano.length === 0 ? (
              <span className="lk-prazno">Dodiruj reči ispod da sklopiš rečenicu.</span>
            ) : (
              bOdabrano.map((idx, poz) => (
                <button
                  key={`${idx}-${poz}`}
                  className="lk-ploca"
                  disabled={!!bRezultat}
                  onClick={() => setBOdabrano(bOdabrano.filter((_, j) => j !== poz))}
                >
                  {ploce[idx]}
                </button>
              ))
            )}
          </div>

          {!bRezultat && (
            <div className="lk-ploce">
              {ploce.map((w, i) => (
                <button
                  key={`${w}-${i}`}
                  className="lk-ploca"
                  disabled={bOdabrano.includes(i)}
                  onClick={() => setBOdabrano([...bOdabrano, i])}
                >
                  {w}
                </button>
              ))}
            </div>
          )}

          {bRezultat ? (
            <>
              <div className={`lk-ishod ${bRezultat.tacno ? "lk-dobro" : "lk-lose"}`}>
                <b>{bRezultat.tacno ? "Tačno." : "Nije to."}</b>
                {bRezultat.resenje}
              </div>
              <div className="lk-red">
                <Zvucnik tekst={bRezultat.resenje} brzina={brzina} />
                <button className="jt-btn" onClick={sledeciBlok}>
                  {bIdx + 1 < lekcija.blokovi.length ? "Dalje" : "Dalji korak"}
                </button>
              </div>
            </>
          ) : (
            <div className="lk-red">
              <button className="jt-btn" onClick={proveriBlok} disabled={bOdabrano.length === 0}>
                Proveri
              </button>
              {bOdabrano.length > 0 && (
                <button className="jt-btn ghost small" onClick={() => setBOdabrano([])}>
                  Očisti
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ——— 4 Situacija → rečenica ——— */}
      {tekuciKorak.id === "situacije" && (
        <div>
          <p className="lk-uvod">
            Nema srpske rečenice za prevod — ima situacija. Sklopi odgovor sam, na engleskom.
            <span className="jt-stat"> ({sIdx + 1}/{lekcija.situacije.length})</span>
          </p>
          <div style={{ fontSize: 16, lineHeight: 1.65, marginBottom: 12 }}>
            {lekcija.situacije[sIdx].opis}
          </div>

          {!sOcena ? (
            <>
              <input
                type="text"
                placeholder="Šta kažeš, na engleskom"
                value={sUnos}
                maxLength={300}
                onChange={(e) => setSUnos(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && proveriSituaciju()}
              />
              <div className="lk-red">
                <button className="jt-btn" onClick={proveriSituaciju} disabled={sBusy || !sUnos.trim()}>
                  {sBusy ? "Gledam…" : "Pošalji"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, padding: "8px 0" }}>
                <span className="jt-stat">Ti: </span>
                {sUnos}
              </div>
              <div
                className={`lk-ishod ${
                  sOcena.ocena === "tacno" ? "lk-dobro" : sOcena.ocena === "blizu" ? "lk-skoro" : "lk-lose"
                }`}
              >
                <b>
                  {sOcena.ocena === "tacno" ? "Tačno." : sOcena.ocena === "blizu" ? "Blizu." : "Nije to."}
                </b>
                {sOcena.sta_nije}
              </div>
              {sOcena.prirodnije && (
                <div className="lk-primer">
                  <div>
                    <div className="jt-stat">Prirodnije</div>
                    <div style={{ fontSize: 15.5 }}>{sOcena.prirodnije}</div>
                  </div>
                  <Zvucnik tekst={sOcena.prirodnije} brzina={brzina} label="" />
                </div>
              )}
              <div className="lk-red">
                <button className="jt-btn" onClick={sledecaSituacija}>
                  {sIdx + 1 < lekcija.situacije.length ? "Dalje" : "Dalji korak"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ——— 5 Slušaj i razumi ——— */}
      {tekuciKorak.id === "slusanje" && (
        <div>
          {faza5 === "diktat" ? (
            <>
              <p className="lk-uvod">Pusti i ukucaj šta si čuo. Tekst se ne vidi.</p>
              <div className="lk-red">
                <Zvucnik tekst={lekcija.diktat.en} brzina={brzina} label="Pusti" />
              </div>
              <div className="lk-brzine">
                {BRZINE.map((b) => (
                  <button
                    key={b.vrednost}
                    className={brzina === b.vrednost ? "on" : ""}
                    onClick={() => setBrzina(b.vrednost)}
                  >
                    {b.oznaka}
                  </button>
                ))}
              </div>

              {!dRez ? (
                <div style={{ marginTop: 14 }}>
                  <input
                    type="text"
                    placeholder="Šta je rečeno"
                    value={dUnos}
                    maxLength={300}
                    onChange={(e) => setDUnos(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && dUnos.trim() && proveriDiktat()}
                  />
                  <div className="lk-red">
                    <button className="jt-btn" onClick={proveriDiktat} disabled={!dUnos.trim()}>
                      Proveri
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 14 }}>
                  <div className={`lk-ishod ${dRez.prolaz ? "lk-dobro" : "lk-lose"}`}>
                    <b>
                      {dRez.tacno} od {dRez.ukupno} reči
                      {dRez.prolaz ? " — prošlo" : ""}
                    </b>
                    {staFali(dRez) || "Sve tačno."}
                  </div>
                  <Reci rezultat={dRez} />
                  <div style={{ fontSize: 15, marginTop: 8 }}>{lekcija.diktat.en}</div>
                  <div className="lk-sr">{lekcija.diktat.sr}</div>
                  <div className="lk-red">
                    <button className="jt-btn" onClick={() => setFaza5("razumevanje")}>
                      Dalje
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="lk-uvod">
                Gost priča za stolom. Slušaj, pa odgovori na pitanje. Tekst se ne vidi.
              </p>
              <div className="lk-red">
                <button
                  className="jt-btn"
                  onClick={async () => {
                    await izgovori(lekcija.razumevanje.pasus, { brzina });
                    setPasusPusten(true);
                  }}
                >
                  {pasusPusten ? "Pusti ponovo" : "Pusti"}
                </button>
              </div>

              {pasusPusten && !rOcena && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 16, marginBottom: 10 }}>{lekcija.razumevanje.pitanje}</div>
                  <input
                    type="text"
                    placeholder="Odgovori na srpskom"
                    value={rUnos}
                    maxLength={300}
                    onChange={(e) => setRUnos(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && proveriRazumevanje()}
                  />
                  <div className="lk-red">
                    <button className="jt-btn" onClick={proveriRazumevanje} disabled={rBusy || !rUnos.trim()}>
                      {rBusy ? "Gledam…" : "Pošalji"}
                    </button>
                  </div>
                </div>
              )}

              {rOcena && (
                <div style={{ marginTop: 14 }}>
                  <div
                    className={`lk-ishod ${
                      rOcena.ocena === "tacno" ? "lk-dobro" : rOcena.ocena === "blizu" ? "lk-skoro" : "lk-lose"
                    }`}
                  >
                    <b>
                      {rOcena.ocena === "tacno" ? "Tačno." : rOcena.ocena === "blizu" ? "Blizu." : "Nije to."}
                    </b>
                    {rOcena.sta_nije}
                  </div>
                  <div style={{ fontSize: 15 }}>{lekcija.razumevanje.pasus}</div>
                  <div className="lk-red">
                    <button className="jt-btn" onClick={dalje}>Dalje</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ——— 6 Izgovori ——— */}
      {tekuciKorak.id === "izgovor" && izgovorStavka && (
        <div>
          <p className="lk-uvod">
            Slušaj, pa izgovori isto naglas.
            <span className="jt-stat"> ({iIdx + 1}/{lekcija.izgovor.length})</span>
          </p>
          <div style={{ fontSize: 18, fontFamily: "Georgia, serif", marginBottom: 4 }}>
            {izgovorStavka.en}
          </div>
          <div className="lk-sr">{izgovorStavka.sr}</div>

          <div className="lk-red">
            <Zvucnik tekst={izgovorStavka.en} brzina={brzina} />
            {!iRez && !iKucanje && (
              <button className="jt-btn" onClick={slusajMe} disabled={iSlusa}>
                {iSlusa ? "Slušam…" : "🎤 Izgovori"}
              </button>
            )}
            {!iRez && !iKucanje && (
              <button className="jt-btn ghost small" onClick={() => setIKucanje(true)}>
                Ukucaj umesto toga
              </button>
            )}
          </div>

          {!iRez && iKucanje && (
            <div style={{ marginTop: 12 }}>
              <input
                type="text"
                placeholder="Ukucaj rečenicu"
                value={iUnos}
                maxLength={300}
                onChange={(e) => setIUnos(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && iUnos.trim() && proveriKucanjem()}
              />
              <div className="lk-red">
                <button className="jt-btn" onClick={proveriKucanjem} disabled={!iUnos.trim()}>
                  Proveri
                </button>
                {imaSlusanje() && (
                  <button className="jt-btn ghost small" onClick={() => setIKucanje(false)}>
                    Ipak glasom
                  </button>
                )}
              </div>
            </div>
          )}

          {iRez && (
            <div style={{ marginTop: 14 }}>
              <div className={`lk-ishod ${iRez.prolaz ? "lk-dobro" : "lk-lose"}`}>
                <b>
                  {iRez.tacno} od {iRez.ukupno} reči
                  {iRez.prolaz ? " — prošlo" : ""}
                </b>
                {staFali(iRez) || "Sve tačno."}
              </div>
              <div className="jt-stat">Čuo sam: {iRez.cuo}</div>
              <Reci rezultat={iRez} />
              <div className="lk-red">
                <button className="jt-btn" onClick={sledeciIzgovor}>
                  {iIdx + 1 < lekcija.izgovor.length ? "Dalje" : "Dalji korak"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ——— 7 Mini-boss ——— */}
      {tekuciKorak.id === "boss" && (
        <div>
          <p className="lk-uvod">
            {lekcija.miniBoss.situacija}
            <span className="jt-stat"> ({Math.min(bossRazmena, BOSS_RAZMENA)}/{BOSS_RAZMENA})</span>
          </p>

          <div className="lk-replika">
            <div className="lk-ko">Gost</div>
            <div>{lekcija.miniBoss.pocetna}</div>
            <div className="lk-red">
              <Zvucnik tekst={lekcija.miniBoss.pocetna} brzina={brzina} label="" />
            </div>
          </div>

          {razgovor.map((r, i) => (
            <div key={i}>
              <div className="lk-replika">
                <div className="lk-ko">Ti</div>
                <div>{r.moje}</div>
              </div>
              {(r.sta_nije || r.prirodnije) && (
                <div
                  className={`lk-ishod ${
                    r.ocena === "tacno" ? "lk-dobro" : r.ocena === "blizu" ? "lk-skoro" : "lk-lose"
                  }`}
                >
                  <b>{r.ocena === "tacno" ? "Tačno." : r.ocena === "blizu" ? "Blizu." : "Nije to."}</b>
                  {r.sta_nije}
                  {r.prirodnije && <div style={{ marginTop: 5 }}>Prirodnije: {r.prirodnije}</div>}
                </div>
              )}
              <div className="lk-replika">
                <div className="lk-ko">Gost</div>
                <div>{r.reply}</div>
                <div className="lk-sr">{r.reply_sr}</div>
                <div className="lk-red">
                  <Zvucnik tekst={r.reply} brzina={brzina} label="" />
                </div>
              </div>
            </div>
          ))}

          {bossRazmena < BOSS_RAZMENA ? (
            <div style={{ marginTop: 12 }}>
              <input
                type="text"
                placeholder="Šta odgovaraš"
                value={bossUnos}
                maxLength={500}
                onChange={(e) => setBossUnos(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && posaljiBossu()}
              />
              <div className="lk-red">
                <button className="jt-btn" onClick={posaljiBossu} disabled={bossBusy || !bossUnos.trim()}>
                  {bossBusy ? "Gost misli…" : "Pošalji"}
                </button>
              </div>
            </div>
          ) : (
            <div className="lk-red">
              <button className="jt-btn" onClick={dalje}>Izdržao si. Dalje</button>
            </div>
          )}
        </div>
      )}

      {/* ——— 8 Kartica kraja ——— */}
      {tekuciKorak.id === "kraj" && (
        <div>
          <p className="lk-uvod">
            {bodovi.ukupno > 0
              ? `Tačno ${bodovi.tacno} od ${bodovi.ukupno} zadataka.`
              : "Lekcija je prošla."}
          </p>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 17, margin: "4px 0 8px" }}>
            Danas možeš da kažeš
          </div>
          <div>
            {lekcija.kraj.mozes.map((m, i) => (
              <div className="lk-moze" key={i}>
                <div className="lk-primer" style={{ border: 0, padding: 0 }}>
                  <div>
                    <b>{m.en}</b>
                    <div className="lk-sr">{m.sr}</div>
                  </div>
                  <Zvucnik tekst={m.en} brzina={brzina} label="" />
                </div>
              </div>
            ))}
          </div>

          <div className="lk-ishod lk-skoro" style={{ marginTop: 14 }}>
            <b>{zaRecnik.length} novih reči ide u Rečnik</b>
            {zaRecnik.map((r) => r.term).join(" · ")}
          </div>

          <div className="lk-red">
            <button className="jt-btn" onClick={zavrsi}>Završi lekciju</button>
          </div>
        </div>
      )}
    </div>
  );
}
