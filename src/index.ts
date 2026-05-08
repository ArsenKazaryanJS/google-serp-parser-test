import * as fs from "fs";
import * as path from "path";

type SerpType = "ad" | "organic";

interface SerpItem {
  type: SerpType;
  link: string;
  anchor: string;
  snippet: string;
}

const HTML_PATH = path.join(__dirname, "..", "data", "google.html");
const CSV_PATH = path.join(__dirname, "..", "output", "results.csv");

// Маркеры карточек результатов в HTML страницы выдачи.
const AD_OPEN = /<div\b[^>]*\bdata-text-ad="[^"]*"[^>]*>/gi;
const ORGANIC_OPEN = /<div\b[^>]*\bclass="[^"]*\btF2Cxc\b[^"]*"[^>]*>/gi;

// Что брать внутри рекламного блока.
const AD_LINK = /<a\b[^>]*\bclass="[^"]*\bsVXRqc\b[^"]*"[^>]*\bhref="([^"]+)"/i;
const AD_ANCHOR = /<div\b(?=[^>]*\brole="heading")(?=[^>]*\baria-level="3")[^>]*>([\s\S]*?)<\/div>/i;
const AD_SNIPPET = /<div\b[^>]*\bclass="[^"]*\bp4wth\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

// Что брать внутри органического блока.
const ORGANIC_LINK_ANCHOR = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>(?:(?!<\/a>)[\s\S]){0,2000}?<h3[^>]*>([\s\S]*?)<\/h3>/i;
const ORGANIC_SNIPPET = /<div\b[^>]*\bclass="[^"]*\b(?:VwiC3b|yXK7lf|MUxGbd|lEBKkf)\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

// HTML-фрагмент → plain text.
function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Возвращает HTML блока от его открывающего <div> до парного </div>.
// Считаем глубину сами — обычный regex вложенность не понимает.
function readBlock(html: string, start: number): string {
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return "";
}

// Все блоки результатов в порядке появления на странице.
function findBlocks(html: string): { type: SerpType; html: string }[] {
  const out: { type: SerpType; html: string; pos: number }[] = [];
  const collect = (re: RegExp, type: SerpType) => {
    for (const m of html.matchAll(re)) {
      const block = readBlock(html, m.index ?? 0);
      if (block) out.push({ type, html: block, pos: m.index ?? 0 });
    }
  };
  collect(AD_OPEN, "ad");
  collect(ORGANIC_OPEN, "organic");
  return out.sort((a, b) => a.pos - b.pos);
}

function parseAd(block: string): SerpItem | null {
  const link = block.match(AD_LINK)?.[1];
  if (!link) return null;
  return {
    type: "ad",
    link: link.replace(/&amp;/g, "&"),
    anchor: clean(block.match(AD_ANCHOR)?.[1] ?? ""),
    snippet: clean(block.match(AD_SNIPPET)?.[1] ?? ""),
  };
}

function parseOrganic(block: string): SerpItem | null {
  const m = block.match(ORGANIC_LINK_ANCHOR);
  if (!m) return null;
  return {
    type: "organic",
    link: (m[1] as string).replace(/&amp;/g, "&"),
    anchor: clean(m[2] as string),
    snippet: clean(block.match(ORGANIC_SNIPPET)?.[1] ?? ""),
  };
}

function parseItems(html: string): SerpItem[] {
  const items: SerpItem[] = [];
  const seen = new Set<string>();
  for (const b of findBlocks(html)) {
    const item = b.type === "ad" ? parseAd(b.html) : parseOrganic(b.html);
    if (!item) continue;
    const key = `${item.link}\u0001${item.anchor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items;
}

function parseNextPage(html: string): string {
  const tag = html.match(/<a[^>]*\bid="pnnext"[^>]*>/i)?.[0] ?? "";
  const href = tag.match(/\bhref="([^"]+)"/i)?.[1];
  if (!href) return "";
  const url = href.replace(/&amp;/g, "&");
  return url.startsWith("http") ? url : "https://www.google.com" + url;
}

// CSV с BOM и CRLF — корректно открывается в Excel.
function toCsv(items: SerpItem[], next: string): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [
    "type,link,anchor,snippet",
    ...items.map((i) => [i.type, i.link, i.anchor, i.snippet].map(esc).join(",")),
    "",
    `next_page,${esc(next)},,`,
  ];
  return "\uFEFF" + rows.join("\r\n");
}

function main(): void {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const items = parseItems(html);
  const next = parseNextPage(html);

  fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
  fs.writeFileSync(CSV_PATH, toCsv(items, next), "utf8");

  console.log(`Parsed ${items.length} items.`);
  items.forEach((i) => console.log(` - [${i.type}] [${i.anchor}] ${i.link}`));
  console.log(`Next page: ${next || "—"}`);
}

main();
