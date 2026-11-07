// Sadrzaj lekcija. Isti fajl cita i klijent (da prikaze scenu, pravilo,
// blokove) i ruta (da sastavi prompt za ocenu i mini-boss).
//
// VAZNO: klijent nikad ne SALJE tekst promptu. Posalje id lekcije i indeks
// zadatka, a ruta sama izvuce situaciju i model odgovor odavde. Inace bi
// zastita iz koraka (a) bila vracena unazad — klijent bi opet mogao da pise
// u system prompt.

import m00l1 from "../../content/lekcije/m00l1.json";
import m00l2 from "../../content/lekcije/m00l2.json";
import m00l3 from "../../content/lekcije/m00l3.json";
import m00l4 from "../../content/lekcije/m00l4.json";
import m00l5 from "../../content/lekcije/m00l5.json";
import m00l6 from "../../content/lekcije/m00l6.json";
import m01l1 from "../../content/lekcije/m01l1.json";

const SVE = [m00l1, m00l2, m00l3, m00l4, m00l5, m00l6, m01l1];

export const LEKCIJE_SADRZAJ = Object.fromEntries(SVE.map((l) => [l.id, l]));

export function sadrzajLekcije(id) {
  return Object.prototype.hasOwnProperty.call(LEKCIJE_SADRZAJ, id)
    ? LEKCIJE_SADRZAJ[id]
    : null;
}

export function imaSadrzaj(id) {
  return sadrzajLekcije(id) !== null;
}
