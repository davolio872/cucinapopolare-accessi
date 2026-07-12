export type AttendanceStatus =
  | "Prenotato"
  | "Presente"
  | "Assente"
  | "Senza prenotazione";

export type User = {
  id: string;
  cardNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  active: boolean;
  notes: string;
};

export type DailyEntry = {
  userId: string;
  status: AttendanceStatus;
  entryTime?: string;
  date: string;
  bookingChannel?: "manuale" | "sms" | "whatsapp" | "telefono";
  sourcePhone?: string;
  bookedAt?: string;
};

export type CommunicationLog = {
  id: string;
  userId?: string;
  channel: "sms" | "whatsapp" | "telefono" | "manuale";
  direction: "inbound" | "outbound" | "internal";
  phone: string;
  body: string;
  providerMessageId?: string;
  status: string;
  createdAt: string;
};

export type AppState = {
  users: User[];
  entries: DailyEntry[];
  communicationLogs: CommunicationLog[];
};

export type ImportUserRow = {
  cardNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  active: boolean;
  notes: string;
};

export type ImportRowResult = {
  rowNumber: number;
  original: Record<string, string>;
  user?: ImportUserRow;
  errors: string[];
  duplicateInFile: boolean;
  duplicateExisting: boolean;
};

export type DuplicateStrategy = "ignore" | "update" | "cancel";

export type ImportPreview = {
  fileName: string;
  totalRows: number;
  firstRows: Record<string, string>[];
  rows: ImportRowResult[];
  validRows: number;
  errorRows: number;
  duplicateCardNumbers: string[];
  existingCardNumbers: string[];
};

export type ImportSummary = {
  imported: number;
  updated: number;
  ignoredDuplicates: number;
  discardedRows: number;
  errors: string[];
};
