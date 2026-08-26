// Dựng unified diff patch cho ĐÚNG 1 hunk từ Monaco ILineChange — nền của
// stage-theo-hunk (spec 2.1: chức năng đinh P1). Host sẽ `git apply --cached`.
//
// Quy ước số dòng của Monaco ILineChange:
//  - originalEndLineNumber === 0  → chèn thuần: dòng mới nằm SAU dòng
//    originalStartLineNumber của bản gốc (0 = chèn đầu file).
//  - modifiedEndLineNumber === 0  → xoá thuần, đối xứng như trên.
// Các số còn lại là 1-based, inclusive.

export interface LineChange {
  originalStartLineNumber: number;
  originalEndLineNumber: number;
  modifiedStartLineNumber: number;
  modifiedEndLineNumber: number;
}

export interface HunkPatchInput {
  path: string;
  /** Nội dung phía gốc của diff (với stage-hunk là bản trong index). */
  originalText: string;
  /** Nội dung phía sửa (bản working tree). */
  modifiedText: string;
  change: LineChange;
  /** Số dòng ngữ cảnh quanh hunk; 3 là chuẩn của git. */
  contextLines?: number;
}

const NO_NEWLINE_MARKER = '\\ No newline at end of file';

export function buildHunkPatch(input: HunkPatchInput): string {
  const context = input.contextLines ?? 3;
  const orig = splitLines(input.originalText);
  const mod = splitLines(input.modifiedText);
  const change = input.change;

  const oCount =
    change.originalEndLineNumber === 0
      ? 0
      : change.originalEndLineNumber - change.originalStartLineNumber + 1;
  const mCount =
    change.modifiedEndLineNumber === 0
      ? 0
      : change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;

  // Chỉ số 0-based của dòng đầu vùng đổi; với chèn/xoá thuần đây là "điểm chèn"
  // (số dòng đứng TRƯỚC nó — trùng semantics của Monaco).
  const oFirst = oCount > 0 ? change.originalStartLineNumber - 1 : change.originalStartLineNumber;
  const mFirst = mCount > 0 ? change.modifiedStartLineNumber - 1 : change.modifiedStartLineNumber;

  const ctxBeforeCount = Math.min(context, oFirst);
  const afterStart = oFirst + oCount;
  const ctxAfterCount = Math.min(context, orig.lines.length - afterStart);

  const ctxBefore = orig.lines.slice(oFirst - ctxBeforeCount, oFirst);
  const removed = orig.lines.slice(oFirst, oFirst + oCount);
  const added = mod.lines.slice(mFirst, mFirst + mCount);
  const ctxAfter = orig.lines.slice(afterStart, afterStart + ctxAfterCount);

  const oHeaderCount = ctxBeforeCount + oCount + ctxAfterCount;
  const mHeaderCount = ctxBeforeCount + mCount + ctxAfterCount;
  // Khi count = 0, start theo convention của git là số dòng đứng trước (0 hợp lệ).
  const oHeaderStart = oHeaderCount === 0 ? oFirst : oFirst - ctxBeforeCount + 1;
  const mHeaderStart = mHeaderCount === 0 ? mFirst : mFirst - ctxBeforeCount + 1;

  const body: string[] = [];
  for (const line of ctxBefore) {
    body.push(` ${line}`);
  }
  for (const [i, line] of removed.entries()) {
    body.push(`-${line}`);
    // Dòng cuối của bản gốc không có newline cuối file → phải đánh dấu,
    // git apply mới khớp nội dung.
    if (!orig.endsWithNewline && oFirst + i === orig.lines.length - 1) {
      body.push(NO_NEWLINE_MARKER);
    }
  }
  for (const [i, line] of added.entries()) {
    body.push(`+${line}`);
    if (!mod.endsWithNewline && mFirst + i === mod.lines.length - 1) {
      body.push(NO_NEWLINE_MARKER);
    }
  }
  for (const [i, line] of ctxAfter.entries()) {
    body.push(` ${line}`);
    if (!orig.endsWithNewline && afterStart + i === orig.lines.length - 1) {
      body.push(NO_NEWLINE_MARKER);
    }
  }

  return [
    `diff --git a/${input.path} b/${input.path}`,
    `--- a/${input.path}`,
    `+++ b/${input.path}`,
    `@@ -${oHeaderStart},${oHeaderCount} +${mHeaderStart},${mHeaderCount} @@`,
    ...body,
    '', // patch phải kết thúc bằng newline
  ].join('\n');
}

function splitLines(text: string): { lines: string[]; endsWithNewline: boolean } {
  if (text === '') {
    return { lines: [], endsWithNewline: true };
  }
  const endsWithNewline = text.endsWith('\n');
  const lines = text.split('\n');
  if (endsWithNewline) {
    lines.pop(); // phần tử rỗng sau newline cuối
  }
  return { lines, endsWithNewline };
}
