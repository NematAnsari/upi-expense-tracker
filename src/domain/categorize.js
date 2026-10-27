// Suggests a category from the merchant or person's name using simple keywords.
// This is only a suggestion: the app cannot know why you paid someone, so
// payments to people or unknown shops are left as "Uncategorized".

export const UNCATEGORIZED = 'Uncategorized';
export const INCOME = 'Income';

const RULES = [
  {
    category: 'Petrol & Transport',
    keywords: [
      'petrol',
      'fuel',
      'hpcl',
      'bpcl',
      'iocl',
      'indian oil',
      'bharat petroleum',
      'hindustan petroleum',
      'shell',
      'uber',
      'ola',
      'rapido',
      'fastag',
      'parking',
      'metro',
    ],
  },
  {
    category: 'Groceries',
    keywords: [
      'dmart',
      'd-mart',
      'd mart',
      'bigbasket',
      'blinkit',
      'zepto',
      'grocer',
      'kirana',
      'supermarket',
      'reliance fresh',
      'more retail',
      'jiomart',
      'vegetable',
      'dairy',
      'milk',
    ],
  },
  {
    category: 'Food & Dining',
    keywords: [
      'swiggy',
      'zomato',
      'restaurant',
      'cafe',
      'dhaba',
      'bakery',
      'pizza',
      'burger',
      'kfc',
      'mcdonald',
      'domino',
      'tea',
      'chai',
      'food',
    ],
  },
  { category: 'Shopping', keywords: ['amazon', 'flipkart', 'myntra', 'meesho', 'ajio', 'nykaa', 'decathlon'] },
  {
    category: 'Bills & Utilities',
    keywords: [
      'airtel',
      'jio',
      'vodafone',
      'bsnl',
      'electricity',
      'power',
      'water',
      'gas',
      'broadband',
      'recharge',
      'bill',
      'tata play',
      'dth',
    ],
  },
  {
    category: 'Health',
    keywords: [
      'pharmacy',
      'medical',
      'chemist',
      'apollo',
      'medplus',
      'hospital',
      'clinic',
      'diagnostic',
      'lab',
      'netmeds',
      'pharmeasy',
      '1mg',
    ],
  },
  {
    category: 'Entertainment',
    keywords: ['netflix', 'hotstar', 'prime video', 'spotify', 'bookmyshow', 'pvr', 'inox'],
  },
  {
    category: 'Travel',
    keywords: ['irctc', 'makemytrip', 'goibibo', 'redbus', 'indigo', 'air india', 'oyo', 'cleartrip'],
  },
  {
    category: 'Education',
    keywords: ['school', 'college', 'university', 'tuition', 'academy', 'udemy', 'coursera', 'byju'],
  },
  { category: 'Personal Care', keywords: ['salon', 'parlour', 'parlor', 'spa', 'barber'] },
];

function containsKeyword(text, keyword) {
  // Whole-word match, so "ola" does not match "Cola" and "gas" does not match "Vegas".
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

/** Returns a category name. Credits are income; unknown payments are Uncategorized. */
export function suggestCategoryName(counterparty, direction) {
  if (direction === 'credit') {
    return INCOME;
  }
  const text = String(counterparty ?? '').toLowerCase();
  if (text) {
    const rule = RULES.find(({ keywords }) => keywords.some((keyword) => containsKeyword(text, keyword)));
    if (rule) {
      return rule.category;
    }
  }
  return UNCATEGORIZED;
}
