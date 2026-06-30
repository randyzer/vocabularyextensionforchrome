export function assertWordOffset(
  sentence: string,
  word: string,
  start: number,
  end: number,
): void {
  if (start < 0 || end <= start || end > sentence.length) {
    throw new Error('INVALID_WORD_OFFSET');
  }

  if (
    sentence.slice(start, end).toLocaleLowerCase()
    !== word.toLocaleLowerCase()
  ) {
    throw new Error('WORD_OFFSET_MISMATCH');
  }
}
