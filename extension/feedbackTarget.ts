// ┌──────────────────────────────────────────────────────────────────────────┐
// │  ĐÍCH TELEGRAM NHẬN FEEDBACK — SỬA 3 GIÁ TRỊ DƯỚI ĐÂY RỒI BUILD LẠI.     │
// │  Fix cứng trong bundle; người dùng cuối không đổi được (không có setting).│
// └──────────────────────────────────────────────────────────────────────────┘
//
// Lấy giá trị ở đâu:
//  • BOT_TOKEN — chat với @BotFather → /newbot → copy token dạng `123456:AA…`.
//  • CHAT_ID   — mời bot vào group, gửi 1 tin bất kỳ, rồi mở
//                https://api.telegram.org/bot<TOKEN>/getUpdates và lấy
//                `message.chat.id` (group là số ÂM, vd -1001234567890).
//  • THREAD_ID — chỉ khi group bật Topics: id của topic nhận feedback,
//                để '' nếu gửi vào luồng chung.
//
// Để trống thì nút Feedback vẫn hiện nhưng form báo "bản build chưa gắn
// Telegram" thay vì gửi vào hư không.

export const FEEDBACK_TARGET = {
  botToken: '8787262642:AAHBH7Sz0A0BwWmAuQS6OzyBDxnEAt7k98A',
  chatId: '-5560905969', 
  messageThreadId: '',
} as const;
