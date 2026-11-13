// Small text helpers used all over the app.

/** "1 entry", "3 entries". */
export function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/** No spaces at the ends and one space between words: " Rahul   Kumar " -> "Rahul Kumar". */
export function cleanName(name) {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** "Rahul Sharma" -> "RS". An empty name gives `fallback`. */
export function initials(name, fallback = '') {
  const letters = cleanName(name)
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return letters || fallback;
}
