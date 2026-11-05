// Cista logika recnika, bez Reacta — da moze da se testira.
//
// Stari oblik kartice bio je {id, lang, src, dst} gde je `src` znacenje na
// srpskom a `dst` rec na ciljnom jeziku. Bug u treningu je u ta polja upisivao
// cele recenice, a za "gist" zadatke i okretao strane. NISTA se ne brise —
// sumnjive kartice se obelezavaju i korisnik ih pregleda.

// Kartica je JEDNA rec ili kratka fraza — isto ogranicenje koje sema
// nalaze modelu (najvise 5 reci). Granica po znakovima nije dovoljna:
// "I think we're gonna stay for three nights." ima samo 42 znaka.
export const MAX_TERM = 60;
export const MAX_TERM_WORDS = 5;

const SERBIAN_CHARS = /[šđčćžŠĐČĆŽ]/;

function wordCount(s) {
  return String(s).trim().split(/\s+/).filter(Boolean).length;
}

// Jedno pravilo za oba smera: i za ocenu starih kartica pri migraciji,
// i za odbijanje novih pri cuvanju.
export function reviewReason(term, meaning, lang) {
  if (lang && lang !== "en") return "drugi jezik";
  if (!String(term).trim() || !String(meaning).trim()) return "nedostaje polje";
  if (SERBIAN_CHARS.test(term)) return "obrnute strane";
  // Kartica nije ni recenica ni pitanje. Ovo lovi "Are you Mr. Novak?" —
  // 4 reci, bez tacke, ali ocigledno nije rec koja se uci napamet.
  if (
    wordCount(term) > MAX_TERM_WORDS ||
    /[.?!]\s*$/.test(String(term).trim()) ||
    /[?!]/.test(String(term)) ||
    String(term).length > MAX_TERM
  ) {
    return "cela rečenica";
  }
  return null;
}

export function migrateVocab(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];

  for (const e of raw) {
    if (!e || typeof e !== "object") continue;

    // Nov oblik — prolazi netaknut.
    if (typeof e.term === "string") {
      out.push(e);
      continue;
    }

    const term = typeof e.dst === "string" ? e.dst : "";
    const meaning = typeof e.src === "string" ? e.src : "";
    if (!term && !meaning) continue;

    const reason = reviewReason(term, meaning, e.lang);
    out.push({
      id: e.id ?? Date.now() + Math.random(),
      term,
      meaning,
      seen: Number(e.seen) || 0,
      known: Number(e.known) || 0,
      added: e.added || new Date().toISOString().slice(0, 10),
      ...(reason ? { needsReview: reason } : {}),
    });
  }

  return out;
}
