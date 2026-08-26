---
name: ai-native-sdlc
description: Triển khai vòng đời phát triển phần mềm AI-native (theo Anthropic AI-Native SDLC Playbook) khi bắt đầu build một product mới hoặc một feature mới. Dùng khi user muốn "khởi tạo lifecycle", "setup SDLC cho product mới", "bootstrap dự án theo AI-native", viết intent.md / spec.md / plan.md, setup CLAUDE.md, skills, hooks, REVIEW.md, evals, hoặc gọi /ai-native-sdlc.
---

# AI-Native SDLC — triển khai lifecycle cho product mới

Nguồn: Anthropic "The AI-Native SDLC Playbook" (claude.com/blog/the-ai-native-sdlc-playbook).

**Tư tưởng cốt lõi:** Code không còn là nút thắt cổ chai — Build sụp từ tuần xuống giờ, nên nút thắt dịch sang **requirements (Plan/Design), review (Test/Deploy), release (Deploy)**. SDLC không còn là đường thẳng mà là **vòng lặp** (Plan → Design → Build → Test → Deploy → Maintain → quay lại Plan), Claude ở tâm vòng lặp, con người đứng **trên** vòng lặp để khởi xướng, định hướng và quản trị.

**Chuỗi artifact — mỗi stage commit một artifact, stage sau đọc nó (đồng thời là audit trail):**

```
intent.md → spec.md → plan.md → PR diff + tests → incident record → intent.md mới (khép vòng)
```

## Cách dùng skill này

Xác định user đang ở mode nào rồi làm theo phần tương ứng. Đọc `references/playbook.md` để nắm chi tiết từng stage trước khi thực hiện; template có sẵn trong `templates/`.

### Mode A — Bootstrap product mới (setup một lần)

Khi user bắt đầu product/repo mới, scaffold theo thứ tự (theo dependency graph của playbook — chi tiết trong `references/playbook.md` mục "Thứ tự áp dụng"):

1. **Tạo cấu trúc thư mục artifact**: `docs/intents/`, `docs/specs/`, `docs/plans/`, `lessons/`.
2. **CLAUDE.md** (entry play): chạy `/init` hoặc tạo từ `templates/CLAUDE.md.template`. Giữ dưới 1 trang: Commands, Conventions, Architecture, Things Claude gets wrong, Verifying your work. Quy tắc sống: Claude sai 2 lần cùng một lỗi → đưa correction vào CLAUDE.md.
3. **Feedback loop** (entry play): gói toàn bộ test vào 1 lệnh (`make test` / `npm test`, exit non-zero khi fail), ghi vào mục Commands + "Verifying your work" của CLAUDE.md.
4. **Hooks** (entry play): copy `templates/hooks/production-gate.sh` và cấu hình `templates/settings.hooks.json` vào `.claude/settings.json`. Nguyên tắc: check nhẹ ở build-phase, check nặng ở commit/PR, approval gate ở deploy. Block phải tự giải thích (lý do + đường xin phê duyệt).
5. **Skills cho policy** (sau khi có CLAUDE.md): mỗi tri thức tổ chức cần enforce nhất quán (security, API convention, brand) → một skill riêng tại `.claude/skills/<name>/`. Xem ví dụ `templates/skill-secure-api-review.md`. Skill là advisory; policy bắt buộc phải backing bằng hook deterministic.
6. **REVIEW.md** (sau khi có Evals/Skills): tạo từ `templates/REVIEW.md` — định nghĩa các pass review (Bugs / Security / Compliance), ngưỡng Important vs Nit, cap 5 nits, loại trừ file generated.
7. **Evals trong CI** (khi đã ổn định): thu 20–50 task thực tế thành eval suite, chạy khi config agent (CLAUDE.md/skills/hooks) thay đổi; mỗi incident production → một eval vĩnh viễn.
8. **Monitoring bands** (muộn nhất): tạo `bands.yaml` từ `templates/bands.yaml` — detection deterministic, Claude chỉ được gọi khi band bị breach, tier quyết định quyền (1σ log, 2σ diagnose read-only, 3σ propose PR/runbook).

### Mode B — Chạy lifecycle cho một feature/ý tưởng (vòng lặp thường ngày)

**Stage 1 — Plan → `intent.md`**: Trò chuyện với user để làm rõ ý tưởng (đặt câu hỏi clarify), rồi viết `docs/intents/<slug>.md` theo `templates/intent.md`: Problem, Proposed outcome, Affected users and systems, Constraints, Open questions. User (product owner) duyệt → commit. Mục tiêu: từ conversation đến intent.md tính bằng **giờ, không phải tuần**.

**Stage 2 — Design → `spec.md`**: Load các policy skill của org, đọc intent.md đã duyệt, viết `docs/specs/<slug>.md` theo `templates/spec.md` — requirements + design gộp trong một phiên, ràng buộc bởi skills, **flag mọi concern** (security/compliance/UX) ngay lúc viết chứ không để review muộn phát hiện. User duyệt (tham vấn tech lead nếu rủi ro cao) → commit cạnh intent.md.

**Stage 3 — Build → `plan.md` rồi mới code**: **Không code khi chưa có plan được duyệt.** Vào plan mode (read-only), đọc spec.md, viết `docs/plans/<slug>.md` theo `templates/plan.md`: Files that change, Order of work, Risks, Proof. Mời user chất vấn plan ("cái gì có thể vỡ? bước nào rủi ro nhất?") đến khi bất kỳ engineer nào cũng implement được chỉ từ plan. Commit plan → implement. **Nếu implementation lệch plan, cập nhật plan.md trong cùng commit.** Task song song độc lập → tách git worktree; việc lặp lại trong phiên (verify, simplify, research) → subagent.

**Stage 4 — Test — mỗi phiên tự kiểm tra việc của mình**: Luôn chạy feedback loop (build + test + lint) và đạt target định lượng **trước khi** báo done, paste output. Bug fix: viết failing test tái hiện bug trước, confirm fail, commit test, rồi fix mà **không sửa test**. UI: khép loop bằng screenshot so với mock.

**Stage 5 — Deploy — review hai chiều, governance as code**: PR được Claude review theo REVIEW.md (mọi PR nhận pass review giống hệt nhau, xếp theo severity); con người tập trung vào intent và risk; branch protection vẫn yêu cầu code owner — **agent không được approve code của chính nó**. Finding bị flag 2 lần → correction vào CLAUDE.md. Deploy production đi qua hook gate (cần approval có tên); autonomy phân tầng theo môi trường: dev tự do, staging trung gian, production gated. Rollback là con đường được diễn tập nhiều nhất.

**Stage 6 — Maintain — khép vòng**: Monitoring deterministic phát hiện metric lệch band → Claude diagnose theo tier → viết finding thành `intent.md` mới đưa về Stage 1. Incident qua chat: triage, điều tra, xin phê duyệt của người ("Go"), fix/rollback, viết postmortem vào `lessons/<yyyy-mm>-<slug>.md`. Fix ship xong → thêm eval cho incident đó làm regression test.

## Nguyên tắc quản trị (áp dụng xuyên suốt)

1. Con người chịu trách nhiệm cuối cùng cho mọi quyết định cần judgment; sự chú ý của con người dịch chuyển theo artifact.
2. Exception đi qua **gate**, không đi qua meeting. Hook = deterministic (block/allow); skill = advisory.
3. Separation of duties: agent không tự approve code mình viết.
4. Mọi cấu hình là code, có version control và reviewable: CLAUDE.md, REVIEW.md, SKILL.md, bands.yaml, hooks.
5. Audit trail = chuỗi commit: intent → spec → plan → diff → review findings → incident record.
6. Legacy system: với mỗi artifact chỉ định **một** source of truth (repo hoặc Jira/ServiceNow); tối thiểu artifact ghi record ID, record ghi commit SHA.

## Đo lường

- **Leading**: thời gian artifact-này-đến-artifact-kia; tỷ lệ first-pass CI success của thay đổi do agent viết; time-to-first-review (mục tiêu: phút).
- **Lagging**: changes merged / engineer / tuần; defect lọt production; số lần rework spec sau khi build bắt đầu (đếm commit spec.md sau commit plan.md đầu tiên); repeat incident cùng class (phải giảm khi evals tăng).
