// Popup Pull: chọn cách hoà remote vào local (merge / rebase / ff-only) rồi
// OK/Cancel — lựa chọn được nhớ qua localStorage cho lần pull sau.

import type { PullMode } from '../../shared/types';
import { ChoiceDialog, type Choice } from './ChoiceDialog';

const STORAGE_KEY = 's-git.pullMode';

const CHOICES: Choice<PullMode>[] = [
  {
    value: 'merge',
    label: 'Merge',
    detail: 'git pull --no-rebase — hoà commit remote vào nhánh hiện tại (merge commit nếu phân kỳ)',
  },
  {
    value: 'rebase',
    label: 'Rebase',
    detail: 'git pull --rebase — đặt lại commit local lên trên commit remote, lịch sử thẳng',
  },
  {
    value: 'ff-only',
    label: 'Fast-Forward Only',
    detail: 'git pull --ff-only — chỉ tiến HEAD; nhánh phân kỳ thì từ chối, không đụng gì',
  },
];

/** Lựa chọn lần trước (mặc định merge — hành vi git quen thuộc nhất). */
function loadMode(): PullMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'merge' || raw === 'rebase' || raw === 'ff-only') {
      return raw;
    }
  } catch {
    // localStorage không khả dụng — dùng default
  }
  return 'merge';
}

interface Props {
  /** Nhánh hiện tại — chỉ để hiển thị. */
  currentBranch: string | null;
  onSubmit(mode: PullMode): void;
  onClose(): void;
}

export function PullDialog({ currentBranch, onSubmit, onClose }: Props) {
  return (
    <ChoiceDialog
      title="Pull"
      description={
        <>
          Pull into <b>{currentBranch ?? '(detached HEAD)'}</b>
        </>
      }
      choices={CHOICES}
      initialValue={loadMode()}
      actionLabel="Pull"
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
