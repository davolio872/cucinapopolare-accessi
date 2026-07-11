import type { AppState, DailyEntry, User } from "@/types";

export const demoUsers: User[] = [
  {
    id: "u-001",
    cardNumber: "0001",
    firstName: "Maria",
    lastName: "Bianchi",
    phone: "0105550101",
    active: true,
    notes: "Preferisce tavolo vicino all'ingresso.",
  },
  {
    id: "u-002",
    cardNumber: "0002",
    firstName: "Gianni",
    lastName: "Rossi",
    phone: "3330001200",
    active: true,
    notes: "",
  },
  {
    id: "u-003",
    cardNumber: "0003",
    firstName: "Fatima",
    lastName: "El Idrissi",
    phone: "3491122334",
    active: true,
    notes: "Contattare la figlia per comunicazioni importanti.",
  },
  {
    id: "u-004",
    cardNumber: "0004",
    firstName: "Paolo",
    lastName: "Ferrando",
    phone: "010440098",
    active: true,
    notes: "",
  },
  {
    id: "u-005",
    cardNumber: "0005",
    firstName: "Lucia",
    lastName: "Parodi",
    phone: "3477788990",
    active: true,
    notes: "Allergia segnalata: frutta secca.",
  },
  {
    id: "u-006",
    cardNumber: "0006",
    firstName: "Ahmed",
    lastName: "Khalil",
    phone: "3204567890",
    active: true,
    notes: "",
  },
  {
    id: "u-007",
    cardNumber: "0007",
    firstName: "Teresa",
    lastName: "Costa",
    phone: "010776655",
    active: true,
    notes: "Arriva spesso accompagnata.",
  },
  {
    id: "u-008",
    cardNumber: "0008",
    firstName: "Roberto",
    lastName: "Pastorino",
    phone: "3387007001",
    active: true,
    notes: "",
  },
  {
    id: "u-009",
    cardNumber: "0009",
    firstName: "Nadia",
    lastName: "Conti",
    phone: "3409988776",
    active: false,
    notes: "Non attiva temporaneamente.",
  },
  {
    id: "u-010",
    cardNumber: "0010",
    firstName: "Enrico",
    lastName: "Massa",
    phone: "010123456",
    active: true,
    notes: "",
  },
  {
    id: "u-011",
    cardNumber: "0011",
    firstName: "Amina",
    lastName: "Said",
    phone: "3451231234",
    active: true,
    notes: "",
  },
  {
    id: "u-012",
    cardNumber: "0012",
    firstName: "Carlo",
    lastName: "Repetto",
    phone: "010554433",
    active: true,
    notes: "Richiede porzioni piccole.",
  },
];

export function createDemoEntries(date: string): DailyEntry[] {
  return [
    { userId: "u-001", status: "Prenotato", date },
    { userId: "u-002", status: "Presente", entryTime: "12:05", date },
    { userId: "u-003", status: "Prenotato", date },
    { userId: "u-004", status: "Assente", date },
    { userId: "u-005", status: "Prenotato", date },
    { userId: "u-006", status: "Prenotato", date },
    { userId: "u-007", status: "Prenotato", date },
    { userId: "u-008", status: "Prenotato", date },
    { userId: "u-010", status: "Senza prenotazione", entryTime: "12:18", date },
    { userId: "u-011", status: "Prenotato", date },
  ];
}

export function createDemoState(date: string): AppState {
  return {
    users: demoUsers,
    entries: createDemoEntries(date),
  };
}
