# Google SERP parser (test task)

Парсит сохранённую страницу выдачи Google по запросу `get taxi`
с помощью **Node.js + TypeScript** и **только регулярных выражений**
(без cheerio / jsdom / puppeteer).

## Стек

- Node.js 
- TypeScript 
- ts-node — для запуска без отдельной компиляции

## Как запустить

```bash
npm install
npm run dev
```

Опционально — скомпилировать в `dist/` и запустить готовый JS:

```bash
npm run build
npm start
```

## Структура проекта

├── data/
│   └── google.html        # сохранённый view-source страницы выдачи
├── output/
│   └── results.csv        # результат работы парсера
├── src/
│   └── index.ts           # парсер
├── package.json
├── tsconfig.json
└── README.md