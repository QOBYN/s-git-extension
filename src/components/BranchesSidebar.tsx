// Sidebar nhánh (ui-analysis B1): filter, Local Branches (gom nhóm prefix),
// từng remote 1 section, Tags. Nhánh hiện tại in đậm + ▶.
// Tương tác: click = lọc graph theo nhánh đó · double-click nhánh local = checkout ·
// click "All Branches" = bỏ lọc (--all).

import { useMemo, useState } from 'react';
import type { RefInfo } from '../../shared/types';
import { groupByPrefix, type RefGroup } from '../utils/refGroups';

interface Props {
  refs: RefInfo[];
  /** Bề rộng do user kéo splitter — layoutStore quản lý. */
  width: number;
  /** Ref đang lọc graph (null = mọi nhánh). */
  activeRef: string | null;
  onSelectRef(name: string | null): void;
  /** Double-click nhánh local — checkout. */
  onCheckout(name: string): void;
}

export function BranchesSidebar({ refs, width, activeRef, onSelectRef, onCheckout }: Props) {
  const [filter, setFilter] = useState('');

  const { localGroups, remoteSections, tags } = useMemo(() => {
    const needle = filter.toLowerCase();
    const visible = needle === '' ? refs : refs.filter((r) => r.name.toLowerCase().includes(needle));

    const locals = visible.filter((r) => r.kind === 'local');
    const tags = visible.filter((r) => r.kind === 'tag');

    // Remote: section theo tên remote (origin, upstream…), bỏ prefix remote khỏi tên hiển thị.
    const remoteSections = new Map<string, RefInfo[]>();
    for (const ref of visible.filter((r) => r.kind === 'remote')) {
      const slash = ref.name.indexOf('/');
      const remote = slash === -1 ? ref.name : ref.name.slice(0, slash);
      const list = remoteSections.get(remote);
      if (list) {
        list.push(ref);
      } else {
        remoteSections.set(remote, [ref]);
      }
    }

    return { localGroups: groupByPrefix(locals), remoteSections, tags };
  }, [refs, filter]);

  const rowProps = (ref: RefInfo) => ({
    onClick: () => onSelectRef(ref.name),
    onDoubleClick: ref.kind === 'local' ? () => onCheckout(ref.name) : undefined,
    selected: activeRef === ref.name,
  });

  return (
    <aside className="sg-branches" style={{ width }}>
      <input
        className="sg-filter-input"
        placeholder="Filter or Tag Search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <div
        className={`sg-branch-row all${activeRef === null ? ' selected' : ''}`}
        onClick={() => onSelectRef(null)}
        title="Show all branches + tags"
      >
        All Branches + Tags
      </div>

      <SectionHeader label="Local Branches" />
      {localGroups.map((group) => (
        <BranchGroup key={group.label ?? '(root)'} group={group} rowProps={rowProps} />
      ))}

      {[...remoteSections.entries()].map(([remote, members]) => (
        <div key={remote}>
          <SectionHeader label={remote} cloud />
          {members.map((ref) => (
            <BranchRow
              key={ref.fullName}
              refInfo={ref}
              display={ref.name.slice(remote.length + 1)}
              {...rowProps(ref)}
            />
          ))}
        </div>
      ))}

      {tags.length > 0 && (
        <>
          <SectionHeader label="Tags" />
          {tags.map((ref) => (
            <BranchRow key={ref.fullName} refInfo={ref} display={ref.name} {...rowProps(ref)} />
          ))}
        </>
      )}
    </aside>
  );
}

function SectionHeader({ label, cloud }: { label: string; cloud?: boolean }) {
  return (
    <div className="sg-branch-section">
      {cloud ? '☁ ' : ''}
      {label}
    </div>
  );
}

function BranchGroup({
  group,
  rowProps,
}: {
  group: RefGroup;
  rowProps(ref: RefInfo): {
    onClick(): void;
    onDoubleClick?: () => void;
    selected: boolean;
  };
}) {
  return (
    <div>
      {group.label !== null && <div className="sg-branch-group">{group.label}</div>}
      {group.refs.map((ref) => (
        <BranchRow
          key={ref.fullName}
          refInfo={ref}
          display={ref.name}
          indent={group.label !== null}
          {...rowProps(ref)}
        />
      ))}
    </div>
  );
}

function BranchRow({
  refInfo,
  display,
  indent,
  selected,
  onClick,
  onDoubleClick,
}: {
  refInfo: RefInfo;
  display: string;
  indent?: boolean;
  selected: boolean;
  onClick(): void;
  onDoubleClick?: () => void;
}) {
  return (
    <div
      className={`sg-branch-row${refInfo.isHead ? ' head' : ''}${indent ? ' indent' : ''}${selected ? ' selected' : ''}`}
      title={
        refInfo.kind === 'local'
          ? `${refInfo.fullName} — click: filter graph · double-click: checkout`
          : refInfo.fullName
      }
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {refInfo.isHead ? '▶ ' : ''}
      {display}
    </div>
  );
}
