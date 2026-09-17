export type ParsedAddress = {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
};

const US_STATE =
  /^(AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)$/i;

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeAddressKey(value: string): string {
  return collapse(value)
    .toLowerCase()
    .replace(/[.,#]/g, "")
    .replace(/\s+/g, " ");
}

export function formatAddress(parts: ParsedAddress): string {
  const cityLine = [parts.city, parts.state, parts.zip].filter(Boolean).join(" ");
  return [parts.line1, parts.line2, cityLine].filter((p) => p && p.trim()).join(", ");
}

// Best-effort US address parse for free-text deal creation when Places
// returns nothing. Unknown pieces get explicit placeholders so the property
// row still satisfies NOT NULL columns.
export function parseFreeformAddress(raw: string): ParsedAddress {
  const input = collapse(raw);
  if (!input) {
    return { line1: "Untitled address", line2: null, city: "Unknown", state: "NA", zip: "00000" };
  }

  const full =
    /^(.+?)(?:,\s*(?:(.+?),\s*)?)?([A-Za-z][A-Za-z .]+),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(
      input,
    );
  if (full && US_STATE.test(full[4])) {
    return {
      line1: collapse(full[1]),
      line2: full[2] ? collapse(full[2]) : null,
      city: collapse(full[3]),
      state: full[4].toUpperCase(),
      zip: full[5],
    };
  }

  const compact = /^(.+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(input);
  if (compact && US_STATE.test(compact[2])) {
    return {
      line1: collapse(compact[1]),
      line2: null,
      city: "Unknown",
      state: compact[2].toUpperCase(),
      zip: compact[3],
    };
  }

  return { line1: input.slice(0, 120), line2: null, city: "Unknown", state: "NA", zip: "00000" };
}

export function inboundTagFromId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toLowerCase();
}
