# Clipboard Assistant + mock application website

Two connected applications built from scratch to evaluate how effective **page-level clipboard
restrictions** are against a browser extension that can read the clipboard and write directly into
form fields.

| Application | What it is |
| --- | --- |
| **Clipboard Assistant** (`extension/`) | Manifest V3 Chromium extension. Floating, draggable panel that reads clipboard text, keeps a local history, and inserts into the field the user last focused — then verifies the result. |
| **Mock website** (`mock-website/`) | A normal-looking grant application website ("Lumen Foundation"). Six answer fields, character counters, completion indicators, and a configurable clipboard restriction manager (configurations A–E). |

Everything runs locally. There is no backend, authentication, cloud service or AI API, and clipboard
contents never leave the browser.

---

## Requirements

- Node.js 18+ and npm (developed with Node 24 / npm 11)
- Google Chrome or Microsoft Edge (Chromium 116+; tested on Google Chrome 156)
- The integration tests use the **installed** Chrome — no Playwright browser download is needed

---

## Quick start

### 1. Run the mock website

```bash
cd mock-website
npm install
npm run dev
```

Open <http://localhost:5173> (or <http://127.0.0.1:5173>).

Production build / preview:

```bash
npm run build
npm run preview      # http://localhost:4173
```

### 2. Build the extension

```bash
cd extension
npm install
npm run build
```

The loadable extension is written to `extension/dist/`:

```
dist/
  manifest.json
  background.js       # service worker (module)
  content.js          # self-contained IIFE content script (React panel included)
  popup.html          # toolbar popup
  offscreen.html      # offscreen clipboard document
  icons/              # 16/32/48/128 px
  assets/             # hashed popup/offscreen assets
```

### 3. Load it into Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/dist` folder.
4. Pin **Clipboard Assistant** to the toolbar.

Microsoft Edge: open `edge://extensions` and follow the same three steps (`Load unpacked` is
available with Developer mode enabled). The build is standard MV3 and uses APIs supported by Edge.

### 4. Use it

**Toolbar popup (fastest path)**

1. Click into the answer field you want to fill — for example **01 Project summary**.
2. Click the **Clipboard Assistant** toolbar icon. The popup shows **Target field: Project summary**
   and the clipboard preview.
3. If the preview is empty, press **Refresh**.
4. Press **Paste**. The content is inserted into that field and the popup reports
   “Pasted and verified · n characters”.
5. Click another answer field (e.g. **02 Statement of need**), reopen the popup and press **Paste** —
   the text goes into Q2. The popup always targets the field you last clicked; it never guesses the
   first textarea on the page.

The popup can do this because the content script keeps a reference to the last focused field.
Opening the popup takes focus away from the page, so the popup never relies on
`document.activeElement` at paste time.

**Copy** puts the assistant's current snippet back on the system clipboard, **Clear** clears the
assistant's stored content, **Refresh** re-reads the clipboard.

**Floating panel**

1. A launcher bubble sits at the bottom right of every page; click it (or press `Alt+Shift+V`, or use
   the popup's expand icon) to open the panel. It remembers its position and whether you left it open.
2. Just copy text anywhere. The panel picks it up on its own (no Refresh needed) while it is open, and
   refreshes again whenever the clipboard changes.
3. Click into an answer field, then press **Paste**.
4. If a field rejects pasted text (some forms revert anything that was not typed), press
   **⌨ Type it** — or just paste again: a reverted paste is retyped character by character automatically.
5. The status banner reports **“Inserted and verified”** with the target field, strategy and timing.
   The character counter and completion indicator update because the site’s React state accepted the
   programmatic change.
6. Open **Test controls** (bottom left) to switch restriction configurations and watch the event log.

> After loading or reloading the extension, reload any tab that was already open — content scripts
> are not injected into existing tabs.

**Keyboard shortcuts**

| Shortcut | Action |
| --- | --- |
| `Alt+Shift+V` | Open / close the floating panel on the active tab |
| `Alt+Shift+C` | Capture the current selection into the assistant, even where the page cancels `copy` |
| `Alt+Shift+P` | Insert the stored snippet into the last-focused field and verify it |

Rebind them at `chrome://extensions/shortcuts` (Edge: `edge://extensions/shortcuts`). The extension
never tries to replace the browser's own `Ctrl+V`.

---

## What is implemented

| Requirement | Implementation |
| --- | --- |
| Clipboard retrieval on user action | `src/clipboard/read.ts`: offscreen document (primary, no per-site prompt) → `navigator.clipboard.readText()` fallback |
| Preview with paragraph spacing | `ClipboardPreview` renders `white-space: pre-wrap`; raw text is stored unchanged |
| Refresh / empty / permission errors | Refresh button; explicit “clipboard is empty” state; mapped `NotAllowedError` message |
| Automatic refresh | The panel and popup watch the clipboard while they are open (1.6 s / 1.2 s) and adopt a new copy without a click; a captured selection is protected by a `clipboardSeen` fingerprint so a stale clipboard read never overwrites it |
| Large selections | Verified with a ~9,000-character snippet in the integration tests |
| Floating panel | React mounted in a shadow root on every page; draggable by the header, position persisted in `chrome.storage.local`, clamped to the viewport |
| Panel controls | Heading, preview, Paste, Copy, Refresh, Clear, history, minimise, close, launcher |
| Toolbar popup | Target-field card, Paste into the last-focused field, Copy, Refresh, Clear, history, open floating panel |
| History (latest 10) | `src/storage/index.ts`: newest first, de-duplicated by text, timestamp + character count, per-entry delete, clear all, `chrome.storage.local` |
| Insert into input / textarea | Native value setter + synthetic `input` event, so React-controlled fields update; caret position preserved; `maxLength` respected |
| Insert into contenteditable / rich text | `document.execCommand('insertText')` with a saved selection range, falling back to Range insertion with `<br>` paragraph breaks |
| Verification | Reads the field back and normalises whitespace before reporting success; failures show the reason and target field |
| Active field identification | Capture-phase focus/pointer tracking; clicking the shadow-root panel does not lose the target |
| Mock website layout | Sticky header with Home / Information / Application form nav, hero, guidance section, six answer sections, progress sidebar, footer |
| Answer section anatomy | Question heading, description, guidance, large textarea, `n / 4,000` counter, Not started / In progress / Complete indicator |
| Normal typing | Verified for typing, backspace, arrow keys, Home, selection, Enter and blank-line paragraphs |
| Clipboard restrictions | Capture-phase `copy` / `paste` / `cut` handlers scoped to the answer form; `preventDefault()` + `stopPropagation()` |
| Configurations | A Standard · B Paste restricted · C Copy restricted · D Copy and paste restricted · E Combined (site default) + individual toggles → “Custom” |
| Programmatic update path | Test panel button writes through the native setter + synthetic `input`; logged separately as `programmatic-input` |
| Site support | No application allowlist. Any http(s) page Chrome lets the extension run on, with fields detected dynamically (`aria-label`, `aria-labelledby`, `label[for]`, `legend`, nearest heading, placeholder, id/name) |
| Keyboard shortcuts | `Alt+Shift+V` panel, `Alt+Shift+C` capture selection, `Alt+Shift+P` insert stored snippet (`chrome.commands`, rebindable) |
| Typing-only fields | If a field reverts a bulk paste, the snippet is retyped one character at a time; `⌨ Type it` in the panel/popup forces that path |
| Same-origin frame fields | Focus listeners attached inside same-origin iframes, so embedded widgets are inserted into like normal fields |
| Shadow DOM fields | Focus tracking descends open shadow roots, so web-component textareas are targeted |
| Field diagnostics | read-only, disabled, removed, unsupported input type, restricted page, no field — each reported as its own reason |
| Framework coverage | React 18, Vue 3 `v-model`, plain HTML, `contenteditable`, `plaintext-only`, `maxlength`, dynamic fields |

---

## Architecture

```
extension/
  public/manifest.json          MV3 manifest (storage, clipboardRead/Write, offscreen, <all_urls>)
  popup.html                    toolbar popup entry
  offscreen.html                clipboard worker entry
  src/background/index.ts       service worker: message routing, offscreen lifecycle, shortcut
  src/offscreen/main.ts         DOM-based clipboard read/write (execCommand fallback)
  src/content/index.tsx         mounts the panel in a shadow root, tracks focus, captures copies
  src/content/FloatingPanel.tsx the draggable panel UI and all panel behaviour
  src/clipboard/                readClipboardText / writeClipboardText / copy capture
  src/insertion/                focus tracking, describeField, insertTextIntoField, verifyText
  src/storage/                  history + settings in chrome.storage.local
  src/content/messaging.ts      context + insertion bridge used by the popup (no site gating)
  src/popup/messaging.ts        tab targeting, on-demand content-script injection
  src/components/               shared UI (preview, history list, buttons, status, icons)
  src/styles/                   Tailwind entry points (panel CSS is inlined into the shadow root)

mock-website/
  src/pages/HomePage.tsx        the application page (hero, guidance, form, progress)
  src/components/               header, footer, field blocks, progress panel, test controls
  src/forms/                    field definitions, completion logic, last-focused field tracking
  src/restrictions/             presets, provider/persistence, event log, test hook
  public/integration-harness.html  minimal input/textarea/contenteditable fixture for tests

integration/
  configuration/extension.config.ts  paths, ports, origins, test ids
  fixtures/server.mjs                 serves two independent sites on port 5180
  fixtures/site-plain/                plain HTML + dynamically created fields
  fixtures/site-react/                React 18 page with controlled inputs
  tests/mock-site.spec.ts             restriction matrix and form behaviour
  tests/extension.spec.ts             extension flows against the mock site + harness
  tests/universal.spec.ts             unregistered plain + React sites
  scripts/screenshots.mjs             regenerates the screenshots in integration/screenshots/
```

### Why a shadow root?

Tailwind’s reset and utility classes are compiled into `panel.css`, imported with `?inline`, and
injected into the shadow root. Nothing from the panel leaks into the host page and the host page’s
CSS cannot restyle the panel.

### Why an offscreen document?

MV3 service workers have no DOM and no clipboard access. `chrome.offscreen` creates a hidden
extension document with the `CLIPBOARD` reason; it reads via `navigator.clipboard.readText()` and
falls back to `document.execCommand('paste')`. Reads therefore do not trigger a per-site permission
prompt.

### How insertion works

1. `initFocusTracker()` records the last focused editable element (and range for contenteditable).
2. `insertTextIntoField()` picks a strategy:
   - `HTMLInputElement` / `HTMLTextAreaElement` → native prototype value setter (bypasses React’s
     patched setter so its value tracker sees a change), restores the caret, dispatches `input`.
     Newlines are joined with spaces for single-line inputs, which cannot contain line breaks.
   - contenteditable → `execCommand('insertText')` at the saved range, Range fallback with `<br>`.
3. `verifyText()` reads the field back, normalises NBSP/CRLF/whitespace, and confirms the text is
   present. The result is reported as verified or failed — never assumed.

### Permissions

| Permission | Why |
| --- | --- |
| `storage` | Clipboard history and panel position/settings in `chrome.storage.local`. |
| `clipboardRead`, `clipboardWrite` | Read the clipboard and clear it on an explicit button press. |
| `offscreen` | Hidden document that performs clipboard I/O for the service worker. |
| `host_permissions: <all_urls>` + content script on all URLs | The floating panel and the focus tracker must exist on the page before the popup opens, otherwise the field you clicked is unknown. This is Chrome's install-time permission, not an application allowlist. |
| `scripting` | Injects the content script on demand when a tab was opened before the extension was installed. |
| `commands` (no permission) | `Alt+Shift+V` shows/hides the panel. |

### Site access — there is no allowlist

The extension has **no approved-website list**. Nothing to register, no domain configuration file, and
no code path comparing `location.origin` with a list. Any page Chrome lets the extension run on is
usable:

1. Install the extension once.
2. Open any http(s) page.
3. Click a text field, open the popup, press **Paste**.

Only Chrome's own mechanisms gate access:

- **Host access** (`<all_urls>` + declared content script) is granted at install. It is what lets the
  floating panel exist and the focus tracker remember the field before the popup opens.
- **`scripting`** is used only as a fallback: if a tab predates the install (no content script yet),
  the popup injects `content.js` and retries, so you do not have to reload the page manually.

Chrome still protects its own surfaces: `chrome://`, `edge://`, the Web Store and the PDF viewer
cannot be scripted, and `file://` pages need the “Allow access to file URLs” toggle. Those cases show a
specific technical message (`The assistant cannot access this page`), never a fake allowlist error.

> If you prefer per-site permission prompts, Chrome's `activeTab` model can be adopted later, but the
> floating panel would then only appear after invoking the extension on each page. The declared
> content script is used here because focus must be tracked *before* the popup opens.

---

## Clipboard restrictions on the mock site

Restrictions are attached to the `<form>` element only, in the capture phase:

| Configuration | copy | paste | cut |
| --- | --- | --- | --- |
| A · Standard | allowed | allowed | allowed |
| B · Paste restricted | allowed | **blocked** | allowed |
| C · Copy restricted | **blocked** | allowed | allowed |
| D · Copy and paste restricted | **blocked** | **blocked** | allowed |
| E · Combined restrictions (default) | **blocked** | **blocked** | **blocked** |

- Blocked events call `preventDefault()` and `stopPropagation()`, so the browser does not copy, cut
  or paste.
- **Individual controls** toggle each of the three independently; a non-preset combination shows as
  “Custom configuration”.
- The selected configuration persists in `localStorage` (`lumen-mock:restriction-config`).
- The event log records every clipboard event on an answer field as `blocked` or `allowed`, plus
  `programmatic-input` entries for untrusted (script-generated) input events.

**Clipboard events vs. programmatic changes are separate mechanisms.** Cancelling `paste` stops the
browser’s paste pipeline; it does not stop an extension from assigning `field.value` and dispatching
an `input` event. The **Simulate programmatic insert** button demonstrates exactly that while
JavaScript remains enabled: the value and React state change, but no clipboard event occurs.

### Test hook

The mock site exposes a documented hook for the automated tests:

```js
window.__clipboardAssistantMock.getConfig()        // { configId, settings }
window.__clipboardAssistantMock.setConfig('E')     // switch configuration
window.__clipboardAssistantMock.getEvents()        // clipboard event log
window.__clipboardAssistantMock.clearEvents()
```

---

## Integration tests

```bash
# the extension must be built first
cd extension && npm run build

cd ../integration
npm install
npx playwright test            # add --headed to watch the browser
```

The Playwright config starts both test servers automatically and reuses them if they are already
running: the mock site (`npm --prefix ../mock-website run dev`) and the two fixture sites
(`node fixtures/server.mjs` on port 5180).

**Why CDP instead of `--load-extension`?** Chrome 137 removed the `--load-extension` and
`--disable-extensions-except` switches. Playwright’s own bundled Chromium download is deliberately
not used here. Instead the suite launches the installed Chrome with
`--enable-unsafe-extension-debugging` and installs the unpacked build with the CDP command
`Extensions.loadUnpacked` (Chrome 136+). No extra browser runtime is downloaded.

### Coverage (48 tests + 2 opt-in live checks)

`tests/mock-site.spec.ts` (7 tests):

1. Defaults to Configuration E and the chips report blocked copy/paste/cut.
2. Ordinary typing, arrow keys, backspace, Home, select-all replacement and `\n\n` paragraphs.
3. Character counter and completion indicator transitions.
4. Full restriction matrix A–E for paste, copy and cut.
5. Blocked clipboard events appear in the log with the field name.
6. Programmatic update bypasses clipboard restrictions and reaches React state.
7. Submit validation lists the incomplete sections.

`tests/extension.spec.ts` (12 tests):

1. Extension installs via CDP and the toolbar popup renders.
2. Clipboard read → preview → Paste → **verified** insertion into the active field (exact value with
   paragraph breaks), counter updated, history recorded, ordinary paste still blocked.
3. Second field insertion leaves the first field untouched and updates the active-field label.
4. Caret-position insertion (`AAA BBB` + caret at 4 + “XXX ” → `AAA XXX BBB`).
5. Input, textarea, contenteditable and a ~9,000-character snippet.
6. Panel drag, minimise, restore, timestamps, per-entry delete, selection, clear all, clear
   clipboard, close → launcher.
7. History caps at the latest 10 snippets (12 added → 10 shown, newest/oldest correct).
8. No focused field → explicit “No active field” error.
9. Popup Paste inserts into the field clicked before the popup opened (paragraph breaks preserved).
10. Popup Paste follows the most recently clicked field (Q1 stays untouched, Q2 receives the text).
11. Popup with no focused field shows “No field selected” instead of guessing a field.
12. Popup Copy puts the snippet back on the clipboard and Clear empties it.

`tests/universal.spec.ts` (5 tests) — run against `http://127.0.0.1:5180`, an origin that appears
nowhere in the extension source. `fixtures/server.mjs` serves a plain HTML page and a React 18 page:

1. Plain HTML: text input, textarea and contenteditable all accept inserted text.
2. Plain HTML: an input created after page load (via `document.createElement`) can be targeted.
3. React 18: the controlled textarea updates React state (the character count changes).
4. The same build pastes into the mock site and the plain site in sequence, with no cross-contamination.
5. A field removed from the DOM produces the specific “field was removed” diagnostic, not a paste
   into a different field.

`tests/compatibility.spec.ts` (15 tests) — the framework and edge-case matrix, run against
`site-vue` and `site-edge` on the fixture server:

1. Vue 3 `v-model`: value and Vue state counter update; a field added after load is targeted.
2. `maxlength=40` with a 60-character paste: 40 inserted, verified as 40.
3. Unicode and paragraph breaks preserved (dashes, accents, emoji, `\n\n`).
4. Read-only field: refused with the read-only diagnostic, value unchanged.
5. Disabled field: refused with the disabled diagnostic.
6. `type="number"`: refused with “only accepts numbers”.
7. `contenteditable="plaintext-only"`: inserted text present in `innerText`.
8. Multiple textareas stay independent.
9. Open shadow DOM field: detected and editable.
10. Same-origin iframe: documented as unreachable from the top-frame tracker.
11. Cancelled `paste`: extension insertion still works.
12. Keyboard trap on `Ctrl+V`: no paste event fires, extension insertion still works.
13. Cancelled `copy`: clipboard unchanged, capture shortcut still stores the selection.
14. Capture → insert-current shortcut flow: panel shows the snippet, storage is stable, value verified.
15. `insert-current` with nothing stored reports the empty reason.

`tests/typing.spec.ts` (5 tests) — the "typing-only" family on `site-typing`:

1. A bulk paste that the field reverts (more than 2 characters in one input event) is retyped
   automatically and verified; the page's refusal counter increments.
2. The explicit **⌨ Type it** button types the snippet character by character.
3. A masked phone field driven only by `keydown` receives the digits and the masked value verifies.
4. A fake `div[role=textbox]` is refused with "This element only draws text…" and its text is unchanged.
5. A textarea inside a same-origin iframe is reached through the frame bridge and verified.

`tests/auto-refresh.spec.ts` (4 tests) — no manual Refresh:

1. Opening the panel picks up a copy made afterwards without pressing Refresh; history + status update.
2. A second clipboard change while the panel stays open is picked up again.
3. The popup adopts a new copy while it is open and stores it as the current snippet.
4. An automatic refresh never replaces a shortcut-captured selection with the stale clipboard value.

`tests/allowcopyplus-live.spec.ts` (1 test, skipped unless `ALLCOPY_LIVE=1`) — drives the extension's
own popup through every editable control on `allowcopyplus.pidevex.com/force-paste#try`, including
the Boss level (typing-only, masked phone, fake field) and the embedded iframe widget. Results are
written to `test-results/allowcopyplus-live.json`.

`tests/allowcopy-live.spec.ts` (1 test, skipped unless `ALLCOPY_LIVE=1`) — opens
`https://allowcopy.com/tools/allow-copy/` in the installed Chrome, confirms the content script is
injected, captures a real article paragraph (989 characters), and confirms Paste reports
“No field selected” because the page has no editable fields. Evidence is written to
`test-results/allowcopy-live.json` and `.png`.

See [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) for the full matrix and failure classification.

---

## Verification results

Observed on Windows 11 with Google Chrome 156.0.8078.74, mock site served by Vite on
`http://127.0.0.1:5173`:

| Check | Result |
| --- | --- |
| `extension` typecheck + build | pass (`tsc --noEmit`, two Vite passes) |
| `mock-website` typecheck + build | pass |
| `npx playwright test` | **48 passed**, 2 skipped (the opt-in live checks) |
| Automatic refresh | panel and popup adopt a new clipboard value with no click; second change picked up; capture not clobbered |
| Live check on `allowcopyplus.pidevex.com/force-paste` (`ALLCOPY_LIVE=1`) | every real field verified — typing-only **typed**, masked phone **typed**, fake field **refused** |
| Typing-only field (reverts bulk changes) | auto-retry types character by character; value verified; refusal counter increments |
| Masked phone (keydown-driven) | digits received, `+1 (202) 555-0143` verified |
| Fake `div[role=textbox]` | refused with “This element only draws text…” |
| Same-origin iframe field | focus tracked inside the frame; insertion verified |
| Live check on `allowcopy.com` (`ALLOWCOPY_LIVE=1`) | 200 OK, content script injected, 989-char paragraph captured, paste refused with “No field selected” (page has 0 editable fields) |
| Vue 3 `v-model` field | value + Vue state counter update; dynamic field targeted |
| `maxlength=40` with 60-char paste | 40 characters inserted and verified as 40 |
| Unicode + paragraphs | exact value match incl. emoji and `\n\n` |
| Read-only / disabled / `type=number` | refused with the matching diagnostic; value unchanged |
| Open shadow DOM field | inserted + verified |
| Same-origin iframe | not reachable; explicit “No field selected” |
| Page cancels `paste` / traps `Ctrl+V` | extension insertion still lands and verifies |
| Page cancels `copy` | clipboard unchanged; capture shortcut still stores the selection |
| Capture → insert shortcut flow | panel shows captured text; stored value stable; field verified |
| Ordinary typing / backspace / arrows / selection / paragraphs | pass |
| Copy restriction (configs C, D, E) | clipboard unchanged |
| Paste restriction (configs B, D, E) | field unchanged |
| Cut restriction (config E) | field unchanged |
| Programmatic write under config E | field + React state update; logged as `programmatic-input` |
| Extension insertion under config E | field value verified; character counter updated |
| Popup Paste into last-focused field | inserted + verified, paragraph breaks intact |
| Popup after switching fields | correct field updated; previously focused field unchanged |
| Popup with no focused field | explicit “No field selected” error |
| Popup Copy / Clear | clipboard replaced with the snippet / cleared |
| New origin (plain HTML, never registered) | input, textarea and contenteditable insert + verify |
| New origin (React 18) | controlled textarea value and React counter update |
| Dynamic fields (plain + React) | created after load, targeted correctly |
| Two sites in one session | independent fields; no cross-contamination |
| Removed field | specific diagnostic; no fallback paste elsewhere |
| Paragraph preservation | exact value match including `\n\n` |
| Multiple fields | independent values, active-field label updates |
| Contenteditable insertion | text present in `innerText` |
| Large snippet (~9k chars) | exact value match |
| History cap | 10 entries after adding 12 |
| JS enabled throughout | all flows driven through the live React app; no JS disabled |

Screenshots: `integration/screenshots/` (`mock-desktop.png`, `mock-test-controls.png`,
`panel-clipboard.png`, `panel-inserted.png`, `popup.png`, `mock-mobile.png`). Regenerate with
`npm run screenshots` from the project root (mock site must be running).

---

## Screenshots

| Mock application site | Floating panel after a verified insertion |
| --- | --- |
| ![Mock application site](integration/screenshots/mock-desktop.png) | ![Floating panel after insertion](integration/screenshots/panel-inserted.png) |

| Testing settings (config A–E) | Toolbar popup |
| --- | --- |
| ![Testing settings](integration/screenshots/mock-test-controls.png) | ![Toolbar popup](integration/screenshots/popup.png) |

---

## Known limitations

- **Clipboard reads can still be refused.** Corporate policies or browser flags can block
  clipboard access entirely; the panel then reports the failure instead of pretending it read text.
- **Rich-text support is best-effort.** `execCommand('insertText')` covers standard contenteditable
  and most editors, but editors with their own document model (e.g. canvas-based) may reject or
  reformat inserted text. Verification reports the actual outcome.
- **Iframes.** Fields inside same-origin frames are supported (the frame bridge attaches focus
  listeners there). Fields inside a cross-origin iframe are isolated by the browser and reported as
  “No field selected”.
- **Typing is a simulation, not hardware input.** Characters are sent as a cancelable `keydown`
  followed by the browser's own insert command; a field that insists on `isTrusted` *key* events
  (rather than trusting the resulting edit) cannot be filled by any extension without the debugger
  API, which this extension deliberately does not use.
- **Fake fields cannot be filled.** A `div` that draws letters and keeps no editable value has
  nothing to write into; the assistant says so instead of pretending.
- **Unselectable text cannot be captured.** `user-select: none`, transparent overlays and
  keyboard traps can stop dragging and `Ctrl+C`. The capture shortcut reads the DOM selection, so it
  works when the page only cancels `copy`, but there is nothing to read when selection itself is
  blocked. Text served as an image has no text node at all.
- **A page keyboard trap can stop `Ctrl+V`.** The extension does not defeat the trap; it inserts
  through the DOM and dispatches the input event the framework listens for, which is unaffected.
- **Page scripts cannot stop programmatic writes.** That is the point of the evaluation: cancelling
  clipboard events does not defend against an extension writing to the DOM. The mock site shows this
  explicitly rather than hiding it.
- **Some pages cannot be scripted.** `chrome://`, `edge://`, the Web Store and the PDF viewer reject
  content scripts, and `file://` pages need “Allow access to file URLs”. The popup reports these
  technical restrictions; it never claims a site is “not allowed”.
- **Automatic refresh polls only while the assistant is visible** (panel open or popup open), roughly
  every 1.2–1.6 s. It does not read the clipboard in the background when the assistant is closed.
- **Chromium only.** MV3 APIs (`chrome.offscreen`, service worker) are used; Firefox is not targeted.
- **Panel position is global**, not per-site or per-tab.
- **The mock website is not a real funder.** It is a local evaluation environment; the “Lumen
  Foundation” content is illustrative.
- **Test harness depends on Chrome ≥ 136** for `Extensions.loadUnpacked`. Manual “Load unpacked”
  works on any Chrome/Edge that supports MV3.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| **“Failed to load extension … Manifest file is missing or unreadable”** | Chrome was pointed at the source folder. Select **`extension/dist`**, not `extension`. In the folder picker, paste `D:\extension\clipboard-assistant-project\extension\dist` into the address bar, press Enter, then choose **Select Folder**. |
| No floating panel | Look for the round launcher bubble at the bottom right (the panel no longer opens by itself). Press `Alt+Shift+V` or use the popup’s expand icon. Reload a tab that was open before install, or let the popup inject the content script automatically. |
| “Clipboard could not be read” | The assistant refreshes automatically while the panel or popup is open. If the browser blocks the read, click the page once so it has focus; **Refresh** retries on demand. |
| Paste says “The assistant cannot access this page” | Chrome blocks content scripts on `chrome://`, `edge://`, the Web Store and the PDF viewer. `file://` pages need “Allow access to file URLs” in the extension details. |
| Paste says “No field selected” | Click into a text field on the page first — the assistant targets the last field you focused. |
| Paste says “That field is read-only / disabled” | The page itself is preventing edits in that field; choose another field. |
| Tests cannot find the extension | Run `npm run build` in `extension/` before `npx playwright test`. |
| Port 5173 busy | Stop the other dev server; the Playwright config reuses an existing one. |
