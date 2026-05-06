import * as fs from "fs";
import * as path from "path";

interface SerpItem {
  link: string;
  anchor: string;
  snippet: string;
}

const HTML_PATH = path.join(__dirname, "..", "data", "google.html");
const CSV_PATH = path.join(__dirname, "..", "output", "results.csv");

// Чистит HTML-фрагмент: убирает теги, декодирует сущности,
// схлопывает пробелы и обрезает хвостовое "Read more".
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
    .replace(/\s*(?:Read more|More|Show more)\s*$/i, "")
    .trim();
}

// true — если ссылка ведёт на внешний сайт, а не на служебные страницы Google.
function isOrganic(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  return !/(?:accounts|support|policies|maps|translate)\.google\.com|google\.com\/(?:search|preferences|intl|advanced_search)|googleusercontent|googleadservices/.test(url);
}

// Извлекает все органические результаты выдачи: ссылку, анкор и сниппет.
function parseItems(html: string): SerpItem[] {
  const itemRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>(?:(?!<\/a>)[\s\S]){0,2000}?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/gi;
  const snippetRe = /<div[^>]+class="[^"]*(?:VwiC3b|yXK7lf|MUxGbd|lEBKkf)[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

  const items: SerpItem[] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(itemRe)) {
    const link = (m[1] as string).replace(/&amp;/g, "&");
    if (!isOrganic(link) || seen.has(link)) continue;
    seen.add(link);

    const start = (m.index ?? 0) + m[0].length;
    const tail = html.slice(start, start + 4000);
    const sm = tail.match(snippetRe);

    items.push({
      link,
      anchor: clean(m[2] as string),
      snippet: sm ? clean(sm[1] as string) : "",
    });
  }
  return items;
}

// Возвращает ссылку на следующую страницу выдачи или пустую строку.
function parseNextPage(html: string): string {
  const tag = html.match(/<a[^>]*id="pnnext"[^>]*>/i);
  const href = tag?.[0].match(/href="([^"]+)"/)?.[1];
  if (!href) return "";
  const url = href.replace(/&amp;/g, "&");
  return url.startsWith("http") ? url : "https://www.google.com" + url;
}

// Формирует CSV-строку из результатов (с BOM для корректного открытия в Excel).
function toCsv(items: SerpItem[], next: string): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [
    "link,anchor,snippet",
    ...items.map((i) => [i.link, i.anchor, i.snippet].map(esc).join(",")),
    "",
    `next_page,${esc(next)},`,
  ];
  return "\uFEFF" + rows.join("\r\n");
}

// Точка входа: читает HTML, парсит, сохраняет CSV, печатает отчёт.
function main(): void {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const items = parseItems(html);
  const next = parseNextPage(html);

  fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
  fs.writeFileSync(CSV_PATH, toCsv(items, next), "utf8");

  console.log(`Parsed ${items.length} items.`);
  items.forEach((i) => console.log(` - [${i.anchor}] ${i.link}`));
  console.log(`Next page: ${next || "—"}`);
}

main();
