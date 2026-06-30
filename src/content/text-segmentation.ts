export interface SentenceTarget {
  word: string;
  sentence: string;
  wordStart: number;
  wordEnd: number;
}

const WORD_PATTERN = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;
const IGNORED_TAGS = new Set([
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'PRE',
  'CODE',
  'SCRIPT',
  'STYLE',
]);

export function normalizeSentence(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function isIgnoredElement(element: Element): boolean {
  if (IGNORED_TAGS.has(element.tagName)) {
    return true;
  }

  if (
    element instanceof HTMLElement
    && (
      element.isContentEditable
      || element.getAttribute('contenteditable') === 'true'
      || element.getAttribute('contenteditable') === ''
    )
  ) {
    return true;
  }

  return element.closest(
    '[contenteditable="true"], [contenteditable=""]',
  ) !== null;
}

function sentenceBounds(text: string, offset: number): [number, number] {
  const segments = [
    ...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text),
  ];
  const segment = segments.find((candidate) => (
    offset >= candidate.index
    && offset < candidate.index + candidate.segment.length
  ));

  return segment
    ? [segment.index, segment.index + segment.segment.length]
    : [0, text.length];
}

export function extractSentenceTarget(
  text: string,
  offset: number,
): SentenceTarget | null {
  if (offset < 0 || offset >= text.length) {
    return null;
  }

  const matches = [...text.matchAll(WORD_PATTERN)];
  const match = matches.find((candidate) => {
    const start = candidate.index ?? -1;
    return offset >= start && offset < start + candidate[0].length;
  });

  if (!match || match.index === undefined || match[0].length === 1) {
    return null;
  }

  const [rawSentenceStart, rawSentenceEnd] = sentenceBounds(
    text,
    match.index,
  );
  const rawSentence = text.slice(rawSentenceStart, rawSentenceEnd);
  const leadingWhitespace = rawSentence.length - rawSentence.trimStart().length;
  const contentStart = rawSentenceStart + leadingWhitespace;
  const rawPrefix = text.slice(contentStart, match.index);
  const normalizedPrefix = rawPrefix.replace(/\s+/g, ' ');
  const sentence = normalizeSentence(rawSentence);
  const wordStart = normalizedPrefix.length;

  return {
    word: match[0],
    sentence,
    wordStart,
    wordEnd: wordStart + match[0].length,
  };
}

export function extractSentenceTargetFromNode(
  node: Text,
  nodeOffset: number,
): SentenceTarget | null {
  const block = node.parentElement?.closest(
    'p,li,blockquote,figcaption,h1,h2,h3,h4,h5,h6,td,th',
  ) ?? node.parentElement;

  if (!block) {
    return extractSentenceTarget(node.data, nodeOffset);
  }

  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(candidate) {
      const parent = candidate.parentElement;
      return (
        parent
        && !isIgnoredElement(parent)
        && candidate.textContent?.trim()
      )
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let combined = '';
  let combinedOffset = -1;

  for (
    let current = walker.nextNode();
    current;
    current = walker.nextNode()
  ) {
    if (current === node) {
      combinedOffset = combined.length + nodeOffset;
    }
    combined += `${current.textContent ?? ''} `;
  }

  return combinedOffset < 0
    ? null
    : extractSentenceTarget(combined.trimEnd(), combinedOffset);
}
