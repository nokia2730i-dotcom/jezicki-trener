// Sadrzaj lekcija. Isti fajl cita i klijent (da prikaze scenu, pravilo,
// blokove) i ruta (da sastavi prompt za ocenu i mini-boss).
//
// VAZNO: klijent nikad ne SALJE tekst promptu. Posalje id lekcije i indeks
// zadatka, a ruta sama izvuce situaciju i model odgovor odavde. Inace bi
// zastita iz koraka (a) bila vracena unazad — klijent bi opet mogao da pise
// u system prompt.

import m01l1 from "../../content/lekcije/m01l1.json";

const SVE = [m01l1];

export const LEKCIJE_SADRZAJ = Object.fromEntries(SVE.map((l) => [l.id, l]));

export function sadrzajLekcije(id) {
  return Object.prototype.hasOwnProperty.call(LEKCIJE_SADRZAJ, id)
    ? LEKCIJE_SADRZAJ[id]
    : null;
}

export function imaSadrzaj(id) {
  return sadrzajLekcije(id) !== null;
}
