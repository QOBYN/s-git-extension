# AI-Native SDLC Playbook — bản chưng cất chi tiết

Nguồn: https://claude.com/blog/the-ai-native-sdlc-playbook (Anthropic). Bản này giữ toàn bộ tinh hoa, bao gồm nội dung 4 diagram trong bài.

## Tiền đề trung tâm

SDLC truyền thống được thiết kế quanh giả định: con người viết code trong nhiều tuần/tháng, nên mọi kiểm soát nặng đặt quanh khâu viết code. Khi agent sinh code ở tốc độ chưa từng có, **Build sụp xuống còn vài giờ** — các stage chạy ở tốc độ con người xung quanh nó trở thành ràng buộc mới.

**Diagram 1 (before/after agents):** Trước agents, mọi stage chạy human-speed và Build là khối lớn nhất. Sau agents, Build chỉ còn một lát mỏng; ba nút thắt mới lộ ra được dán nhãn ngay dưới trục: **requirements** (dưới Plan–Design), **review** (dưới Test), **release** (dưới Deploy). Phần còn lại là "cycle time reclaimed".

**Diagram 2 (line → loop):** Truyền thống là đường thẳng Plan→Design→Build→Test→Deploy→Maintain; một vòng quay lại chậm chạp = một release cycle mới. AI-native là **vòng lặp liên tục** với Claude ở tâm — tính bằng giờ, không phải tuần — con người đứng **trên** vòng lặp: instigate (khởi xướng), direct (định hướng), govern (quản trị).

## Sáu stage

### Stage 1 — Plan: Capture as intent.md

- Truyền thống: ý tưởng đi qua backlog, user story, refinement meeting trước khi tới engineer — mất tuần.
- AI-native: người khởi xướng (không nhất thiết là engineer) brainstorm với Claude; Claude đặt câu hỏi clarify; output là `intent.md` vừa human-readable vừa machine-readable theo template org.
- Quy trình: mô tả vấn đề đàm thoại → Claude hỏi làm rõ → yêu cầu Claude viết `intent.md` → product owner duyệt → commit vào version control → artifact được accept là trigger cho Stage 2.
- Metrics: thời gian từ conversation đến intent.md committed (mục tiêu: giờ); survival rate của intent.md được chấp nhận vào Stage 2.

### Stage 2 — Design: Requirements và Design gộp làm một

- Truyền thống: analyst viết requirements, designer parse thành design — hai phase tách rời.
- AI-native: Claude nhận intent.md đã accept, sinh `spec.md` **bị ràng buộc bởi các org skill** (brand, security, compliance, UX) và **flag concerns ngay lúc viết** — policy sống được áp trong lúc viết spec, không phải phát hiện sau nhiều tuần ở khâu review.
- Quy trình: mở session với org skills loaded → attach intent.md → yêu cầu spec kèm flagged concerns → (nâng cao) codify thành org-level command, việc accept intent.md tự trigger một non-interactive run → product owner xử lý concerns với policy owner → commit spec.md cạnh intent.md → quyết định tiến sang build (tham vấn tech lead nếu rủi ro cao).
- Governance: version của skills được log trong version control.
- Metrics: thời gian giữa commit intent.md và spec.md; số rework sau khi build bắt đầu (đếm commit spec.md sau commit plan.md đầu tiên).

### Stage 3 — Build: Không gì được build khi chưa có plan được duyệt

**Plan mode:**
- Bắt đầu session ở plan mode (read-only, không sửa file), attach spec.md → Claude sinh implementation plan: file nào đổi, thứ tự làm, test chứng minh.
- Engineer chất vấn plan: "cái gì có thể vỡ?", "bước nào rủi ro nhất?" — lặp đến khi **bất kỳ engineer nào cũng implement được chỉ từ plan**.
- Commit plan thành `plan.md` → accept → Claude implement. Nếu implementation lệch plan → **update plan.md trong cùng commit**.
- Ý nghĩa governance: design review xảy ra TRƯỚC khi sinh code, khi thay đổi còn rẻ (sửa document vs. rework code).

**Auto mode:** khi guardrails đã chín (CLAUDE.md tuned, policy skills, blocking hooks, test suite tốt) → engineer duyệt plan, Claude apply từng thay đổi không cần prompt mỗi edit. Trọng tâm con người dịch từ "canh từng hành động" sang "review artifact sau các phiên dài".

**CLAUDE.md — tri thức tổ chức:**
- Mục đích: cho Claude đúng context một thành viên mới cần — conventions, commands, architecture, lỗi hay gặp.
- Quy trình: `/init` sinh bản đầu → cắt gọt còn day-one essentials → check vào git ở root repo (cả team dùng chung một bản) → quy tắc: Claude sai cùng một lỗi 2 lần → correction vào CLAUDE.md → giữ **dưới 1 trang** (Claude đọc toàn bộ mỗi đầu phiên).

**Skills — tri thức phải enforce nhất quán:**
- Dùng skill cho policies (security standards, API conventions, brand rules); dùng CLAUDE.md cho component knowledge.
- Quy trình: chọn 1 tri thức đang enforce không nhất quán → viết thành skill (folder có SKILL.md: frontmatter là trigger, body là instructions) → đặt tại `.claude/skills/<name>/` hoặc phát org-wide qua plugin → test trigger nhiều kịch bản → policy đổi thì update skill + policy owner sign off.
- **Skill là advisory control. Policy bắt buộc phải backing bằng hook deterministic.**

**Hooks — guardrail lúc build:**
- Block edit vào protected paths (generated classes, frozen packages), chạy formatter/linter sau edit, giữ credentials khỏi diff.
- Quy tắc phân tầng: check nhẹ ở build phase; check nặng (full test suite) ở commit/PR; approval prompt thuộc Stage 5.

**Parallel sessions & subagents:**
- Parallel sessions: nhiều Claude Code instance, mỗi cái một git worktree riêng, làm task độc lập; engineer làm orchestrator.
- Subagents: chạy trong một session, scoped helper có context window và tool limits riêng, cho việc lặp lại nhiều task (verify, simplify, research). Ví dụ: subagent "verifier" chạy app, exercise behavior vừa đổi, báo cáo finding mà không tự fix.
- Metrics: số session đồng thời mỗi engineer trong khi chất lượng review vẫn giữ; changes merged/engineer/tuần.

### Stage 4 — Test: Mỗi phiên tự kiểm tra việc của mình

**Feedback loop:**
- Luôn cho Claude một cách verify (tests, build, screenshot); phiên tự lặp đến khi check pass rồi con người mới nhìn.
- Quy trình: (1) gói test vào 1 lệnh exit non-zero khi fail; (2) ghi vào CLAUDE.md mục Commands kèm ví dụ output khỏe mạnh; (3) target định lượng ("all tests pass", "screenshot khớp mock", "endpoint trả 200 với field mới"); (4) bug fix: viết failing test trước — Claude tái hiện bug thành test, confirm fail, commit test, fix mà không sửa test; (5) UI: khép loop bằng visual check; (6) verification là một phần của "done" trong CLAUDE.md — chạy test trước khi báo hoàn thành, paste output; (7) bảo vệ loop bằng hook chặn sửa test file trong task fix.
- Metrics: first-pass CI success rate cho thay đổi agent viết; review time mỗi PR; change failure rate.

**Continuous evals trong CI:**
- Evals = QA stage-gate của AI-native. Suite chạy khi cấu hình agent (CLAUDE.md, skills, hooks) thay đổi.
- Quy trình: thu 20–50 task thực gần đây kèm expected outcome → mỗi task một eval (prompt + acceptance checks: tests pass, lint clean, behavior unchanged, policy followed) → chạy non-interactive trong CI theo lịch và khi config đổi → gate config change trên kết quả (skill change làm tụt pass rate → review trước khi merge) → **mỗi incident production trở thành một eval vĩnh viễn** (regression test).
- Metrics: eval pass rate theo thời gian; regression bắt ở CI vs. lọt production.

### Stage 5 — Deploy: Review hai chiều, governance as code

**AI trong PR review loop:**
- Claude vừa **cho** review (review PR đến theo policy) vừa **nhận** review (tự xử lý comment trên PR của mình).
- Mọi PR nhận pass review giống hệt nhau, finding xếp theo severity; con người chuyển sang intent và risk.
- Quy trình: bật managed Code Review hoặc claude-code-action trong CI → tech lead viết `REVIEW.md` (passes: bugs/security/compliance; ngưỡng Important vs Nit; những gì bỏ qua) → findings không approve/block PR, branch protection vẫn đòi code owner → tag `@claude` trên review comment để Claude fix và push → finding bị flag 2 lần → correction vào CLAUDE.md → tuning hằng tháng (rate findings, cap nit, exclude generated paths và những gì CI đã enforce).
- Governance: separation of duties — agent không approve code của chính nó; PR là audit record (findings, fixes, approvals nằm trong git history).
- Metrics: time-to-first-review (mục tiêu: phút); tỷ lệ review comment được resolve mà con người không đụng vào branch; defect bắt trước merge vs. lọt production.

**Hooks làm approval gate:**
- Liệt kê các gate cần con người phê duyệt (change management, release authorization, sửa protected paths) → thể hiện mỗi gate thành hook script → team hooks trong `.claude/settings.json` (git); hooks không thể thương lượng trong managed settings (platform/IT admin) → **block phải tự giải thích** (lý do + đường xin phê duyệt).

**CI/CD integration:**
- Chạy Claude non-interactive trong pipeline; sandbox execution; expose deployment qua MCP; diễn tập rollback.
- Trình tự trưởng thành: (1) bắt đầu bằng read-only judgment (triage failed build, tóm tắt flaky test, draft changelog) → (2) thêm write step sau gate (fix lint, update docs, xử lý review comment) → (3) sandbox agent jobs: container, network policy, token scoped ngắn hạn, không standing production credentials → (4) deploy/status/rollback thành MCP tools, scoped theo môi trường → (5) autonomy phân tầng: dev tự do, staging trung gian, production hook gate → (6) rollback là đường được diễn tập nhiều nhất, tập đều ở staging (Stage 6 sẽ gọi nó khi control breach).
- Managed settings cho enterprise regulated: deny đọc credential/secret; allow inner loop an toàn (git, make build/test/lint); sandbox shell; allowlist network domains; block credential env vars; chỉ managed hooks/plugins/MCP; yêu cầu Claude version tối thiểu.
- Metrics: tỷ lệ pipeline failure được triage không cần page người; các chỉ số DORA.

### Stage 6 — Maintain: Khép vòng

**Autonomous monitoring & incident response:**
- Kiến trúc: **detection luôn deterministic** (script, không phải model) — Claude chỉ được invoke khi band bị breach, không có người trong đường invoke; Claude chỉ hành động qua các route đã gate; finding được viết thành `intent.md` quay về Stage 1.
- Quy trình: (1) chọn metric có rolling baseline ổn định (CI test failure rate, post-deploy 5xx, PR cycle time) → (2) viết script detection deterministic (mean/std-dev trên rolling window; rule kiểu Western Electric bắt cả drift chậm lẫn spike) → (3) định nghĩa tier trong config có version control: **1σ log only; 2σ Claude diagnose với read-only tools; 3σ Claude được act (mở PR vào review gate, trigger runbook pre-approved)** → (4) trigger layer: scheduled workflow GitHub/GitLab, webhook từ monitoring, cron nội mạng → (5) Claude viết chẩn đoán thành intent.md (anomaly, evidence, proposed outcome, affected systems, open questions) → (6) on-call triage queue: fix now / schedule / dismiss — dismissal dùng để tune band → (7) fix ship xong: thêm eval cho incident đó.
- Metrics: thời gian từ band breach đến intent.md trong triage queue (so với incident-to-postmortem cũ); tỷ lệ finding thành fix merged; repeat incident cùng class (phải giảm khi evals tăng).

**Claude Tag — incident qua chat (Diagram 4):**
- Claude là thành viên channel dưới identity riêng; mỗi incident có first responder ngay.
- Ví dụ trong bài: `#inc-checkout` — người báo "Checkout 5xx tăng từ deploy 21:40, @claude xem giúp" (22:04) → Claude so error signature với deploy diff, tìm ra cache key mới làm rơi tenant id, hỏi "rollback đã diễn tập ở staging sáng nay; tôi chạy chứ?" (22:07) → người: "Go." (22:08) → Claude: "Rolled back. 5xx về trong band, postmortem viết vào `lessons/2026-06-checkout-cache.md`" (22:12). **8 phút, con người chỉ ra một quyết định.**
- Fix nhỏ → PR qua review gate; việc lớn → intent.md về Stage 1. Channel chính là audit trail: request, diagnosis, human authorization, fix đều được ghi tại nơi incident được xử lý.

## Bảng so sánh Truyền thống vs. AI-native

| Stage | Truyền thống | AI-native |
|---|---|---|
| Plan | Committee thu thập requirements, viết tay | Claude tổng hợp từ nguồn thành intent.md |
| Design | Analyst viết spec, designer parse | Requirements + design trong một phiên, ràng buộc bởi skills |
| Build | Test/code viết tay, docs viết sau | Test/code AI sinh; tri thức tổ chức là CLAUDE.md/skills có version |
| Test | QA gate ở ranh giới | Continuous evals dệt xuyên implementation |
| Deploy | Human review từng dòng, governance không đều | Layered agentic review; người cho phần regulated/critical; governance enforce ngay lúc agent hành động |
| Maintain | Người canh production | Agent monitor; control breach tự diagnose và viết ngược thành intent.md |

## Thứ tự áp dụng — dependency graph (Diagram 3)

Đồ thị "plays" 5 hàng, hàng 1 ghi "START ANYWHERE" (màu cam = entry plays, không có mũi tên đi vào — không cần gì trước đó):

- **Hàng 1 (entry):** Capture intent (Plan) · CLAUDE.md (Build) · Feedback loop (Test) · Hooks (Deploy) · Plan mode (Build)
- **Hàng 2:** Skills ← CLAUDE.md · Subagents ← CLAUDE.md + Feedback loop · Evals ← CLAUDE.md + Feedback loop + Hooks
- **Hàng 3:** Requirements & design (Design) ← Capture intent + Skills · PR review (Deploy) ← Evals (+ Skills, liên kết mềm)
- **Hàng 4:** CI/CD (Deploy) ← PR review + Hooks + Plan mode
- **Hàng 5:** Closing the loop (Maintain) ← CI/CD + Capture intent

Quy tắc đọc: *"Start with any entry play — nothing points into it. For any other play, the arrows pointing into it are the plays to adopt before it."* Trình tự do dependency quyết định, không phải thứ tự stage.

## Tích hợp legacy systems

Với mỗi artifact, chỉ định **một** system làm source of truth:
- Repo là source: file markdown là bản chính; legacy system reference commit.
- Legacy là source (Jira/ServiceNow/requirements tool): markdown là working copy, sync qua MCP connector.
- Tối thiểu về liên kết: mọi artifact ghi record ID; mọi legacy record chứa commit SHA.
