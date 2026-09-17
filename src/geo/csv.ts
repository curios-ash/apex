import { parseFreeformAddress, type ParsedAddress } from "@/deals/address";
import { parseDollarsToCents } from "@/onboarding";

export type BulkPropertyRow = {
  raw: string;
  address: ParsedAddress;
  name: string | null;
  unitCount: number | null;
  purchasePriceCents: number | null;
  propertyType: "sfr" | "condo" | "townhome" | "duplex" | "triplex" | "fourplex" | "multi_5plus" | null;
};

const HEADER_ALIASES: Record<string, string> = {
  address: "address",
  "street address": "address",
  address1: "address",
  address_line1: "address",
  line1: "address",
  address_line2: "address2",
  address2: "address2",
  line2: "address2",
  city: "city",
  state: "state",
  zip: "zip",
  zipcode: "zip",
  "zip code": "zip",
  units: "units",
  unit_count: "units",
  "unit count": "units",
  doors: "units",
  name: "name",
  property: "name",
  property_type: "propertyType",
  "property type": "propertyType",
  type: "propertyType",
  purchase_price: "purchasePrice",
  "purchase price": "purchasePrice",
  price: "purchasePrice",
  purchaseprice: "purchasePrice",
};

const PROPERTY_TYPES = new Set([
  "sfr",
  "condo",
  "townhome",
  "duplex",
  "triplex",
  "fourplex",
  "multi_5plus",
]);

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function looksLikeHeader(cells: string[]): boolean {
  return cells.some((cell) => HEADER_ALIASES[cell.toLowerCase().replace(/[_-]+/g, " ")]);
}

function mapHeader(cell: string): string | null {
  const key = cell.toLowerCase().replace(/[_-]+/g, " ").trim();
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/\s+/g, "")] ?? null;
}

function parseUnitCount(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 500) return null;
  return n;
}

function parsePropertyType(raw: string | undefined): BulkPropertyRow["propertyType"] {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "single_family" || value === "sfh") return "sfr";
  if (PROPERTY_TYPES.has(value)) return value as NonNullable<BulkPropertyRow["propertyType"]>;
  return null;
}

function rowFromParts(params: {
  raw: string;
  addressText: string;
  city?: string;
  state?: string;
  zip?: string;
  address2?: string;
  name?: string;
  units?: string;
  purchasePrice?: string;
  propertyType?: string;
}): BulkPropertyRow {
  let address = parseFreeformAddress(params.addressText);
  if (params.city) address = { ...address, city: params.city };
  if (params.state) address = { ...address, state: params.state.toUpperCase() };
  if (params.zip) address = { ...address, zip: params.zip };
  if (params.address2) address = { ...address, line2: params.address2 };
  return {
    raw: params.raw,
    address,
    name: params.name?.trim() ? params.name.trim() : null,
    unitCount: parseUnitCount(params.units),
    purchasePriceCents: params.purchasePrice ? parseDollarsToCents(params.purchasePrice) : null,
    propertyType: parsePropertyType(params.propertyType),
  };
}

export function parseBulkProperties(text: string): BulkPropertyRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  if (lines.length === 0) return [];

  const firstCells = splitCsvLine(lines[0]);
  if (firstCells.length > 1 && looksLikeHeader(firstCells)) {
    const headers = firstCells.map(mapHeader);
    const rows: BulkPropertyRow[] = [];
    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line);
      const get = (name: string) => {
        const idx = headers.indexOf(name);
        return idx >= 0 ? cells[idx] : undefined;
      };
      const addressText =
        get("address") ||
        [get("address"), get("city"), get("state"), get("zip")].filter(Boolean).join(", ");
      if (!addressText?.trim()) continue;
      rows.push(
        rowFromParts({
          raw: line,
          addressText,
          city: get("city"),
          state: get("state"),
          zip: get("zip"),
          address2: get("address2"),
          name: get("name"),
          units: get("units"),
          purchasePrice: get("purchasePrice"),
          propertyType: get("propertyType"),
        }),
      );
    }
    return rows;
  }

  return lines.map((line) => rowFromParts({ raw: line, addressText: line }));
}
