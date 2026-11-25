// Legge la base Airtable "CSI Future Football Cup" e scrive data.json
// con i SOLI dati pubblici (niente telefoni, email o date di nascita).
// Richiede la variabile d'ambiente AIRTABLE_TOKEN (token in sola lettura).
import { writeFile } from "node:fs/promises";

const BASE = "appDBBWUoS4zVmVT2";
const T = {
  competizioni: "tblEs23RRKDytzfLg",
  squadre: "tbllCxHVcZIR5BJF4",
  partite: "tblzjbYueJ4szk7QC",
  campi: "tbl4B4P3zlqyZXCm8",
  tesserati: "tblpPCQD3nO3ZRIBO",
};
// Come mostrare i marcatori (sono minorenni): "iniziale" = "Rossi M.", "completo" = "Rossi Mario"
const MARCATORI_FORMATO = process.env.MARCATORI_FORMATO || "iniziale";

const token = process.env.AIRTABLE_TOKEN;
if (!token) {
  console.log("AIRTABLE_TOKEN mancante: lascio data.json com'è.");
  process.exit(0);
}

async function all(table) {
  const out = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${table}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
    const j = await r.json();
    out.push(...j.records);
    offset = j.offset;
  } while (offset);
  return out;
}

const [comp, sq, pa, ca, te] = await Promise.all(
  [T.competizioni, T.squadre, T.partite, T.campi, T.tesserati].map(all)
);

const first = (a) => (Array.isArray(a) && a.length ? a[0] : null);
const num = (v) => (typeof v === "number" ? v : 0);

const competizioni = comp
  .filter((r) => r.fields["Pubblica sul portale"])
  .map((r) => ({
    id: r.id,
    nome: r.fields["Nome"] || "",
    categoria: r.fields["Categoria"] || "",
    disciplina: r.fields["Disciplina"] || "",
    girone: r.fields["Girone"] || "",
    formula: r.fields["Formula"] || "",
    stagione: r.fields["Stagione"] || "",
  }));
const compIds = new Set(competizioni.map((c) => c.id));

const campi = Object.fromEntries(
  ca.map((r) => [r.id, { nome: r.fields["Nome campo"] || "", indirizzo: r.fields["Indirizzo"] || "", maps: r.fields["Link Maps"] || "" }])
);

const squadre = sq
  .filter((r) => (r.fields["Competizione"] || []).some((id) => compIds.has(id)))
  .map((r) => ({
    id: r.id,
    nome: r.fields["Nome squadra"] || "",
    societa: r.fields["Società"] || "",
    competizioni: (r.fields["Competizione"] || []).filter((id) => compIds.has(id)),
    logo: first(r.fields["Logo"])?.thumbnails?.small?.url || null,
    G: num(r.fields["G"]), V: num(r.fields["V"]), N: num(r.fields["N"]), P: num(r.fields["P"]),
    GF: num(r.fields["GF"]), GS: num(r.fields["GS"]), DR: num(r.fields["DR"]),
    punti: num(r.fields["Punti"]), penalizzazione: num(r.fields["Penalizzazione punti"]),
  }));
const squadraIds = new Set(squadre.map((s) => s.id));

const partite = pa
  .filter((r) => compIds.has(first(r.fields["Competizione"])))
  .map((r) => {
    const f = r.fields;
    const stato = f["Stato"] || "Da giocare";
    const ufficiale = stato === "Omologata" || stato === "A tavolino";
    return {
      id: r.id,
      competizione: first(f["Competizione"]),
      giornata: f["Giornata"] ?? null,
      fase: f["Fase"] || "",
      data: f["Data e ora"] || null,
      casa: first(f["Casa"]),
      ospite: first(f["Ospite"]),
      campo: campi[first(f["Campo"])] || null,
      stato,
      golCasa: ufficiale ? f["Gol casa"] ?? null : null,
      golOspite: ufficiale ? f["Gol ospite"] ?? null : null,
    };
  });

function nomePubblico(f) {
  const cognome = (f["Cognome"] || "").trim();
  const nome = (f["Nome"] || "").trim();
  if (!cognome && !nome) return f["Nome completo"] || "";
  if (MARCATORI_FORMATO === "completo") return `${cognome} ${nome}`.trim();
  return `${cognome} ${nome ? nome[0] + "." : ""}`.trim();
}
const marcatori = te
  .filter((r) => num(r.fields["Gol"]) > 0 && squadraIds.has(first(r.fields["Squadra"])))
  .map((r) => ({ nome: nomePubblico(r.fields), squadra: first(r.fields["Squadra"]), gol: num(r.fields["Gol"]) }))
  .sort((a, b) => b.gol - a.gol || a.nome.localeCompare(b.nome));

await writeFile(
  "data.json",
  JSON.stringify({ aggiornato: new Date().toISOString(), competizioni, squadre, partite, marcatori }, null, 1)
);
console.log(`OK: ${competizioni.length} competizioni, ${squadre.length} squadre, ${partite.length} partite, ${marcatori.length} marcatori`);
