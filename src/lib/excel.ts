import * as XLSX from "xlsx";
import type {
  DuplicateStrategy,
  ImportPreview,
  ImportRowResult,
  ImportSummary,
  ImportUserRow,
  User,
} from "@/types";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 2000;

const columnAliases: Record<string, keyof ImportUserRow> = {
  numero_tessera: "cardNumber",
  numero_tessera_: "cardNumber",
  numero_tesserautente: "cardNumber",
  numero: "cardNumber",
  tessera: "cardNumber",
  n_tessera: "cardNumber",
  cardnumber: "cardNumber",
  nome: "firstName",
  firstname: "firstName",
  cognome: "lastName",
  lastname: "lastName",
  telefono: "phone",
  cellulare: "phone",
  phone: "phone",
  attivo: "active",
  stato: "active",
  active: "active",
  note: "notes",
  notes: "notes",
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function parseActive(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!normalized) return true;
  if (["si", "true", "1", "attivo"].includes(normalized)) return true;
  if (["no", "false", "0", "non attivo", "non_attivo"].includes(normalized)) {
    return false;
  }
  return true;
}

export async function parseImportFile(
  file: File,
  existingUsers: User[],
): Promise<ImportPreview> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    throw new Error("Formato non valido. Seleziona un file .xlsx, .xls o .csv.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Il file supera la dimensione massima di 5 MB.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellFormula: false,
    cellText: true,
    cellDates: false,
    raw: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Il file non contiene fogli leggibili.");

  const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
  });
  const [headerRow, ...dataRows] = rows;
  if (!headerRow || headerRow.length === 0) {
    throw new Error("Il file non contiene intestazioni.");
  }
  if (dataRows.length > MAX_ROWS) {
    throw new Error("Il file contiene più di 2.000 righe.");
  }

  const mappedHeaders = headerRow.map((header) => {
    const normalized = normalizeHeader(header);
    return columnAliases[normalized];
  });

  const seenInFile = new Map<string, number>();
  const existingCards = new Set(existingUsers.map((user) => user.cardNumber));
  const parsedRows: ImportRowResult[] = dataRows.map((row, index) => {
    const original: Record<string, string> = {};
    const next: ImportUserRow = {
      cardNumber: "",
      firstName: "",
      lastName: "",
      phone: "",
      active: true,
      notes: "",
    };

    mappedHeaders.forEach((key, columnIndex) => {
      const label = asText(headerRow[columnIndex]) || `Colonna ${columnIndex + 1}`;
      const value = asText(row[columnIndex]);
      original[label] = value;
      if (!key) return;
      if (key === "active") next.active = parseActive(value);
      else next[key] = value;
    });

    const errors: string[] = [];
    if (!next.cardNumber) errors.push("numero tessera mancante");
    if (!next.firstName) errors.push("nome mancante");
    if (!next.lastName) errors.push("cognome mancante");

    const previousCount = seenInFile.get(next.cardNumber) ?? 0;
    if (next.cardNumber) seenInFile.set(next.cardNumber, previousCount + 1);

    return {
      rowNumber: index + 2,
      original,
      user: next,
      errors,
      duplicateInFile: false,
      duplicateExisting: existingCards.has(next.cardNumber),
    };
  });

  const duplicateCardNumbers = Array.from(seenInFile.entries())
    .filter(([, count]) => count > 1)
    .map(([card]) => card);

  const rowsWithDuplicates = parsedRows.map((row) => ({
    ...row,
    duplicateInFile: row.user
      ? duplicateCardNumbers.includes(row.user.cardNumber)
      : false,
    errors:
      row.user && duplicateCardNumbers.includes(row.user.cardNumber)
        ? [...row.errors, "numero tessera duplicato nel file"]
        : row.errors,
  }));

  const existingCardNumbers = Array.from(
    new Set(
      rowsWithDuplicates
        .filter((row) => row.duplicateExisting && row.user)
        .map((row) => row.user!.cardNumber),
    ),
  );

  return {
    fileName: file.name,
    totalRows: dataRows.length,
    firstRows: rowsWithDuplicates.slice(0, 10).map((row) => row.original),
    rows: rowsWithDuplicates,
    validRows: rowsWithDuplicates.filter((row) => row.errors.length === 0).length,
    errorRows: rowsWithDuplicates.filter((row) => row.errors.length > 0).length,
    duplicateCardNumbers,
    existingCardNumbers,
  };
}

export function applyImport(
  users: User[],
  preview: ImportPreview,
  strategy: DuplicateStrategy,
): { users: User[]; summary: ImportSummary } {
  if (strategy === "cancel") {
    return {
      users,
      summary: {
        imported: 0,
        updated: 0,
        ignoredDuplicates: 0,
        discardedRows: 0,
        errors: ["Importazione annullata."],
      },
    };
  }

  const nextUsers = [...users];
  const errors: string[] = [];
  let imported = 0;
  let updated = 0;
  let ignoredDuplicates = 0;
  let discardedRows = 0;

  for (const row of preview.rows) {
    if (!row.user || row.errors.length > 0) {
      discardedRows += 1;
      if (row.errors.length > 0) {
        errors.push(`Riga ${row.rowNumber}: ${row.errors.join(", ")}`);
      }
      continue;
    }

    const existingIndex = nextUsers.findIndex(
      (user) => user.cardNumber === row.user!.cardNumber,
    );
    if (existingIndex >= 0) {
      if (strategy === "update") {
        nextUsers[existingIndex] = {
          ...nextUsers[existingIndex],
          cardNumber: row.user.cardNumber,
          firstName: row.user.firstName,
          lastName: row.user.lastName,
          phone: row.user.phone,
          active: row.user.active,
          notes: row.user.notes,
        };
        updated += 1;
      } else {
        ignoredDuplicates += 1;
      }
      continue;
    }

    nextUsers.push({
      id: `u-${crypto.randomUUID()}`,
      cardNumber: row.user.cardNumber,
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      phone: row.user.phone,
      active: row.user.active,
      notes: row.user.notes,
    });
    imported += 1;
  }

  return {
    users: nextUsers,
    summary: {
      imported,
      updated,
      ignoredDuplicates,
      discardedRows,
      errors,
    },
  };
}

export function downloadTemplate() {
  const data = [
    {
      numero_tessera: "0101",
      nome: "Mario",
      cognome: "Rossi",
      telefono: "010123456",
      attivo: "si",
      note: "Esempio utente attivo",
    },
    {
      numero_tessera: "0102",
      nome: "Anna",
      cognome: "Verdi",
      telefono: "3330000000",
      attivo: "no",
      note: "Esempio utente non attivo",
    },
  ];
  const worksheet = XLSX.utils.json_to_sheet(data, {
    header: ["numero_tessera", "nome", "cognome", "telefono", "attivo", "note"],
  });
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 32 },
  ];

  for (const address of ["A2", "A3", "D2", "D3"]) {
    if (worksheet[address]) worksheet[address].z = "@";
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Utenti");
  XLSX.writeFile(workbook, "modello_utenti_cucina_popolare.xlsx");
}
