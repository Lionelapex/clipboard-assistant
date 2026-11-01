# Compatibility matrix

This document records what was actually inspected and executed. Results come from the automated
suite in `integration/tests`; the live check writes its evidence to
`integration/test-results/allowcopy-live.json` and `allowcopy-live.png`.

Run everything:

```bash
cd extension && npm run build
cd ../integration && npx playwright test                    # 39 tests, live check skipped
ALLOWCOPY_LIVE=1 npx playwright test tests/allowcopy-live.spec.ts   # live public-site check
```

---

## 1. The named benchmark: allowcopy.com

The brief names `https://allowcopy.com/` as an "Allow Copy Plus playground" containing clipboard and
input-field demonstrations. That is not what the domain serves today, and the suite checks rather
than assumes:

| Check | Observed |
| --- | --- |
| `GET https://allowcopy.com/` | `200`, a technology publication (Security & Privacy, Data & AI sections) |
| `GET https://allowcopy.com/tools/allow-copy/` | `200`; the page states *"The tool is retired"* |
| Editable controls on the page | **0** (`input`, `textarea`, `contenteditable`) |
| Route named in the brief (`/playground`, "Allow Copy Plus") | does not exist |
| Extension content script on the page | injected (`#clipboard-assistant-host` present), launcher visible |
| Capture shortcut on a real article paragraph | **989 characters captured**, panel flashed with the text |
| Paste command with no field on the page | refused with **"No field selected"** |

So there is no third-party playground to score against. What the site does publish is an accurate
list of the mechanisms sites use to "block copying". Each one is reproduced in a local fixture, so
the extension is measured against the same behaviours without depending on a site that no longer
exists in that form.

> The live test is opt-in (`ALLCOPY_LIVE=1`) because it needs network access. It is not counted in
> the deterministic suite.

### 1b. The actual Allow Copy + playground

The product the brief calls "Allow Copy Plus" lives at
`https://allowcopyplus.pidevex.com/force-paste` (the domain is not `allowcopy.com`). It has four
levels of paste-blocking demos, ending in a "Boss level" of fields that only trust a keyboard.
The suite drives the real extension through every editable control on that page
(`ALLCOPY_LIVE=1 npx playwright test tests/allowcopyplus-live.spec.ts`) and records the outcome in
`test-results/allowcopyplus-live.json`:

| Field | Level | Result |
| --- | --- | --- |
| "Confirm your email", password, card number, "Paste here" | 1 Easy | pasted + verified |
| Chat/comment box, blog editor (tiptap/ProseMirror), online coding test | 2 to 3 | pasted + verified (`exec-command`) |
| Same-origin embedded widget (iframe textarea) | 3 Hard | pasted + verified (frame bridge) |
| **"A field that wants real typing"** | 4 Boss | **typed character by character, verified** |
| **"Phone number with a mask"** | 4 Boss | **typed via keydown, masked value verified** |
| **"A fake field"** (the trap) | 4 Boss | refused with *"This element only draws text…"* |

The trap is the fake field: it is a `<div role="textbox">` that paints each letter itself and
rejects `keydown` events whose `isTrusted` is false. There is no editable value to write, so no
extension, this one included, can fill it. The page says as much in its own copy.

Filling both Type-it cards with the page's own samples unlocks the site's boss reward; the live test
asserts the **“You beat the boss level!”** banner and its GIF appear. The fake field is deliberately
left untouched.

---

## 2. Clipboard-restriction mechanisms

Source: the six mechanisms listed on `allowcopy.com/tools/allow-copy/`, reproduced in
`integration/fixtures/site-restricted/` and the mock website.

| # | Mechanism | Fixture | Ordinary user action | Extension insertion | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | `user-select: none` CSS | `#select-none` | dragging selects nothing | not applicable (no field) | documented |
| 2 | `oncontextmenu="return false"` | not simulated locally | right-click menu suppressed | not used by the insertion path | no effect by design |
| 3 | Cancelled `copy` / `paste` / `cut` events | `#paste-blocked` | `Ctrl+V` / `Ctrl+C` do nothing; clipboard unchanged | native setter + `input` event, then read-back verification | **pass** |
| 4 | Clipboard events that replace the clipboard with promotional text | not simulated locally | clipboard may be overwritten, field unchanged | insertion never reads or writes the clipboard | no effect by design |
| 5 | Transparent overlay over the text | `#overlaid-text` | pointer selection blocked | not applicable (no field) | documented |
| 6 | Keyboard traps on `Ctrl+C`, `Ctrl+V`, `Ctrl+X`, `F12` | `#key-trapped` | value unchanged, no `paste` event fired at all | insertion still lands and verifies | **pass** |
| 7 | Text served as an image / scrambled font | n/a | nothing to select as text | cannot help: there is no text node to read | **not possible** |
| 8 | Bulk-change guard: any `input` event that adds more than 2 characters is reverted | `site-typing` `#typing` | a normal paste is undone | paste retried character by character, each event one character | **pass** |
| 9 | Masked field driven by `keydown` only (`preventDefault` + state) | `site-typing` `#phone` | typed digits format; paste does nothing | keydown dispatched per character; the page's own handler formats | **pass** |
| 10 | Fake field: `<div role="textbox">` that draws letters and rejects untrusted keys | `site-typing` `#fake` | typing does nothing | refused with a precise reason; nothing is written | **not possible** |

Observed details worth keeping:

- The keyboard-trap case proves why "paste via clipboard" cannot be the only strategy: the trap
  cancels `keydown`, so no `paste` event exists to intercept. The extension never synthesises
  clipboard events; it writes to the field and dispatches the input event the framework listens for.
- The cancelled-copy case is asymmetric: `Ctrl+C` on the page leaves the system clipboard untouched
  (`BASELINE` stayed `BASELINE`), but the capture shortcut still stores the selection because it
  reads the DOM selection rather than the system clipboard.
- `user-select: none` also defeats a programmatic `Range` in Chrome: `Selection.toString()` is empty,
  so the capture shortcut honestly reports "Nothing selected" instead of inventing text.

---

## 3. Field and framework matrix

All rows are automated. "Verified" means the field value was read back and compared, not that a
success toast appeared.

| # | Case | Fixture / test id | Result | Notes |
| --- | --- | --- | --- | --- |
| 1 | Vue 3 `v-model` textarea | `site-vue` `#vue-body` | **pass** | Vue state counter updates from `input` event |
| 2 | Vue field added after load | `site-vue` "Add field" | **pass** | dynamic `v-for` field targeted correctly |
| 3 | `maxlength=40` field, 60-char paste | `site-edge` `#limited` | **pass** | inserts 40, reports "Pasted and verified · 40 characters" |
| 4 | Unicode + paragraph breaks | `site-edge` `#unicode` | **pass** | em dash, accents, emoji and `\n\n` preserved byte-for-byte |
| 5 | `readonly` field | `site-edge` `#multi-2` | **pass (blocked)** | diagnostic "read-only", no write |
| 6 | `disabled` field | `site-edge` `#multi-3` | **pass (blocked)** | diagnostic "disabled" |
| 7 | `type="number"` | `site-edge` `#numeric` | **pass (blocked)** | "only accepts numbers" instead of a silent no-op |
| 8 | `contenteditable="plaintext-only"` | `site-edge` `#plaintext` | **pass** | `innerText` matches |
| 9 | Multiple textareas | `site-edge` `#multi-1` / `#multi-2` | **pass** | independent values |
| 10 | Open shadow DOM field | `site-edge` `<shadow-notes>` | **pass** | focus tracking descends into open shadow roots |
| 11 | Field inside a same-origin iframe | `site-edge` `frame.html` | **pass** | frame bridge attaches focus listeners inside same-origin frames |
| 12 | Field inside a cross-origin iframe | n/a | **not supported** | browsers isolate the document; reported as "No field selected" |
| 13 | React 18 controlled textarea | `site-react` | **pass** | state/counter update |
| 14 | React field created after load | `site-plain` / `site-react` | **pass** | |
| 15 | Plain HTML input / textarea / contenteditable | `site-plain` | **pass** | |
| 16 | Field removed between focus and paste | `site-plain` | **pass (blocked)** | "field was removed" diagnostic, no fallback field |
| 17 | Typing-only field (bulk changes reverted) | `site-typing` `#typing` | **pass** | paste retried character by character when the field reverts |
| 18 | Masked phone field (keydown-driven) | `site-typing` `#phone` | **pass** | digits typed via keydown; masked value verified |
| 19 | Fake field (`div[role=textbox]`, untrusted keys refused) | `site-typing` `#fake` | **not possible** | refused with "This element only draws text…" |
| 20 | Caret-position insertion | mock site | **pass** | `AAA BBB` + caret 4 + `XXX ` → `AAA XXX BBB` |
| 21 | ~9,000-character snippet | mock site | **pass** | exact value match |
| 22 | Six-section professional form | mock site | **pass** | counters, completion badges, progress sidebar update |
| 23 | Mock site configs A to E | mock site | **pass** | copy/paste/cut blocked exactly as configured; typing unaffected |

---

## 4. Automatic refresh

The assistant must not require a manual **Refresh**. It watches the clipboard while the panel is open
(1.6 s) and while the popup is open (1.2 s), and adopts a value the moment it differs from the last
one it saw.

Ordering matters, because a capture shortcut stores text that is deliberately *not* written to the
system clipboard:

- Every clipboard read records a `clipboardSeen` fingerprint in `chrome.storage.local`.
- A capture snapshots the system clipboard at capture time and marks that value as seen, so a later
  poll cannot mistake the older clipboard content for a new copy.
- Adoption re-reads the stored snippet immediately before writing and aborts if another surface
  (capture, history selection) wrote something newer while the read was in flight.
- Empty clipboard reads are ignored, so clearing the clipboard never wipes the preview.

Automated coverage: `tests/auto-refresh.spec.ts` (4 tests): first copy after opening, second copy
while open, popup parity, and the capture-vs-stale-clipboard race.

---

## 5. Keyboard shortcuts

Bound in `extension/public/manifest.json` (`chrome.commands`) and handled in the service worker.
Chrome lets the user rebind them at `chrome://extensions/shortcuts`; the extension does not fight
the browser for `Ctrl+V`.

| Command | Default | What it does |
| --- | --- | --- |
| Toggle clipboard assistant | `Alt+Shift+V` | Opens/closes the floating panel on the active tab |
| Capture selection | `Alt+Shift+C` | Stores the current selection (page or field) without touching the system clipboard |
| Paste stored snippet | `Alt+Shift+P` | Inserts the stored snippet into the last-focused field and verifies it. If the field reverts a bulk change, the snippet is retyped character by character automatically. |

The floating panel and the toolbar popup also expose a **⌨ Type it** button, which always uses the
character-by-character path (useful when a field silently accepts a paste but formats it badly).

---

## 5. Failure classification

When a case does not work, the extension reports one of these reasons. The suite asserts the reason,
not just the absence of a success message.

| Category | Example | Behaviour |
| --- | --- | --- |
| No field focused | popup/paste with nothing clicked | "No field selected" |
| Focused field removed | SPA re-render | "The field was removed" |
| Read-only / disabled | `readonly`, `disabled` | specific diagnostic, no write |
| Unsupported input type | `type=number`, `type=date` | "This field only accepts numbers/dates" |
| Unsupported editor | canvas editors | best-effort; verified result reported |
| Browser-blocked page | `chrome://`, Web Store, PDF viewer | "The browser blocked access to this page" |
| Cross-origin frame | iframe from another origin | not reachable by the top-frame script |
| Clipboard permission | policy-blocked clipboard | "Clipboard could not be read" with the underlying reason |

---

## 6. Manual verification

1. Build: `cd extension && npm run build`, then load `extension/dist` via
   `chrome://extensions` → Developer mode → **Load unpacked**.
2. Open `http://127.0.0.1:5180/site-edge/` (start it with `node integration/fixtures/server.mjs`).
3. Click `#multi-1`, type a sentence, press `Alt+Shift+C`; the panel opens showing the captured text.
4. Click `#multi-2`, press `Alt+Shift+P`; the value appears and the panel reports the verified field.
5. Open `http://127.0.0.1:5180/site-restricted/`, repeat with `Ctrl+V` first to confirm the page
   blocks the ordinary paste, then `Alt+Shift+P` to confirm the extension path still works.
6. Public-site check: open any article, select a paragraph, press `Alt+Shift+C`. The panel shows the
   text even where the page cancels `copy`.

---

## 7. Rich text and large content

| Case | Result |
| --- | --- |
| Clipboard carrying `text/html` | read by the offscreen document (contenteditable paste); HTML kept beside plain text |
| Heading, bold, italic, link, list into contenteditable | pass, structure kept through sanitised `insertHTML` |
| 50,000 characters into a textarea | pass, full length verified |
| `maxlength="24"` on the destination | field keeps 24 characters by its own rule; reported as truncated |
| Script tag, `onerror` attribute, `javascript:` URL | removed before insertion |
| Plain input or textarea | receives plain text, because the element cannot hold markup |

The extension has no application-side character or word limit. The 50,000 character case is covered by
`integration/tests/rich-text.spec.ts`, together with formatted insertion, sanitisation and formatted
selection capture.

## 8. Known limitations

- **Iframes.** Same-origin frames are supported through a frame bridge. A cross-origin iframe is
  isolated by the browser and is reported as "No field selected" instead of being guessed at.
- **`user-select: none` and overlays.** Text that cannot be selected cannot be captured. The panel
  says so; it does not fabricate content.
- **Text as images / scrambled fonts.** There is no text node to read.
- **Canvas-based editors.** Insertion falls back to the DOM strategy and verification may fail;
  the failure is reported.
- **Protected pages.** `chrome://`, `edge://`, the Web Store and the built-in PDF viewer reject
  content scripts.
- **`Ctrl+V` interception.** A page keyboard trap can stop the browser's paste shortcut. The
  extension's insertion path does not depend on that shortcut, but it also does not try to defeat
  the trap; it writes to the field through the DOM and dispatches the event frameworks listen for.
- **No stealth.** Nothing here disguises clipboard operations or tries to evade a third party's
  security checks; the extension only writes into fields the user has focused.
