// Mapa puta do B1. Sadrzaj je u content/modules/*.json — taj JSON je izvor
// istine i menja se rucno, bez diranja koda.
//
// Uvozi se staticki, fajl po fajl, da webpack sve to ubaci u bundle i da se
// ne lomi na dinamickom import-u na Vercelu.

import m00 from "../../content/modules/m00.json";
import m01 from "../../content/modules/m01.json";
import m02 from "../../content/modules/m02.json";
import m03 from "../../content/modules/m03.json";
import m04 from "../../content/modules/m04.json";
import m05 from "../../content/modules/m05.json";
import m06 from "../../content/modules/m06.json";
import m07 from "../../content/modules/m07.json";
import m08 from "../../content/modules/m08.json";
import m09 from "../../content/modules/m09.json";
import m10 from "../../content/modules/m10.json";
import m11 from "../../content/modules/m11.json";
import m12 from "../../content/modules/m12.json";
import m13 from "../../content/modules/m13.json";
import m14 from "../../content/modules/m14.json";
import m15 from "../../content/modules/m15.json";

export const MODULI = [
  m00, m01, m02, m03, m04, m05, m06, m07,
  m08, m09, m10, m11, m12, m13, m14, m15,
].sort((a, b) => a.redni - b.redni);

export const ETAPE = [
  { etapa: 1, nivo: "A1", naslov: "Snađem se", opis: "Zvuk, to be, prezent, porudžbina i hotel." },
  { etapa: 2, nivo: "A2", naslov: "Vodim razgovor", opis: "Prošlost, budućnost, ljubaznost i small talk." },
  { etapa: 3, nivo: "B1", naslov: "Pričam svoju priču", opis: "Iskustvo, duže rečenice, žalbe i prirodan govor." },
];

// Sve lekcije u jednom nizu, u redu u kom se rade.
export const LEKCIJE = MODULI.flatMap((m) =>
  m.lekcije.map((l) => ({ ...l, modulId: m.id, modulNaslov: m.naslov, nivo: m.nivo }))
);

export const UKUPNO_LEKCIJA = LEKCIJE.length;

export function nadjiModul(id) {
  return MODULI.find((m) => m.id === id) || null;
}

export function nadjiLekciju(id) {
  return LEKCIJE.find((l) => l.id === id) || null;
}

export function moduliEtape(etapa) {
  return MODULI.filter((m) => m.etapa === etapa);
}

// Prva lekcija koja nije zavrsena. `zavrsene` je niz id-eva lekcija.
// Kad je sve zavrseno vraca null.
export function sledecaLekcija(zavrsene) {
  const set = new Set(Array.isArray(zavrsene) ? zavrsene : []);
  return LEKCIJE.find((l) => !set.has(l.id)) || null;
}

export function napredak(zavrsene) {
  const set = new Set(Array.isArray(zavrsene) ? zavrsene : []);
  const zavrseno = LEKCIJE.filter((l) => set.has(l.id)).length;
  return {
    zavrseno,
    ukupno: UKUPNO_LEKCIJA,
    procenat: UKUPNO_LEKCIJA ? Math.round((zavrseno / UKUPNO_LEKCIJA) * 100) : 0,
  };
}
