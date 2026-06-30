import {
  extractSentenceTargetFromNode,
  isIgnoredElement,
  type SentenceTarget,
} from './text-segmentation';

interface LegacyPointDocument {
  caretRangeFromPoint?(x: number, y: number): Range | null;
}

export function targetAtPoint(x: number, y: number): SentenceTarget | null {
  const element = document.elementFromPoint(x, y);

  if (!element || isIgnoredElement(element)) {
    return null;
  }

  const legacyDocument = document as Document & LegacyPointDocument;
  const position = document.caretPositionFromPoint?.(x, y);
  const range = position
    ? null
    : legacyDocument.caretRangeFromPoint?.(x, y);
  const node = position?.offsetNode ?? range?.startContainer;
  const offset = position?.offset ?? range?.startOffset;

  if (
    !(node instanceof Text)
    || offset === undefined
    || !node.textContent
  ) {
    return null;
  }

  if (node.parentElement && isIgnoredElement(node.parentElement)) {
    return null;
  }

  return extractSentenceTargetFromNode(node, offset);
}
