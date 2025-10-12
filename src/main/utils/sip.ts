import { parse as parseSip } from 'sip-parser';

export const safeParseHeaders = (s: string): Record<string, string[]> => {
  try {
    const msg = parseSip(s);
    const headers: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(msg.headers ?? {})) {
      const key = k.toLowerCase();
      const arr = Array.isArray(v) ? v : [v];
      headers[key] = arr.map(String);
    }
    return headers;
  } catch {
    const headers: Record<string, string[]> = {};
    for (const line of s.split(/\r?\n/)) {
      const m = /^([^:\s]+)\s*:\s*(.+)$/.exec(line);
      if (m) (headers[m[1].toLowerCase()] ||= []).push(m[2].trim());
    }
    return headers;
  }
};

export const one = (v?: string[] | string) => (Array.isArray(v) ? v[0] : v);

export const extractNumber = (v?: string | null) => {
  if (!v) return null;
  let m =
    /<sip:([\+\d][\d\-]{4,})/i.exec(v) ||
    /tel:([\+\d][\d\-]{4,})/i.exec(v) ||
    /sip:([\d\-]{6,})/i.exec(v);
  return m ? m[1] : null;
};

export const pickCallerNumber = (h: Record<string, string[]>) =>
  extractNumber(one(h['p-asserted-identity'])) ||
  extractNumber(one(h['remote-party-id'])) ||
  extractNumber(one(h['from']));

export const formatKR = (n?: string | null) => {
  if (!n) return null;
  const digits = n.replace(/[^\d]/g, '');
  if (!digits) return null;
  const local = digits.startsWith('82') ? digits.replace(/^82/, '0') : digits;
  return local.replace(/^(\d{2,3})(\d{3,4})(\d{4}).*$/, '$1-$2-$3');
};
