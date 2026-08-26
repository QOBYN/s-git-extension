// Parser cho `git config -z --file .gitmodules --get-regexp ^submodule\..*\.path$`
// — cách đọc danh sách submodule an toàn nhất với path chứa khoảng trắng/ký tự lạ
// (không parse output `git submodule status` vốn không có separator rõ ràng).
// Định dạng -z: mỗi entry kết thúc NUL, key và value cách nhau 1 NEWLINE.

export function parseSubmodulePaths(stdout: string): string[] {
  const paths: string[] = [];
  for (const entry of stdout.split('\0')) {
    if (entry === '') {
      continue;
    }
    const newline = entry.indexOf('\n');
    if (newline === -1) {
      continue; // entry hỏng — bỏ qua
    }
    paths.push(entry.slice(newline + 1));
  }
  return paths.sort();
}
