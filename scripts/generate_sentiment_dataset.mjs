import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "imp", "sentiment-dataset");

const labels = [
  "very_negative",
  "negative",
  "neutral",
  "positive",
  "very_positive",
];

const labelRationales = {
  very_negative: "Strong dissatisfaction or distress expressed in the statement.",
  negative: "Clear dissatisfaction or disappointment expressed in the statement.",
  neutral: "Information-seeking or factual statement without clear polarity.",
  positive: "Clear satisfaction or appreciation expressed in the statement.",
  very_positive: "Strong satisfaction, praise, or delight expressed in the statement.",
};

const contexts = [
  { id: "delivery", en: "delivery", hi: "डिलीवरी", hinglish: "delivery" },
  { id: "product_condition", en: "product condition", hi: "उत्पाद की स्थिति", hinglish: "product condition" },
  { id: "return", en: "return request", hi: "वापसी अनुरोध", hinglish: "return request" },
  { id: "refund", en: "refund update", hi: "रिफंड अपडेट", hinglish: "refund update" },
  { id: "payment", en: "payment update", hi: "भुगतान अपडेट", hinglish: "payment update" },
  { id: "support", en: "support request", hi: "सहायता अनुरोध", hinglish: "support request" },
];

const languages = [
  {
    id: "en",
    script: "latin",
    contextKey: "en",
    wrappers: [
      (phrase, context) => `${phrase}. My ${context} needs attention.`,
      (phrase, context) => `Regarding the ${context}: ${phrase.toLowerCase()}.`,
      (phrase, context) => `I am writing about the ${context}; ${phrase.toLowerCase()}.`,
      (phrase, context) => `${phrase}. Please review the ${context}.`,
    ],
  },
  {
    id: "hi_devanagari",
    script: "devanagari",
    contextKey: "hi",
    wrappers: [
      (phrase, context) => `${context} के बारे में ${phrase}। कृपया जाँच करें।`,
      (phrase, context) => `${phrase}। ${context} की स्थिति बताएं।`,
      (phrase, context) => `मैं ${context} के लिए लिख रहा/रही हूँ; ${phrase}।`,
      (phrase, context) => `${phrase}। कृपया ${context} की समीक्षा करें।`,
    ],
  },
  {
    id: "hinglish_latin",
    script: "mixed_latin",
    contextKey: "hinglish",
    wrappers: [
      (phrase, context) => `${context} ke baare mein: ${phrase}. Kripya check karein.`,
      (phrase, context) => `${phrase}. ${context} ka update share karein.`,
      (phrase, context) => `Main ${context} ke liye likh raha/rahi hoon; ${phrase}.`,
      (phrase, context) => `${phrase}. Please ${context} review karein.`,
    ],
  },
];

const phrases = {
  en: {
    very_negative: ["This is completely unacceptable", "I am extremely frustrated", "This experience has been terrible", "I am deeply upset by this"],
    negative: ["I am disappointed", "This has been frustrating", "I am not satisfied", "This update is concerning"],
    neutral: ["Please share the current status", "I need an update", "Could you confirm the details", "I am checking the status"],
    positive: ["Thank you, that was helpful", "I appreciate the update", "This has been resolved well", "I am satisfied with the support"],
    very_positive: ["This service was excellent", "I am very grateful for the help", "The resolution was outstanding", "This was a fantastic experience"],
  },
  hi_devanagari: {
    very_negative: ["यह बिल्कुल स्वीकार्य नहीं है", "मैं बहुत परेशान हूँ", "यह अनुभव बहुत खराब रहा", "मैं इससे बहुत दुखी हूँ"],
    negative: ["मैं निराश हूँ", "यह बहुत परेशान करने वाला रहा", "मैं संतुष्ट नहीं हूँ", "यह अपडेट चिंताजनक है"],
    neutral: ["कृपया वर्तमान स्थिति बताएं", "मुझे एक अपडेट चाहिए", "क्या आप विवरण की पुष्टि कर सकते हैं", "मैं स्थिति जाँच रहा/रही हूँ"],
    positive: ["धन्यवाद, यह मददगार था", "मैं अपडेट की सराहना करता/करती हूँ", "यह अच्छी तरह सुलझ गया", "मैं सहायता से संतुष्ट हूँ"],
    very_positive: ["यह सेवा उत्कृष्ट रही", "मैं सहायता के लिए बहुत आभारी हूँ", "समाधान शानदार था", "यह बहुत अच्छा अनुभव था"],
  },
  hinglish_latin: {
    very_negative: ["Yeh bilkul acceptable nahi hai", "Main bahut frustrated hoon", "Yeh experience bahut kharab raha", "Main isse bahut upset hoon"],
    negative: ["Main disappointed hoon", "Yeh bahut frustrating raha", "Main satisfied nahi hoon", "Yeh update concerning hai"],
    neutral: ["Current status share karein", "Mujhe ek update chahiye", "Kya aap details confirm kar sakte hain", "Main status check kar raha/rahi hoon"],
    positive: ["Thank you, yeh helpful tha", "Main update appreciate karta/karti hoon", "Yeh achchhe se resolve hua", "Main support se satisfied hoon"],
    very_positive: ["Yeh service excellent thi", "Main help ke liye bahut grateful hoon", "Resolution outstanding tha", "Yeh fantastic experience tha"],
  },
};

const splitByFamily = ["train", "train", "validation", "test"];
const rows = [];

for (const language of languages) {
  for (const context of contexts) {
    for (const label of labels) {
      phrases[language.id][label].forEach((phrase, familyIndex) => {
        const split = splitByFamily[familyIndex];
        const text = language.wrappers[familyIndex](phrase, context[language.contextKey]);
        rows.push({
          example_id: `SYN-${language.id}-${context.id}-${label}-F${familyIndex + 1}`,
          text,
          sentiment_label: label,
          language: language.id,
          script: language.script,
          issue_context: context.id,
          split,
          template_family: `F${familyIndex + 1}`,
          is_synthetic: "true",
          label_rationale: labelRationales[label],
        });
      });
    }
  }
}

const expectedCounts = { train: 180, validation: 90, test: 90 };
const splitRows = Object.fromEntries(Object.keys(expectedCounts).map((split) => [split, rows.filter((row) => row.split === split)]));
const uniqueTexts = new Set(rows.map((row) => row.text));
if (rows.length !== 360) throw new Error(`Expected 360 rows; received ${rows.length}.`);
if (uniqueTexts.size !== rows.length) throw new Error("Duplicate synthetic statement text detected across splits.");
for (const [split, expected] of Object.entries(expectedCounts)) {
  if (splitRows[split].length !== expected) throw new Error(`Expected ${expected} ${split} rows; received ${splitRows[split].length}.`);
}

const headers = ["example_id", "text", "sentiment_label", "language", "script", "issue_context", "split", "template_family", "is_synthetic", "label_rationale"];
const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
const toCsv = (data) => [headers.join(","), ...data.map((row) => headers.map((header) => escapeCsv(row[header])).join(","))].join("\n") + "\n";
const countBy = (data, key) => Object.fromEntries([...new Set(data.map((row) => row[key]))].sort().map((value) => [value, data.filter((row) => row[key] === value).length]));

const manifest = {
  dataset_name: "synthetic_multilingual_customer_statement_sentiment_v1",
  version: "1.0.0",
  generated_by: "scripts/generate_sentiment_dataset.mjs",
  randomness: "none",
  total_rows: rows.length,
  is_synthetic: true,
  label_set: labels,
  prohibited_targets: ["fraud", "manipulation", "abuse", "credibility", "eligibility", "refund_decision", "dispute_outcome", "payment_risk"],
  split_counts: Object.fromEntries(Object.entries(splitRows).map(([split, data]) => [split, data.length])),
  distribution: Object.fromEntries(Object.entries(splitRows).map(([split, data]) => [split, {
    sentiment_label: countBy(data, "sentiment_label"),
    language: countBy(data, "language"),
    issue_context: countBy(data, "issue_context"),
    template_family: countBy(data, "template_family"),
  }])),
  validation: {
    exact_text_duplicates: rows.length - uniqueTexts.size,
    train_validation_test_text_overlap: false,
    held_out_test_used_for_training: false,
  },
  usage_boundary: "Advisory-only sentiment triage research. Never use as a customer-trust, fraud, manipulation, eligibility, payment, refund, or external-action signal.",
};

mkdirSync(outputDir, { recursive: true });
for (const [split, data] of Object.entries(splitRows)) writeFileSync(join(outputDir, `${split}.csv`), toCsv(data), "utf8");
writeFileSync(join(outputDir, "dataset_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "ok", rows: rows.length, split_counts: manifest.split_counts, duplicates: manifest.validation.exact_text_duplicates }, null, 2));
