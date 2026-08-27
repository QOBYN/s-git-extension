// Dialog Reset (context menu History): reset nhánh hiện tại về commit đã chọn,
// 3 kiểu soft/mixed/hard — lựa chọn được nhớ qua localStorage cho lần sau.

import type { ResetMode } from '../../shared/types';
import { ChoiceDialog, type Choice } from './ChoiceDialog';

const STORAGE_KEY = 's-git.resetMode';

const CHOICES: Choice<ResetMode>[] = [
  {
    value: 'soft',
    label: 'Soft',
    detail: 'git reset --soft — giữ nguyên working tree + index; khác biệt thành staged',
  },
  {
    value: 'mixed',
    label: 'Mixed',
    detail: 'git reset --mixed — giữ working tree, reset index; khác biệt thành unstaged',
  },
  {
    value: 'hard',
    label: 'Hard',
    detail: 'git reset --hard — BỎ MỌI thay đổi local, working tree về đúng commit này',
    danger: true,
  },
];

/** Lựa chọn lần trước (mặc định mixed — hành vi mặc định của git reset). */
function loadMode(): ResetMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'soft' || raw === 'mixed' || raw === 'hard') {
      return raw;
    }
  } catch {
    // localStorage không khả dụng — dùng default
  }
  return 'mixed';
}

interface Props {
  /** Nhánh hiện tại (bị reset) — null = detached HEAD. */
  currentBranch: string | null;
  /** Commit đích (oid đầy đủ; hiển thị rút gọn). */
  oid: string;
  onSubmit(mode: ResetMode): void;
  onClose(): void;
}

export function ResetDialog({ currentBranch, oid, onSubmit, onClose }: Props) {
  return (
    <ChoiceDialog
      title="Reset"
      description={
        <>
          Reset <b>{currentBranch ?? '(detached HEAD)'}</b> to <b>{oid.slice(0, 7)}</b>
        </>
      }
      choices={CHOICES}
      initialValue={loadMode()}
      actionLabel="Reset"
      onSubmit={(mode) => {
        try {
          localStorage.setItem(STORAGE_KEY, mode);
        } catch {
          // không lưu được thì thôi
        }
        onSubmit(mode);
      }}
      onClose={onClose}
    />
  );
}
