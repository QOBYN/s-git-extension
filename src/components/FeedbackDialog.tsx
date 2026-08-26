// Form góp ý — mở từ nút Feedback ở sidebar và ở toolbar panel chính.
// Nhận nội dung + đính kèm (chọn file, DÁN ảnh từ clipboard, kéo-thả), rồi nhờ
// host gửi vào group Telegram: đính kèm đi trước, message đi sau.
//
// Webview KHÔNG gọi mạng được (CSP `default-src 'none'`) — mọi thứ đi qua RPC.

import { useEffect, useRef, useState } from 'react';
import {
  FEEDBACK_MAX_ATTACHMENTS,
  FEEDBACK_MAX_ATTACHMENT_BYTES,
} from '../../shared/constants';
import type {
  FeedbackAttachment,
  FeedbackCategory,
  FeedbackContext,
  FeedbackResult,
} from '../../shared/types';
import { host } from '../rpc';
import {
  attachmentPreviewUrl,
  fileToAttachment,
  formatBytes,
  pastedImageName,
  screenFiles,
} from '../utils/attachments';

const CATEGORIES: Array<{ value: FeedbackCategory; label: string }> = [
  { value: 'bug', label: '🐞 Lỗi' },
  { value: 'idea', label: '💡 Ý tưởng' },
  { value: 'question', label: '❓ Hỏi đáp' },
  { value: 'other', label: '💬 Khác' },
];

/** edit → sending → sent (đóng sau 1 nhịp để user kịp thấy lời cảm ơn). */
type Phase = 'edit' | 'sending' | 'sent';

interface Props {
  context: FeedbackContext;
  onClose(): void;
  /** Báo ra ngoài để status bar/sidebar hiện "Đã gửi góp ý…". */
  onSent?(message: string): void;
}

export function FeedbackDialog({ context, onClose, onSent }: Props) {
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [title, setTitle] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<FeedbackAttachment[]>([]);
  const [phase, setPhase] = useState<Phase>('edit');
  const [error, setError] = useState<string | null>(null);
  /** File bị từ chối (quá lớn/quá số lượng) — nói ngay, đừng đợi lúc Send. */
  const [notes, setNotes] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    void host.isFeedbackConfigured().then(setConfigured);
  }, []);

  const addFiles = async (files: readonly File[]): Promise<void> => {
    if (files.length === 0) {
      return;
    }
    const { accepted, rejected } = screenFiles(files, attachments.length);
    const notes = [...rejected];
    const loaded: FeedbackAttachment[] = [];
    for (const file of accepted) {
      try {
        loaded.push(
          await fileToAttachment(
            file,
            // Ảnh dán từ clipboard hay có tên trống/"image.png" trùng nhau — đặt
            // lại theo giờ dán để trong group phân biệt được.
            file.name === '' || file.name === 'image.png'
              ? pastedImageName(file.type, new Date())
              : file.name,
          ),
        );
      } catch {
        // File đọc hỏng chỉ mất đúng file đó — không được làm sập cả form
        // (webview bắt unhandledrejection và phủ màn đỏ, xem src/main.tsx).
        notes.push(`Không đọc được ${file.name} — bỏ qua file này.`);
      }
    }
    setNotes(notes);
    setAttachments((prev) => [...prev, ...loaded]);
  };

  const onPaste = (event: React.ClipboardEvent) => {
    const files = [...event.clipboardData.files];
    if (files.length > 0) {
      event.preventDefault(); // đừng dán cả đường dẫn ảnh vào ô chữ
      void addFiles(files);
    }
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void addFiles([...event.dataTransfer.files]);
  };

  const canSend =
    phase === 'edit' && configured !== false && (message.trim() !== '' || title.trim() !== '');

  const send = async () => {
    if (!canSend) {
      return;
    }
    setPhase('sending');
    setError(null);
    setNotes([]);

    let result: FeedbackResult;
    try {
      result = await host.sendFeedback({
        category,
        title,
        message,
        contact,
        attachments,
        context,
      });
    } catch (rpcError) {
      // Kênh RPC hỏng (extension host restart, webview mất kết nối) — form quay
      // lại trạng thái sửa để user gửi lại, KHÔNG treo mãi ở "Đang gửi…".
      setError(`Không gửi được: ${String(rpcError)}`);
      setPhase('edit');
      return;
    }

    if (!result.ok) {
      setError(result.error);
      setPhase('edit');
      return;
    }
    setPhase('sent');
    // Đính kèm hỏng không tính là thất bại — message đã tới group rồi.
    if (result.skippedAttachments.length > 0) {
      setNotes([`Không gửi được đính kèm: ${result.skippedAttachments.join(', ')}`]);
    }
    onSent?.(
      result.sentAttachments > 0
        ? `Đã gửi góp ý kèm ${result.sentAttachments} đính kèm. Cảm ơn bạn!`
        : 'Đã gửi góp ý. Cảm ơn bạn!',
    );
    // File hỏng thì để user kịp đọc cảnh báo, đừng đóng vụt đi.
    setTimeout(onClose, result.skippedAttachments.length > 0 ? 3500 : 1200);
  };

  return (
    <div className="sg-menu-overlay center" onClick={phase === 'sending' ? undefined : onClose}>
      <div
        className="sg-modal feedback"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && phase !== 'sending') {
            onClose();
          }
          // ⌘/Ctrl+Enter gửi luôn — thói quen của mọi ô soạn nội dung.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            void send();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="sg-modal-title">Gửi góp ý cho S-Git</div>

        {configured === false && (
          <div className="sg-feedback-note warn">
            Bản build này chưa gắn group Telegram nhận feedback — báo người build điền
            token/chat id trong extension/feedbackTarget.ts.
          </div>
        )}

        {phase === 'sent' ? (
          <>
            <div className="sg-feedback-note ok">✅ Đã gửi. Cảm ơn góp ý của bạn!</div>
            {notes.map((note) => (
              <div className="sg-feedback-note warn" key={note}>
                {note}
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="sg-feedback-chips">
              {CATEGORIES.map((entry) => (
                <button
                  key={entry.value}
                  className={`sg-chip${category === entry.value ? ' active' : ''}`}
                  onClick={() => setCategory(entry.value)}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            <input
              ref={titleRef}
              className="sg-filter-input"
              placeholder="Tiêu đề ngắn gọn"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <textarea
              className="sg-feedback-text"
              placeholder="Mô tả chi tiết… (dán ảnh chụp màn hình thẳng vào đây)"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={onPaste}
            />

            <input
              className="sg-filter-input"
              placeholder="Liên hệ lại (tên / email / @telegram) — để trống là ẩn danh"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />

            <div className={`sg-feedback-drop${dragging ? ' dragging' : ''}`}>
              <button className="sg-banner-btn" onClick={() => fileInputRef.current?.click()}>
                📎 Đính kèm file
              </button>
              <span className="sg-feedback-hint">
                hoặc dán ảnh / kéo-thả vào form · tối đa {FEEDBACK_MAX_ATTACHMENTS} file,{' '}
                {formatBytes(FEEDBACK_MAX_ATTACHMENT_BYTES)}/file
              </span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  void addFiles([...(e.target.files ?? [])]);
                  e.target.value = ''; // chọn lại đúng file đó vẫn kích hoạt onChange
                }}
              />
            </div>

            {attachments.length > 0 && (
              <div className="sg-feedback-files">
                {attachments.map((attachment, index) => {
                  const preview = attachmentPreviewUrl(attachment);
                  return (
                    <div className="sg-feedback-file" key={`${attachment.name}-${index}`}>
                      {preview !== null ? (
                        <img className="sg-feedback-thumb" src={preview} alt={attachment.name} />
                      ) : (
                        <span className="sg-feedback-thumb doc">📄</span>
                      )}
                      <span className="sg-feedback-file-name" title={attachment.name}>
                        {attachment.name}
                      </span>
                      <span className="sg-feedback-hint">{formatBytes(attachment.size)}</span>
                      <button
                        className="sg-feedback-remove"
                        title="Bỏ file này"
                        onClick={() =>
                          setAttachments((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {notes.map((note) => (
              <div className="sg-feedback-note warn" key={note}>
                {note}
              </div>
            ))}
            {error !== null && <div className="sg-feedback-note error">{error}</div>}
          </>
        )}

        <div className="sg-modal-actions">
          <button className="sg-banner-btn" disabled={phase === 'sending'} onClick={onClose}>
            {phase === 'sent' ? 'Đóng' : 'Huỷ'}
          </button>
          {phase !== 'sent' && (
            <button
              className="sg-commit-btn"
              disabled={!canSend}
              title="Gửi (⌘/Ctrl + Enter)"
              onClick={() => void send()}
            >
              {phase === 'sending' ? 'Đang gửi…' : 'Gửi'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
