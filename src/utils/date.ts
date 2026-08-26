// Hiển thị thời gian kiểu SmartGit: hôm nay giờ:phút, hôm qua "Yesterday hh:mm",
// cũ hơn thì ngày đầy đủ (ui-analysis B4: "09:00 AM", "Yesterday 10:32 PM"…).

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function formatRelativeDate(isoDate: string, now: Date = new Date()): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate; // dữ liệu lạ: hiển thị thô còn hơn sập
  }

  if (isSameDay(date, now)) {
    return timeFormat.format(date);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return `Yesterday ${timeFormat.format(date)}`;
  }
  return dateFormat.format(date);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
