/* ============================================================
   Electricity bill PDF extractor — ported from the old repo's
   admin/bill-extractor.js. Regex/pattern-matching over the PDF's
   text layer (via pdfjs-dist); text-based bills only — the old
   Tesseract OCR fallback was never actually wired up (the library
   was referenced but never loaded anywhere), so it's dropped here
   rather than carried forward as dead code.
============================================================ */
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export type BillHistoryEntry = {
  period?: string;
  month?: string;
  days?: number | null;
  units?: number | null;
  amount?: number | null;
  basis?: string;
};

export type ExtractedBillData = {
  customerName: string | null;
  address: string | null;
  supplyAddress: string | null;
  mobile: string | null;
  email: string | null;
  caNumber: string | null;
  sanctionedLoad: number | null;
  phase: string | null;
  mdi: number | null;
  tariffCategory: string | null;
  last6MonthsBills: BillHistoryEntry[];
  energisationDate: string | null;
  provider: string;
};

export type SystemSizeSuggestion = {
  minKW: number;
  maxKW: number;
  recommendedKW: number;
};

async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";
  const numPages = Math.min(pdf.numPages, 3);

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    fullText += pageText + "\n";
  }

  return fullText;
}

function detectProvider(text: string): string {
  const upperText = text.toUpperCase();
  if (upperText.includes("TATA POWER DELHI") || upperText.includes("TPDDL")) return "TPDDL";
  if (upperText.includes("BSES YAMUNA") || upperText.includes("BYPL")) return "BSES Yamuna";
  if (upperText.includes("BSES RAJDHANI") || upperText.includes("BRPL")) return "BSES Rajdhani";
  return "Unknown";
}

function extractName(text: string): string | null {
  let match = text.match(
    /(?:Name|Consumer\s+Name|Customer\s+Name)\s*:?\s*([A-Z][A-Z\s.\/]+?)(?:\s*S\/O|\s*W\/O|\s*D\/O|\s*Billing|\s*Address|\n)/i,
  );
  if (match) {
    let name = match[1].trim();
    name = name.replace(/\s*[SWD]\/O.*$/i, "").trim();
    name = name.replace(/^(MR\.?|MRS\.?|SMT\.?|SHRI\.?|MS\.?|DR\.?|PROF\.?)\s+/i, "").trim();
    name = name.replace(/\s+/g, " ").trim();
    if (name.length > 2) return name;
  }

  const beforeAddress = text.match(/^([\s\S]{0,300}?)(?:Billing\s+Address|Address)/i);
  if (beforeAddress) {
    const topSection = beforeAddress[1];
    const nameMatch = topSection.match(/(?:Name|Consumer|Customer)\s*:?\s*([A-Z][A-Z\s.]+)/i);
    if (nameMatch) {
      let name = nameMatch[1].trim();
      name = name.replace(/\s*[SWD]\/O.*$/i, "").trim();
      name = name.replace(/^(MR\.?|MRS\.?|SMT\.?|SHRI\.?|MS\.?|DR\.?|PROF\.?)\s+/i, "").trim();
      name = name.replace(/\s+/g, " ").trim();
      if (name.length > 2) return name;
    }
  }

  return null;
}

function removeDuplicateWords(text: string): string {
  const words = text.split(/\s+/);
  const result: string[] = [];
  let prev: string | null = null;
  for (const word of words) {
    const normalized = word.toLowerCase().replace(/[,;.]/g, "");
    if (normalized !== prev) {
      result.push(word);
      prev = normalized;
    }
  }
  return result.join(" ");
}

function extractAddress(text: string): string | null {
  const provider = detectProvider(text);

  let match = text.match(
    /Billing\s+Address\s*:?\s*([^\n]+)(?:\n([^\n:]+))?(?=\s*(?:Supply\s+Address|Mobile|Email|Tel|District|Tariff|CA\s*No|Energisation|Sanctioned))/i,
  );
  if (match) {
    let addr = match[1].trim();
    if (match[2] && !match[2].includes(":")) addr += " " + match[2].trim();
    addr = addr.replace(/\s+/g, " ").trim();
    if (provider.includes("BSES")) {
      const pincodeMatch = addr.match(/(.*?\d{6})/);
      if (pincodeMatch) addr = pincodeMatch[1];
    }
    addr = addr.replace(/[,;:\s]+$/, "");
    if (addr.length > 5) return addr;
  }

  match = text.match(/(?:Name|Customer).*?\n(.*?)(?=Supply\s+Address|Mobile|Tel|Email|CA\s*No)/is);
  if (match) {
    let addr = match[1].trim();
    addr = addr.replace(/Billing\s+Address\s*:?\s*/gi, "").trim();
    addr = addr.split("\n").slice(0, 1).join(", ");
    if (provider.includes("BSES")) {
      const pincodeMatch = addr.match(/(.*?\d{6})/);
      if (pincodeMatch) addr = pincodeMatch[1];
    }
    if (addr.length > 5) return addr;
  }

  return null;
}

function extractSupplyAddress(text: string, billingAddress: string | null): string | null {
  const provider = detectProvider(text);

  let match = text.match(
    /Supply\s+Address\s*:?\s*([^\n]+)(?:\n([^\n:]+))?(?=\s*(?:Mobile|Tel|Email|Tariff|CA\s*No|District|Energisation|Sanctioned|Contract|Pole|Meter|MDI|M\s+D\s+I))/i,
  );
  if (match) {
    let addr = match[1].trim();
    if (match[2] && !match[2].includes(":")) addr += " " + match[2].trim();
    addr = addr.replace(/\s+/g, " ").trim();
    if (provider.includes("BSES")) {
      const pincodeMatch = addr.match(/(.*?\d{6})/);
      if (pincodeMatch) addr = pincodeMatch[1];
    }
    addr = addr.replace(/[,;:\s]+$/, "");
    if (/(?:Same|As\s+Above|--|Ditto)/i.test(addr)) return billingAddress;
    addr = removeDuplicateWords(addr);
    if (addr.length > 5) return addr;
  }

  match = text.match(/Supply\s+Address\s*:?\s*\n([^\n:]+)(?=\n[A-Z][a-z]+\s*:|\n{2,})/i);
  if (match) {
    let addr = match[1].replace(/\s+/g, " ").trim();
    if (provider.includes("BSES")) {
      const pincodeMatch = addr.match(/(.*?\d{6})/);
      if (pincodeMatch) addr = pincodeMatch[1];
    }
    if (/(?:Same|As\s+Above|--|Ditto)/i.test(addr)) return billingAddress;
    addr = removeDuplicateWords(addr);
    if (addr.length > 5) return addr;
  }

  return billingAddress;
}

function extractMobile(text: string): string | null {
  let match = text.match(/(?:Mobile|Tel|Phone|Contact)[^\d]*([X*\d]{6,})\/([X*\d]{6,})/i);
  if (match) {
    const num1 = match[1].replace(/[X*]/g, "").trim();
    const num2 = match[2].replace(/[X*]/g, "").trim();
    if (num1.length >= 4 && num2.length >= 4) return match[1] + "/" + match[2];
    return num1.length > num2.length ? match[1] : match[2];
  }

  match = text.match(/(?:Mobile|Tel|Phone|Contact)[^\d]*([+\d*X\s\-()]{10,20})/i);
  if (match) {
    const cleaned = match[1].trim();
    if (/\d{4,}/.test(cleaned)) return cleaned;
  }

  match = text.match(/\b[6-9]\d{9}\b/);
  if (match) return match[0];

  match = text.match(/[X*\d]{4,}\d{4}/);
  if (match) return match[0];

  return null;
}

function extractEmail(text: string): string | null {
  const match = text.match(/([a-zA-Z0-9._%+\-*]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
  return match ? match[1].replace(/\*/g, "x") : null;
}

function extractCANumber(text: string): string | null {
  const match = text.match(/CA\s*No\.?\s*:?\s*(\d{10,15})/i);
  return match ? match[1] : null;
}

function extractSanctionedLoad(text: string): number | null {
  const patterns = [
    /([\d.]+)\s*\/\s*Sanctioned\s+Load\s*\((?:KW|kW)\/(?:KVA|kVA)\)/i,
    /Sanctioned\s+Load\s*\((?:KW|kW)\/(?:KVA|kVA)\)\s*([\d.]+)\s*\//i,
    /Sanctioned\s+Load\s*:?\s*([\d.]+)\s*\((?:kVA|KVA|kW|KW)\)/i,
    /Sanctioned\s+Load\s*\((?:KW|kW)\/(?:KVA|kVA)\)\s*([\d.]+)(?:\s+(?:Contract|Pole|Meter|MDI|Tariff)|$|\n)/i,
    /Sanctioned\s+Load\s*:?\s*([\d.]+)(?:\s+(?:kW|KW|kVA|KVA)|$|\n)/i,
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (match) {
      const value = parseFloat(match[1]);
      if (value >= 0.5 && value <= 100) return value;
    }
  }
  return null;
}

function extractPhase(text: string): string | null {
  if (/3\s*Phase|Three\s*Phase/i.test(text)) return "3 Phase";
  if (/Single\s*Phase|1\s*Phase/i.test(text)) return "Single";
  const sanctionedLoad = extractSanctionedLoad(text);
  if (sanctionedLoad !== null) return sanctionedLoad > 10 ? "3 Phase" : "Single";
  return null;
}

function extractMDI(text: string): number | null {
  let match = text.match(/M\s+D\s+I\s*(?:KW|kW)?\s*:?\s*([\d.]+)/i);
  if (match) return parseFloat(match[1]);
  match = text.match(/MDI\s*(?:KW|kW)?\s*:?\s*([\d.]+)/i);
  if (match) return parseFloat(match[1]);
  match = text.match(/(?:M\s+D\s+I|MDI)\s*:?\s*([\d.]+)\s*\(k[VW]A?\)/i);
  if (match) return parseFloat(match[1]);
  return null;
}

function extractTariffCategory(text: string): string | null {
  const match = text.match(/Tariff\s+Category\s*:?\s*([^\n]+)/i);
  return match ? match[1].trim() : null;
}

function extractEnergisationDate(text: string): string | null {
  const match = text.match(/Energisation\s+Date\s*:?\s*([\d/.\-]+)/i);
  return match ? match[1] : null;
}

function extractLast6MonthsBills(text: string): BillHistoryEntry[] {
  const bills: BillHistoryEntry[] = [];
  const provider = detectProvider(text);

  if (provider.includes("BSES")) {
    const periodTableMatch = text.match(
      /(?:Period|Month|Billing\s+Period|Reading\s+Period)[\s\S]{0,1500}?(?=\n\s*\n|Total|NOTE|IMPORTANT)/i,
    );

    if (periodTableMatch) {
      const tableData = periodTableMatch[0];

      const monthPattern = /(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\s\-]\d{2,4}\s+(\d{2,4})\s+(\d{3,6}(?:\.\d{2})?)/gi;
      const monthMatches = [...tableData.matchAll(monthPattern)];
      if (monthMatches.length > 0) {
        monthMatches.forEach((match, index) => {
          bills.push({
            period: `Month ${index + 1}`,
            days: null,
            units: parseInt(match[1]),
            amount: parseFloat(match[2]),
            basis: "Actual",
          });
        });
        return bills;
      }

      const datePattern = /(\d{2}[/\-]\d{2}[/\-]\d{2,4})\s+(?:to\s+)?(\d{2}[/\-]\d{2}[/\-]\d{2,4})?\s+(\d{2,4})\s+(\d{3,6}(?:\.\d{2})?)/gi;
      const dateMatches = [...tableData.matchAll(datePattern)];
      if (dateMatches.length > 0) {
        dateMatches.forEach((match) => {
          bills.push({
            period: match[2] ? `${match[1]} to ${match[2]}` : match[1],
            days: null,
            units: parseInt(match[3]),
            amount: parseFloat(match[4]),
            basis: "Actual",
          });
        });
        return bills;
      }
    }

    const amountMatch = text.match(/(?:Current\s+Charges?|Total\s+Amount\s+Payable|Bill\s+Amount)\s*:?\s*(?:Rs\.?|₹)?\s*([\d,]+\.?\d*)/i);
    const unitsMatch = text.match(/(?:Units\s+Consumed|Consumption|Total\s+Units)\s*:?\s*([\d,]+)/i);
    if (amountMatch || unitsMatch) {
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : null;
      const units = unitsMatch ? parseInt(unitsMatch[1].replace(/,/g, "")) : null;
      if (amount || units) {
        bills.push({ period: "Current Month", days: null, units, amount, basis: "Actual" });
      }
    }
    return bills;
  }

  const tpddlHeaderMatch = text.match(
    /Billing\s+Period\s+Days\s+Units\s+(?:Total\s+)?Amount\s+Payable\s+Bill\s+Basis([\s\S]{0,2000}?)(?=\n\s*\n|Tariff|NOTE|IMPORTANT)/i,
  );
  if (tpddlHeaderMatch) {
    const tableData = tpddlHeaderMatch[1];
    const actualMatches = [...tableData.matchAll(/Actual\s+(\d{2,5})/gi)];
    const units = actualMatches.map((m) => parseInt(m[1]));
    const amountMatches = [...tableData.matchAll(/(\d{3,6}\.\d{2})/g)];
    const amounts = amountMatches.map((m) => parseFloat(m[1])).filter((amt) => amt > 100 && amt < 100000);
    const periodMatches = [...tableData.matchAll(/(\d{2}\/\d{2}\/\d{2})\s+to\s+(\d{2}\/\d{2}\/\d{2})/gi)];
    const periods = periodMatches.map((m) => `${m[1]} to ${m[2]}`);

    const count = Math.min(units.length, amounts.length);
    for (let i = 0; i < count; i++) {
      bills.push({ period: periods[i] || `Month ${i + 1}`, units: units[i], amount: amounts[i], basis: "Actual" });
    }
    if (bills.length > 0) return bills.slice(0, 7);
  }

  const tableHeaderMatch = text.match(/Billing\s+Period.*?Days.*?Units.*?Bill\s+Basis.*?(?:Total\s+Amount|Amount\s+Payable)/is);
  if (tableHeaderMatch) {
    const rowPattern = /(\d{2}\/\d{2}\/\d{2})\s+to\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{1,3})\s+(\d{2,5})\s+(Actual|Estimated)\s+([\d,]+\.?\d{0,2})/gi;
    const rows = [...text.matchAll(rowPattern)];
    rows.forEach((row) => {
      const days = parseInt(row[3]);
      const units = parseInt(row[4]);
      const amount = parseFloat(row[6].replace(/,/g, ""));
      if (amount > 100 && amount < 100000 && units > 0 && units < 10000) {
        bills.push({ period: `${row[1]} to ${row[2]}`, days, units, basis: row[5], amount });
      }
    });
    if (bills.length > 0) return bills.slice(0, 7);
  }

  if (bills.length === 0) {
    const flexiblePattern = /(\d{2}\/\d{2}\/\d{2})\s+to\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{1,3})\s+(\d{2,5})\s+\w+\s+([\d,]+\.?\d{0,2})/gi;
    const flexRows = [...text.matchAll(flexiblePattern)];
    flexRows.forEach((row) => {
      const days = parseInt(row[3]);
      const units = parseInt(row[4]);
      const amount = parseFloat(row[5].replace(/,/g, ""));
      if (amount > 100 && amount < 100000 && units > 0 && units < 10000) {
        bills.push({ period: `${row[1]} to ${row[2]}`, days, units, amount });
      }
    });
    if (bills.length > 0) return bills.slice(0, 7);
  }

  const months = [...text.matchAll(/(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-\d{2}/gi)].map((m) => m[0]);
  if (months.length >= 3) {
    const monthsSection = text.substring(text.indexOf(months[0]));
    const amounts = [...monthsSection.matchAll(/\b(\d{3,6})\.\d{2}\b/g)]
      .map((m) => parseFloat(m[0]))
      .filter((amt) => amt > 100 && amt < 100000);
    for (let i = 0; i < Math.min(months.length, amounts.length, 7); i++) {
      bills.push({ month: months[i], amount: amounts[i] });
    }
  }

  const billingMatches = [
    ...text.matchAll(/(\d{2}\/\d{2}\/\d{2})\s+to\s+(\d{2}\/\d{2}\/\d{2})\s+(\d+)\s+(\d+)\s+\w+\s+([\d,]+\.\d{2})/g),
  ];
  billingMatches.forEach((match) => {
    bills.push({
      period: `${match[1]} to ${match[2]}`,
      units: parseInt(match[4]),
      amount: parseFloat(match[5].replace(/,/g, "")),
    });
  });

  const tableMatches = [
    ...text.matchAll(/(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\s\-]\d{2,4}\s+(\d{2,4})\s+([\d,]+\.\d{2})/gi),
  ];
  tableMatches.forEach((match) => {
    const amount = parseFloat(match[2].replace(/,/g, ""));
    if (amount > 100 && amount < 100000) bills.push({ units: parseInt(match[1]), amount });
  });

  const historyMatch = text.match(/(?:Consumption\s+History|Bill\s+History|Payment\s+History)(.*?)(?=\n\s*\n|Tariff|Total|Current)/is);
  if (historyMatch && bills.length === 0) {
    const historyMatches = [
      ...historyMatch[1].matchAll(/((?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\s\-]\d{2,4})[\s\S]*?([\d,]{3,6}\.\d{2})/gi),
    ];
    historyMatches.forEach((match) => {
      const amount = parseFloat(match[2].replace(/,/g, ""));
      if (amount > 100 && amount < 100000) bills.push({ month: match[1].trim(), amount });
    });
  }

  if (bills.length === 0) {
    const nearMatches = [
      ...text.matchAll(/(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\s\-]\d{2,4}.*?([\d,]{3,6}\.\d{2})/gi),
    ];
    nearMatches.forEach((match) => {
      const amount = parseFloat(match[1].replace(/,/g, ""));
      if (amount > 100 && amount < 100000) bills.push({ amount });
    });
  }

  return bills.slice(0, 7);
}

function parseBillData(text: string): ExtractedBillData {
  const address = extractAddress(text);
  return {
    customerName: extractName(text),
    address,
    supplyAddress: extractSupplyAddress(text, address),
    mobile: extractMobile(text),
    email: extractEmail(text),
    caNumber: extractCANumber(text),
    sanctionedLoad: extractSanctionedLoad(text),
    phase: extractPhase(text),
    mdi: extractMDI(text),
    tariffCategory: extractTariffCategory(text),
    energisationDate: extractEnergisationDate(text),
    last6MonthsBills: extractLast6MonthsBills(text),
    provider: detectProvider(text),
  };
}

export async function extractBillFromFile(file: File): Promise<ExtractedBillData> {
  const text = await extractTextFromPDF(file);
  return parseBillData(text);
}

export function calculateAverageConsumption(billData: ExtractedBillData): number | null {
  if (!billData.last6MonthsBills.length) return null;
  const total = billData.last6MonthsBills.reduce((sum, bill) => sum + (bill.amount ?? 0), 0);
  return Math.round(total / billData.last6MonthsBills.length);
}

export function calculateAverageUnits(billData: ExtractedBillData): number | null {
  const billsWithUnits = billData.last6MonthsBills.filter((bill) => bill.units);
  if (!billsWithUnits.length) return null;
  const total = billsWithUnits.reduce((sum, bill) => sum + (bill.units ?? 0), 0);
  return Math.round(total / billsWithUnits.length);
}

export function suggestSystemSize(billData: ExtractedBillData): SystemSizeSuggestion | null {
  const avgBill = calculateAverageConsumption(billData);
  if (!avgBill) return null;
  const recommendedKW = Math.ceil(avgBill / 800);
  return { minKW: Math.max(1, recommendedKW - 1), maxKW: recommendedKW + 1, recommendedKW };
}
