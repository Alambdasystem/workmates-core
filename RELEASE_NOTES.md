# Workmates release acceptance

## Call directly from a group chat
- The approved Call with REIGN action sits above the message input inside the fixed composer. It displays actual group members, stays thumb-accessible at phone widths, and uses the existing shared-call membership and join-alert flow.
- Starting this call automatically connects REIGN for the host. Other members receive join alerts and must choose to join/allow their microphone. Private rooms do not expose a group call action.
- Dictation remains separately labeled Dictate. The existing top-header walkthrough action remains available.
- TDD: approved composer button test failed before implementation; member summary and existing suites passed after implementation. Call start/voice tests use fake transports; true multi-device media still needs device acceptance.
- Dark human-message and voice-card contrast corrected after signed-in screenshot review.

Public waitlist, password-recovery email and LinkedIn publication are separate ongoing work; not marked complete here.
