// Hằng số dùng chung 2 tầng. Giá trị user chỉnh được sẽ được nối vào
// VSCode settings (contributes.configuration, prefix "s-git.") ở tầng adapter —
// các giá trị ở đây chỉ là DEFAULT, không nơi nào khác được lặp lại con số này.

/** Số commit mỗi trang log — spec mục 6.3: 1.000 + "Load more". */
export const DEFAULT_LOG_PAGE_SIZE = 1_000;

/** Debounce cho watcher .git/ — đủ gom các thay đổi liên tiếp của 1 lệnh git. */
export const DEFAULT_GIT_WATCH_DEBOUNCE_MS = 300;

/** Chặn output git quá lớn làm nghẽn extension host (10 MB). */
export const DEFAULT_GIT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

/** Prefix mọi command/config/view id của extension. */
export const EXTENSION_ID_PREFIX = 's-git';

// ---- feedback ----

/**
 * Trần dung lượng 1 file đính kèm (10 MB) — đúng bằng giới hạn `sendPhoto` của
 * Telegram Bot API, và cũng là mức nội dung base64 còn đi lọt postMessage mượt.
 */
export const FEEDBACK_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Số file đính kèm tối đa mỗi lần gửi. */
export const FEEDBACK_MAX_ATTACHMENTS = 5;

/** Trần độ dài message của Telegram `sendMessage` — vượt thì cắt bớt phần mô tả. */
export const TELEGRAM_MAX_MESSAGE_CHARS = 4096;

/** Trần độ dài caption của `sendPhoto`/`sendDocument`. */
export const TELEGRAM_MAX_CAPTION_CHARS = 1024;
