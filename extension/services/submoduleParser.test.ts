import { describe, expect, it } from 'vitest';
import { parseSubmodulePaths } from './submoduleParser';

describe('parseSubmodulePaths', () => {
  it('parse nhiều submodule, sort theo path', () => {
    const out =
      'submodule.libs/core.path\nlibs/core\0' + 'submodule.vendor.path\nvendor/sdk\0';

    expect(parseSubmodulePaths(out)).toEqual(['libs/core', 'vendor/sdk']);
  });

  it('path chứa khoảng trắng không bị cắt (nhờ -z)', () => {
    const out = 'submodule.my lib.path\nlibs/my lib\0';
    expect(parseSubmodulePaths(out)).toEqual(['libs/my lib']);
  });

  it('output rỗng (không có submodule) trả mảng rỗng', () => {
    expect(parseSubmodulePaths('')).toEqual([]);
  });
});
