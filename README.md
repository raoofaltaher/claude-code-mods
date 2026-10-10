# Claude Code mods

Two mods for Claude Code's function-hooks plugin system:

- **[account-bars](#account-bars)**: live session and weekly limit bars for every Claude account you use, in a sidebar beside the conversation.
- **[tool-icons](#tool-icons)**: colored icons on tool lines.

Both are tested on Claude Code **2.1.296**. Mods are an early-access API that can change between releases.

---

## account-bars

A sidebar on the right of the terminal conversation with one pair of bars per Claude account:

- **S**: the session (5-hour) limit.
- **W**: the weekly (7-day) limit.

Bars are green below 50 %, yellow from 50 %, orange from 75 % and red from 90 %. Each bar shows when its window resets. When the account you are signed into reaches its session limit, the mod tells you which account is next in line. **It never switches for you**: you switch with `/login`.

```
S session (5-hour) · W weekly (7-day)

▶ work1
  S ███████████████████████░  96% 3h 30m
  W █████░░░░░░░░░░░░░░░░░░░  22% 2d 6h
    as of just now

  work2                                 next
  S ░░░░░░░░░░░░░░░░░░░░░░░░   0%
  W ████████████████░░░░░░░░  67% 11h 10m
    as of just now

  personal
  S ████░░░░░░░░░░░░░░░░░░░░  15% 3h 00m
  W ███░░░░░░░░░░░░░░░░░░░░░  11% 4d 18h
    as of just now · other org, never suggested

[ compact ] [ refresh ]
```

### Install

You need Claude Code with mods (function hooks), a Claude subscription login (Pro, Max, Team or Enterprise), and `git` able to reach GitHub.

**From GitHub**, typed at the prompt of a Claude Code terminal session:

```
/plugin install account-bars --marketplace raoofaltaher/claude-code-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

**From a local copy** of this repository:

```
claude plugin marketplace add <path-to-this-repo>
claude plugin install account-bars@my-mods
```

A marketplace added from a folder is read from that folder itself. After you edit the mod there, run `/reload-plugins`.

**To try it for one session** without installing:

```
claude --plugin-dir <path-to-this-repo>/account-bars
```

### Add your accounts

The account you are signed into works with no setup. Every **other** account is signed in once into its own Claude Code profile folder under `~/.claude-accounts/`. **The folder name is the label the sidebar shows.**

Use a separate terminal for this, not a Claude Code session, because the sign-in opens a browser.

PowerShell:

```powershell
$env:CLAUDE_CONFIG_DIR = "$HOME\.claude-accounts\work2"
claude auth login
Remove-Item Env:CLAUDE_CONFIG_DIR
```

bash / zsh:

```bash
CLAUDE_CONFIG_DIR="$HOME/.claude-accounts/work2" claude auth login
```

Then press `r` in the sidebar, or run `/accounts refresh`.

Tips:

- **Make sure the browser approves the right account.** It is usually still signed in to claude.ai as your current account. Either switch accounts on claude.ai first, or open the sign-in link the terminal prints in a private window.
  - `claude auth login --email <address>` fills in the address.
  - `--sso` forces single sign-on.
- **Add the account you are signed into as well** (for example `work1`). The top row then shows its name instead of "this session". After you `/login` to another account, that profile is what keeps the first account tracked.
- **Labels:**
  - Don't use an e-mail address as a folder name, since it would show on screen.
  - To rename an account, close anything using that profile and rename its folder. Then update `order` (below) if you set it.

### Use

| | |
| --- | --- |
| `/accounts` | Show or hide the sidebar. |
| `/accounts refresh` | Re-read every account now. |
| `c` or `[ compact ]` / `[ expand ]` | One row per account, or the full view with reset times and status. |
| `r` or `[ refresh ]` | Same as `/accounts refresh`. |
| `/config` → account-bars → `order` | Your preferred order, e.g. `work1,work2,personal`. Unlisted accounts follow alphabetically. |
| `/config` → account-bars → `claudePath` | The full path to `claude`, if it isn't at `~/.local/bin/claude` (`claude.exe` on Windows), the native installer's place. The mod never looks `claude` up by name. |

Where the sidebar sits:

- It docks on the right in Claude Code's **full-screen layout** when the terminal is at least **110 columns** wide (opened with `/accounts`).
- It opens by itself from 144 columns.
- Outside the full-screen layout it sits above the prompt.

Status lines under each account:

| Line | Meaning |
| --- | --- |
| `as of 40s ago` | Live reading. Accounts refresh every 2 minutes. The account you are signed into also updates after every reply. |
| `reading…` | Not read yet. |
| `sign-in expired` | That profile's login lapsed. Run `claude auth login` for it again (see above). |
| `no reading, retrying` | The last read failed. The mod retries with back-off (up to 16 minutes). |
| `not signed in` | The folder exists but holds no login. |
| `other org, never suggested` | Tracked, but in a different organization from the account you are signed into. |
| `paused` | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set, so other accounts are not polled. |
| a yellow line at the top | A setup problem: `claude`, or the program that reads other accounts, was not found at its fixed path. |

**At the session limit:**

- A toast and a desktop notification name the next account, for example: *"Session limit reached. Next in line: work2 (session 0%, weekly 67%). Run /login and pick it."*
- The sidebar marks that account **next**.
- You get one notice per session window.
- Only accounts in the **same organization** as the one you are signed into are ever suggested.

### Choosing who is "next"

The policy lives in one function, `pickNext()` in [`account-bars/hooks/next.ts`](account-bars/hooks/next.ts). Each candidate carries:

- its place in your `order`;
- its status;
- its session and weekly percentages (already 0 once a window has reset);
- when it was last read.

Today it takes **the first account in your order, whatever its numbers**. That can name an account whose weekly limit is nearly used up. Change it to suit how you work, for example:

- skip accounts at 90 % weekly or more, or with stale readings;
- then prefer the most session room.

### How it works

| Account | Where its numbers come from | Credential involved |
| --- | --- | --- |
| The one this session is signed into | Readings Claude Code itself pushes to mods after every reply, plus the usage endpoint through Claude Code's credential handle | none: the mod never sees the secret |
| Every profile under `~/.claude-accounts/` | `GET https://api.anthropic.com/api/oauth/usage` (the endpoint Claude Code's own `/usage` reads), every 2 minutes, made by a **short-lived helper process** | that profile's access token, which only the helper ever reads |

The helper reads the profile's `.credentials.json`, makes the request, and prints only three things: when the login expires, the HTTP status, and the usage numbers.
- **On Windows** it is Windows PowerShell 5.1, at its fixed path under `%SystemRoot%`.
- **On Linux** it is `/bin/sh` with `/usr/bin/curl`. The token reaches `curl` on its standard input, never on a command line.
- **The profile folder** is passed to the helper in an environment variable, never pasted into a command.
- The helper's script is in [`account-bars/hooks/probe.ts`](account-bars/hooks/probe.ts).

To recognise accounts and organizations, the mod runs `claude auth status --json`:

- **When:** at start, after `/login`, on refresh, and every 10 minutes.
- **What it keeps:** the e-mail and organization ID it returns, in memory only.

### Security and privacy

- **Tokens never enter the mod.**
  - The session's own account is read through Claude Code's credential handle, which keeps the secret inside Claude Code.
  - Every other account is read by the helper process above.
  - So no token passes through the mod, or through the events other installed mods can hook (file reads, web requests, process runs).
  - Tokens are only ever sent to `https://api.anthropic.com`.
- **Programs run only by full path, from your home folder.** That is `claude` (or your `claudePath`) and the helper. A program looked up by name could resolve to a file planted in a cloned repository's folder.
- **Text from outside is cleaned:** folder names have control characters, terminal escapes among them, removed before they are drawn or put in a notification.
- **What is saved:** only labels, percentages and reset times.
- **E-mails and organization IDs:** held in memory only. Other mods can read a mod's shared state, so these are kept out of it.
- **Credentials files:** the mod itself never reads or writes them, never refreshes a login, and never switches accounts. Claude Code manages every profile's sign-in.
- **Same organization only:** suggestions never move a work conversation to an account outside its organization.
- **No-traffic setting:** `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` stops all polling of other accounts.

### Things to know

- **Undocumented endpoint:** Anthropic can change or restrict the usage endpoint without notice. If it does, the affected accounts show `no reading, retrying` instead of breaking. The account you are signed into keeps updating from Claude Code's own readings.
- **Plain-text logins:** each profile is a full Claude Code login on disk, stored like your main one (`.credentials.json`). Keep your disk encrypted.
- **macOS:** Claude Code keeps logins in the macOS Keychain, not in `.credentials.json`, so extra profiles show `not signed in` there. The account you are signed into still works. Tested on Windows. The Linux helper was tested under Git Bash with `curl`.
- **Token renewal:** access tokens last about 8 hours. When one is close to expiry, the mod runs `claude auth status` for that profile so Claude Code can renew it. If a profile still lapses, it shows `sign-in expired`.
- **Terms of use:** switching stays manual by design. Anthropic's terms restrict account sharing and getting around usage limits, so check your plan's terms before relying on several accounts.

### Develop

```
account-bars/
  .claude-plugin/plugin.json   manifest, the `order` option
  hooks/hooks.json             names the hooks module
  hooks/register.tsx           sidebar, /accounts, polling, limit notice
  hooks/usage.ts               parsing, bands, bars, time text
  hooks/probe.ts               the helper that reads other accounts (Windows PowerShell, sh + curl)
  hooks/next.ts                pickNext(): who is suggested
  types/index.d.ts             the mod's state contract
  tests/account-bars.test.ts   colour bands, parsing, drawing, credential handling, limit notice
```

```
claude plugin validate account-bars
claude plugin test account-bars
```

Claude Code writes the API's type declarations into `account-bars/.claude-plugin/types/` whenever it loads the mod; `tsconfig.json` extends them. That folder is git-ignored: it is regenerated per build and lists the MCP tools connected on the machine that loaded it.

---

## tool-icons

Colored icons at the start of each tool line, such as read, edit, write, delete, shell, search, web, MCP and agents. It has switchable styles, color themes, and two looks: a badge chip and a gradient label.

```
/plugin install tool-icons --marketplace raoofaltaher/claude-code-mods
```

`/icons` previews everything. `/icons <style>`, `/icons <theme>`, `/icons badge | gradient | plain` and `/icons off | on` change it. Some styles need a Nerd Font, such as Cascadia Mono NF.

- Shell lines show the **command itself**, never the model's description of it. A multi-line command is marked, e.g. `(3 lines) …`.
- The red delete icon is a hint read from the command's wording, not a safety check.
- `tool-icons` only redraws transcript rows, never the approval dialog.
