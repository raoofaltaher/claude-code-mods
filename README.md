# Claude Code mods

A mod for Claude Code's function-hooks plugin system:

- **[tool-icons](#tool-icons)**: colored icons on tool lines.

Tested on Claude Code **2.1.296**. Mods are an early-access API that can change between releases.

---

## tool-icons

Colored icons at the start of each tool line, such as read, edit, write, delete, shell, search, web, MCP and agents. It has switchable styles, color themes, and two looks: a badge chip and a gradient label.

```
/plugin install tool-icons --marketplace raoofaltaher/claude-code-mods
```

`/icons` previews everything. `/icons <style>`, `/icons <theme>`, `/icons badge | gradient | plain` and `/icons off | on` change it. Some styles need a Nerd Font, such as Cascadia Mono NF.

- Any built-in tool that runs a command (Bash, PowerShell, Monitor) shows the **command itself**, never the model's description of it.
  - A multi-line command is marked, e.g. `(3 lines) …`.
  - A long one keeps its start and its end, so what it ends with stays in sight.
- Other tools show what they act on (a recipient, a schedule, a link) ahead of any description.
- The red delete icon is a hint read from the command's wording, not a safety check.
- `tool-icons` only redraws transcript rows, never the approval dialog.
- Its rows show the call, not the tool's output. Run `/icons off` to see Claude Code's own rows, output and error text included.
- Control and format characters are removed from every row: terminal escapes, bidi overrides and zero-width marks.
