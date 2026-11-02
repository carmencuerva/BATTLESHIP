// Board-game coordinates for the interface only: column letters A, B, C… and row numbers
// 1, 2, 3…, so (row 6, col 2) is "C7". The engine always works with 0-based (row, col).

export const MAX_COLUMNS = 26; // A..Z

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function columnLabel(col) {
  if (!Number.isInteger(col) || col < 0 || col >= MAX_COLUMNS) throw new RangeError(`no letter for column ${col}`);
  return LETTERS[col];
}

export function rowLabel(row) {
  if (!Number.isInteger(row) || row < 0) throw new RangeError(`no number for row ${row}`);
  return String(row + 1);
}

// (0, 0) -> "A1"; (6, 2) -> "C7".
export function toCoord(row, col) {
  return `${columnLabel(col)}${rowLabel(row)}`;
}

// "C7" (any case, spaces ignored) -> [6, 2]; null if it is not a coordinate, or if it falls
// outside a board of `size` when a size is given.
export function parseCoord(text, size = null) {
  const match = /^([A-Z])([1-9][0-9]*)$/.exec(String(text).replace(/\s+/g, "").toUpperCase());
  if (!match) return null;
  const col = LETTERS.indexOf(match[1]);
  const row = Number(match[2]) - 1;
  if (size != null && (row >= size || col >= size)) return null;
  return [row, col];
}
