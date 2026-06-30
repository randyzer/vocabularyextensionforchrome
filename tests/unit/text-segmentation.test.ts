import { describe, expect, it } from 'vitest';
import {
  extractSentenceTarget,
  extractSentenceTargetFromNode,
  isIgnoredElement,
  normalizeSentence,
} from '../../src/content/text-segmentation';

describe('text segmentation', () => {
  it('keeps apostrophes and hyphens inside English words', () => {
    const text = "A well-known idea isn't automatically correct.";

    expect(
      extractSentenceTarget(text, text.indexOf('well-known') + 2)?.word,
    ).toBe('well-known');
    expect(
      extractSentenceTarget(text, text.indexOf("isn't") + 2)?.word,
    ).toBe("isn't");
  });

  it('returns the containing sentence and relative word offsets', () => {
    const text = 'First sentence. The proposal was ultimately rejected. Last.';
    const target = extractSentenceTarget(
      text,
      text.indexOf('ultimately') + 2,
    );

    expect(target).toEqual({
      word: 'ultimately',
      sentence: 'The proposal was ultimately rejected.',
      wordStart: 17,
      wordEnd: 27,
    });
  });

  it('extracts a complete sentence across nested inline elements', () => {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = (
      'The proposal was <strong>ultimately</strong> rejected.'
    );
    const node = paragraph.querySelector('strong')?.firstChild;

    expect(node).toBeInstanceOf(Text);
    expect(extractSentenceTargetFromNode(node as Text, 2)).toEqual({
      word: 'ultimately',
      sentence: 'The proposal was ultimately rejected.',
      wordStart: 17,
      wordEnd: 27,
    });
  });

  it('normalizes whitespace without changing semantic text', () => {
    expect(normalizeSentence('  The   proposal\nworked. ')).toBe(
      'The proposal worked.',
    );
  });

  it('ignores editable and code content', () => {
    for (const tag of ['input', 'textarea', 'select', 'pre', 'code']) {
      expect(isIgnoredElement(document.createElement(tag))).toBe(true);
    }

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    expect(isIgnoredElement(editable)).toBe(true);
  });

  it('does not treat HTML-like sentence text as markup', async () => {
    const { createHighlightedSentence } = await import(
      '../../src/sidepanel/components/capture-card'
    );
    const node = createHighlightedSentence('Use <script> safely', 4, 12);

    expect(node.querySelector('script')).toBeNull();
    expect(node.textContent).toBe('Use <script> safely');
    expect(node.querySelector('mark')?.textContent).toBe('<script>');
  });
});
