// Workspace inbound aliases look like <slug>@in.<domain>. Deal-scoped
// aliases add a plus tag: <slug>+<8hex>@in.<domain>.

export type InboundAlias = {
  slug: string;
  tag: string | null;
};

export function parseInboundAlias(
  addresses: string[],
  inboundDomain = process.env.INBOUND_EMAIL_DOMAIN,
): InboundAlias | null {
  for (const raw of addresses) {
    const angle = /<([^>]+)>/.exec(raw);
    const address = (angle ? angle[1] : raw).trim().toLowerCase();
    const m = /^([a-z0-9][a-z0-9-]*)(?:\+([a-z0-9]{4,32}))?@(in\.[a-z0-9.-]+)$/.exec(address);
    if (!m) continue;
    if (inboundDomain && m[3] !== inboundDomain.toLowerCase()) continue;
    return { slug: m[1], tag: m[2] ?? null };
  }
  return null;
}

export function formatDealInboundAddress(slug: string, tag: string, domain: string): string {
  return `${slug}+${tag}@${domain}`;
}
