// Nút Feedback dùng chung cho toolbar panel chính + footer sidebar — 1 kiểu
// duy nhất (icon 💬 vẽ SVG + chữ "Feedback") để user nhận ra ở mọi nơi.

export function FeedbackButton({ onClick }: { onClick(): void }) {
  return (
    <button
      className="sg-toolbar-btn"
      title="Góp ý / báo lỗi — gửi thẳng vào group Telegram của team"
      onClick={onClick}
    >
      <FeedbackIcon />
      <span>Feedback</span>
    </button>
  );
}

/** Bong bóng thoại — góp ý/báo lỗi. */
function FeedbackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M13.5 3.5v6a1.5 1.5 0 0 1-1.5 1.5H7l-3.5 2.5V11H4a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 4 2h8a1.5 1.5 0 0 1 1.5 1.5Z" />
    </svg>
  );
}
