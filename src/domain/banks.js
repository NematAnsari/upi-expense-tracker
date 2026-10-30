// Banks the app can name from a payment message.
//
// Each bank is matched by its SMS sender ID (the title, e.g. "JD-KOTAKB-S")
// or by its name in the message text. Detection works for every bank; this
// list only decides the label ("PNB ••1234" instead of "Account ••1234").
//
// When several banks match, the longest match wins (see findBank), so a name
// that contains another bank's name ("City Union Bank", "South Indian Bank",
// "State Bank of India") is still recognised correctly. The list order is
// just for reading.
//
// Sender IDs differ by region and change over time; the ones here are common
// published ones and may not cover every variant. The bank's name in the text
// is the fallback.

export const BANKS = [
  // Public sector banks
  // "SBIUPI", "SBIINB" and "ATMSBI" style sender IDs, or "-SBI" at the end of the text.
  // Full names are listed so they are longer than "Bank of India" (the longest match wins).
  {
    name: 'State Bank of India',
    short: 'SBI',
    patterns: [/\bSBI[A-Z]*\b/, /SBI\b/, /\bstate bank of india\b/i, /\bstate bank\b/i],
  },
  {
    name: 'Union Bank of India',
    short: 'Union',
    patterns: [/\bUNIONB[A-Z]*\b/, /\bunion bank of india\b/i, /\bunion bank\b/i],
  },
  { name: 'Central Bank of India', short: 'Central', patterns: [/\bCENTBK\b/, /\bcentral bank of india\b/i] },
  {
    name: 'Punjab National Bank',
    short: 'PNB',
    patterns: [/\bPNB[A-Z]*\b/, /\bPUNBNK\b/, /\bpunjab national bank\b/i],
  },
  { name: 'Punjab & Sind Bank', short: 'PSB', patterns: [/\bPSBANK\b/, /\bpunjab (?:&|and) sind bank\b/i] },
  { name: 'Bank of Baroda', short: 'BOB', patterns: [/\bBOB[A-Z]*\b/, /\bbank of baroda\b/i] },
  { name: 'Bank of Maharashtra', short: 'BoM', patterns: [/\bMAHABK\b/, /\bbank of maharashtra\b/i] },
  { name: 'Bank of India', short: 'BOI', patterns: [/\bBOIIND\b/i, /-BOI\b/, /\bbank of india\b/i] },
  { name: 'Canara Bank', short: 'Canara', patterns: [/\bCANBNK\b/, /\bcanara bank\b/i] },
  { name: 'Indian Overseas Bank', short: 'IOB', patterns: [/\bIOB[A-Z]*\b/, /\bindian overseas bank\b/i] },
  { name: 'Indian Bank', short: 'Indian Bank', patterns: [/\bINDBNK\b/, /\bindian bank\b/i] },
  { name: 'UCO Bank', short: 'UCO', patterns: [/\bUCOBNK\b/, /\buco bank\b/i] },
  { name: 'IDBI Bank', short: 'IDBI', patterns: [/idbi/i] },

  // Private banks
  { name: 'HDFC Bank', short: 'HDFC', patterns: [/hdfc/i] },
  { name: 'ICICI Bank', short: 'ICICI', patterns: [/icici/i] },
  { name: 'Axis Bank', short: 'Axis', patterns: [/\bAXISBK\b/i, /\baxis\s*bank\b/i] },
  { name: 'Kotak Mahindra Bank', short: 'Kotak', patterns: [/kotak/i] },
  { name: 'IndusInd Bank', short: 'IndusInd', patterns: [/\bINDUSB\b/, /\bindusind\b/i] },
  { name: 'Yes Bank', short: 'Yes Bank', patterns: [/\bYESBNK\b/, /\bYESBK\b/, /\byes bank\b/i] },
  { name: 'IDFC First Bank', short: 'IDFC First', patterns: [/idfc/i] },
  { name: 'Federal Bank', short: 'Federal', patterns: [/\bFEDBNK\b/, /\bfederal bank\b/i] },
  { name: 'RBL Bank', short: 'RBL', patterns: [/\bRBLBNK\b/, /\brbl bank\b/i] },
  { name: 'Bandhan Bank', short: 'Bandhan', patterns: [/bandhan/i] },
  { name: 'South Indian Bank', short: 'SIB', patterns: [/\bSIBSMS\b/, /\bsouth indian bank\b/i] },
  { name: 'Karnataka Bank', short: 'Karnataka', patterns: [/\bKBLBNK\b/, /\bkarnataka bank\b/i] },
  { name: 'Karur Vysya Bank', short: 'KVB', patterns: [/\bKVBANK\b/, /\bkarur vysya\b/i] },
  { name: 'City Union Bank', short: 'CUB', patterns: [/\bCUBANK\b/, /\bcity union bank\b/i] },

  // Small finance banks
  { name: 'AU Small Finance Bank', short: 'AU', patterns: [/\bAUBANK\b/, /\bau small finance\b/i] },
  { name: 'Equitas Small Finance Bank', short: 'Equitas', patterns: [/equitas/i] },
  { name: 'Ujjivan Small Finance Bank', short: 'Ujjivan', patterns: [/ujjivan/i] },

  // Payments banks (only their bank messages, not the UPI apps with the same brand)
  { name: 'Paytm Payments Bank', short: 'Paytm PB', patterns: [/\bPAYTMB\b/, /\bpaytm payments bank\b/i] },
  { name: 'Airtel Payments Bank', short: 'Airtel PB', patterns: [/\bAIRBNK\b/, /\bairtel payments bank\b/i] },
  { name: 'India Post Payments Bank', short: 'IPPB', patterns: [/\bIPPB[A-Z]*\b/, /\bindia post payments bank\b/i] },
  { name: 'Jio Payments Bank', short: 'Jio PB', patterns: [/\bjio payments bank\b/i] },
  { name: 'Fino Payments Bank', short: 'Fino PB', patterns: [/\bfino\b/i] },

  // Foreign banks in India
  { name: 'Standard Chartered', short: 'SC', patterns: [/\bSCBANK\b/, /\bstandard chartered\b/i] },
  { name: 'HSBC', short: 'HSBC', patterns: [/hsbc/i] },
  { name: 'DBS Bank', short: 'DBS', patterns: [/\bDBSBNK\b/, /\bdbs bank\b/i] },
  { name: 'Citibank', short: 'Citi', patterns: [/\bCITIBK\b/, /\bcitibank\b/i] },
];

// UPI IDs like "shop@kotak" name the other person's bank, not yours, so they are ignored.
const UPI_ID = /[\w.-]+@[a-z][a-z0-9]*/gi;

/** Length of the longest match of any of the bank's patterns in `source` (0 if none). */
function matchLength(bank, source) {
  return Math.max(0, ...bank.patterns.map((pattern) => source.match(pattern)?.[0].length ?? 0));
}

/**
 * The bank a message came from, or null. Checks the sender ID first, then the text.
 * When several banks match, the longest match wins, so "City Union Bank" is not
 * mistaken for "Union Bank" and "State Bank of India" not for "Bank of India".
 */
export function findBank(title, text) {
  const textWithoutUpiIds = String(text ?? '').replace(UPI_ID, ' ');
  for (const source of [String(title ?? ''), textWithoutUpiIds]) {
    let best = null;
    let bestLength = 0;
    for (const bank of BANKS) {
      const length = matchLength(bank, source);
      if (length > bestLength) {
        best = bank;
        bestLength = length;
      }
    }
    if (best) {
      return best;
    }
  }
  return null;
}
