import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "imp", "sentiment-dataset");
const splits = ["train", "validation", "test"];
const expectedRows = { train: 180, validation: 90, test: 90 };
const expectedPerLabel = { train: 36, validation: 18, test: 18 };
const expectedPerLanguage = { train: 60, validation: 30, test: 30 };
const expectedPerContext = { train: 30, validation: 15, test: 15 };
const expectedFamilies = { train: new Set(["F1", "F2"]), validation: new Set(["F3"]), test: new Set(["F4"]) };
const expectedLabels = new Set(["very_negative", "negative", "neutral", "positive", "very_positive"]);
const expectedLanguages = new Set(["en", "hi_devanagari", "hinglish_latin"]);
const expectedContexts = new Set(["delivery", "product_condition", "return", "refund", "payment", "support"]);
const forbiddenDecisionTerms = /\b(fraud|fraudulent|manipulative|abusive|honest|credible|high_risk_buyer|refund_eligible|likely_to_chargeback|dispute_winner|bad_customer)\b/i;
const personalDataPattern = /(?:\b\d{10}\b|\b\d{12,19}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:otp|upi\s*pin|cvv)\b)/i;

function parseCsv(content) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"' && inQuotes && next === '"') { field += '"'; index += 1; continue; }
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === "," && !inQuotes) { row.push(field); field = ""; continue; }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [headers, ...data] = rows;
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function countBy(rows, key) {
  return Object.fromEntries([...new Set(rows.map((row) => row[key]))].sort().map((value) => [value, rows.filter((row) => row[key] === value).length]));
}

const errors = [];
const allRows = [];
const details = {};
for (const split of splits) {
  const rows = parseCsv(readFileSync(join(dataDir, `${split}.csv`), "utf8"));
  details[split] = { rows: rows.length, labels: countBy(rows, "sentiment_label"), languages: countBy(rows, "language"), contexts: countBy(rows, "issue_context"), families: countBy(rows, "template_family") };
  if (rows.length !== expectedRows[split]) errors.push(`${split} expected ${expectedRows[split]} rows, found ${rows.length}.`);
  for (const row of rows) {
    if (row.split !== split) errors.push(`${row.example_id} has split ${row.split}, expected ${split}.`);
    if (!expectedLabels.has(row.sentiment_label)) errors.push(`${row.example_id} has unsupported sentiment label ${row.sentiment_label}.`);
    if (!expectedLanguages.has(row.language)) errors.push(`${row.example_id} has unsupported language ${row.language}.`);
    if (!expectedContexts.has(row.issue_context)) errors.push(`${row.example_id} has unsupported issue context ${row.issue_context}.`);
    if (!expectedFamilies[split].has(row.template_family)) errors.push(`${row.example_id} uses ${row.template_family} in ${split}.`);
    if (row.is_synthetic !== "true") errors.push(`${row.example_id} is not explicitly synthetic.`);
    if (forbiddenDecisionTerms.test(`${row.sentiment_label} ${row.text} ${row.label_rationale}`)) errors.push(`${row.example_id} contains a prohibited decision label or inference.`);
    if (personalDataPattern.test(row.text)) errors.push(`${row.example_id} may contain prohibited personal/payment data.`);
  }
  for (const label of expectedLabels) if (details[split].labels[label] !== expectedPerLabel[split]) errors.push(`${split}/${label} expected ${expectedPerLabel[split]}, found ${details[split].labels[label] ?? 0}.`);
  for (const language of expectedLanguages) if (details[split].languages[language] !== expectedPerLanguage[split]) errors.push(`${split}/${language} expected ${expectedPerLanguage[split]}, found ${details[split].languages[language] ?? 0}.`);
  for (const context of expectedContexts) if (details[split].contexts[context] !== expectedPerContext[split]) errors.push(`${split}/${context} expected ${expectedPerContext[split]}, found ${details[split].contexts[context] ?? 0}.`);
  allRows.push(...rows);
}

const textSet = new Set(allRows.map((row) => row.text));
const idSet = new Set(allRows.map((row) => row.example_id));
if (textSet.size !== allRows.length) errors.push("Exact statement-text overlap exists across the dataset splits.");
if (idSet.size !== allRows.length) errors.push("Duplicate example identifiers exist across the dataset splits.");

if (errors.length) {
  console.error(JSON.stringify({ status: "failed", errors, details }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", total_rows: allRows.length, duplicate_texts: allRows.length - textSet.size, duplicate_ids: allRows.length - idSet.size, details }, null, 2));
