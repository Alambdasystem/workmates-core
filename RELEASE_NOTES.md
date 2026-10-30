# Workmates release acceptance

## Call directly from a group chat
- The approved Call with REIGN action sits above the message input inside the fixed composer. It displays actual group members, stays thumb-accessible at phone widths, and uses the existing shared-call membership and join-alert flow.
- Starting this call automatically connects REIGN for the host. Other members receive join alerts and must choose to join/allow their microphone. Private rooms do not expose a group call action.
- Dictation remains separately labeled Dictate. The existing top-header walkthrough action remains available.
- TDD: approved composer button test failed before implementation; member summary and existing suites passed after implementation. Call start/voice tests use fake transports; true multi-device media still needs device acceptance.
- Dark human-message and voice-card contrast corrected after signed-in screenshot review.

Public waitlist, password-recovery email and LinkedIn publication are separate ongoing work; not marked complete here.

2026.10.30-workspace-2
- Workspace Tools on the dashboard and navigation: personal catch-up, shared pinned/recent work, proposed action items and beta issue reports with optional selected screenshots.
- Admin command center: generation/call/email diagnostics, provider-reported chat token counts, AI pause and rolling-24-hour request caps. Token counts exclude voice, image/tool charges and are not a billing total.
- Meeting controls grouped into a floating Tools menu. Microphone timeout retains a retry state and releases late media; gathered SDP used for live negotiation. Private calls persist across ordinary tab switches and end on page exit.
- REIGN gains a permission-checked action proposal tool; only the named room member may accept or complete it. Accepted actions use existing verified opt-in email/personal reminders.
- Existing room file tools, synchronization, visual previews and version history retained. Physical two-device audio and mobile device acceptance remain separate verification gates.
