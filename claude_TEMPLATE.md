# CLAUDE.md — Project Template

> This template defines the structure for every `claude.md` created at the start of a new project or game. Replace the *italicized explanations* in each section with real project content. Delete this header block in the final version.

---

## CSS

<style>
  /* Vocabulary color coding */
  .vocab-new    { color: cyan; }    /* Claude-proposed definition — awaiting approval */
  .vocab-ok     { color: green; }   /* Mikey-approved definition — safe to use */

  /* Status badges */
  .status-new   { color: orange; }
  .status-worse { color: red; }
  .status-less  { color: yellow; }
  .status-solved { color: limegreen; }
  .status-perfect { color: gold; }
</style>

*Add any project-specific CSS classes here for consistent styling across the doc. The above defaults handle vocabulary and problem-status coloring.*

---

## Philosophy

### Philosophy
*Describe the user's core thinking about UX and game flow for this project. What does a good player experience feel like? What drives design decisions? What matters most — feel, speed, clarity, juice? Capture the creative direction and decision-making lens that should guide every implementation choice.*

### Rules
*Populated from explicit "never" and "always" statements made during development. Each rule should reference what triggered it.*

**ALWAYS:**
- *e.g. ALWAYS include easy-to-edit floated variables for position, scale, rotation, color, and custom text strings for anything added to the game*
- *e.g. ALWAYS name tuning variables clearly so their purpose is obvious*

**NEVER:**
- *e.g. NEVER break a working feature to implement a new one*
- *e.g. NEVER commit changes without explicit user request*

### Vocabulary
> **How this works:** Mikey only needs to change `[N]` to `[Y]` to approve.
> Claude will update colors and status labels automatically next time it reads this file.
> Claude should ONLY treat `[Y]` definitions as trusted context.
<div style="color:red"><b>example word</b> <code>[N]</code><br>Claude's proposed definition goes here — <b>DRAFT</b></div>

<!-- Approved example: -->
<!-- <div style="color:green"><b>example word</b> <code>[Y]</code><br>Mikey-approved definition here — <b>APPROVED</b></div> -->

---

## Recycled Code

### Included
> Tested, approved features from the template library. Change `[N]` to `[Y]` and `color:red` to `color:green` to include a feature in this new project. Claude will clone all necessary files (code, assets, configs) as an independent working copy.

<!-- [N] = red (skip), [Y] = green (include in new project). -->

*No features available yet. Features approved in projects will appear here for future use.*

<!-- Example of an available template feature: -->
<!-- <div style="color:red"><b>Feature Name</b> <code>[N]</code><br>One-line description — flip to [Y] to include</div> -->

### Added
> New features developed during this project. Start as red `[N]` **WIP**. When approved by Mikey, turn green `[Y]` **Approved** and get added to the Included section of `claude_TEMPLATE.md` for future projects. Added features stay here even after approval — they belong to the project they were built in.
>
> Every change should map to a feature. If we improve an existing template feature during development, update the template version too.

<!-- [N] = red + WIP, [Y] = green + Approved. Change color, tag, and status together. -->

<div style="color:red"><b>Feature Name</b> <code>[N]</code><br>One-line description — <b>WIP</b></div>

<!-- Approved example: -->
<!-- <div style="color:green"><b>Feature Name</b> <code>[Y]</code><br>One-line description — <b>Approved</b></div> -->

### Templates Root Folder
*Location: `_templates/` — Each feature gets a subfolder containing everything needed to work standalone.*

---

## Brief

### Brief Template Location
*File: `brief_TEMPLATE.md` — Read this FIRST before reading any project brief to understand the layout and how to interpret each section.*

### Project Brief
*File: `[project_brief_filename]` — Located at: `[path/to/brief]`*

*The brief is the kickstart document for this specific project. It defines what we're building, the tech stack, core mechanics, milestones, and acceptance criteria. Every project gets a unique brief.*

---

## Context

### Project Overview
*High-level summary: What is this project? What's the goal? What tech stack? What's the current state?*

### File Map
*Key files and their locations. Keep this updated as files are added/moved/renamed.*

| File | Location | Purpose |
|------|----------|---------|
| *example* | *`src/systems/Example.ts`* | *One-line description* |

### Feature List

#### Original Features (from Brief)
*Features that were part of the initial brief/plan.*

- *e.g. Core movement — mouse Y control, space tapping for speed*
- *e.g. Obstacle system — crash, slow, destructible types with pooling*

#### New Features (added during development)
*Features developed after the initial brief. These are candidates for the Recycled Code registry.*

- *e.g. CRT shader pipeline — post-processing CRT scanline effect*
- *e.g. Puddle reflection system — dynamic reflections below road*

### Changes Log
*Track what changed, why, and when. Most recent first.*

| Date | What Changed | Why | Files Affected |
|------|-------------|-----|----------------|
| *YYYY-MM-DD* | *Description of change* | *Reason for the change* | *`file1.ts`, `file2.ts`* |

### Major Bugs
*Game-breaking bugs encountered. Document these to avoid repeating the same logic patterns that caused them.*

| Bug | Root Cause | Lesson Learned |
|-----|-----------|----------------|
| *Description* | *What caused it* | *What to avoid in the future* |

### Problem Tracker
*Track problems through their lifecycle. Status flows: `new` → `worse` / `less` / `solved`*

*If a problem becomes `worse`, STOP and rethink the approach using the Philosophy section as a guide.*
*If a problem is `solved`, study what worked and repeat that problem-solving pattern.*

| Problem | Status | Action Log |
|---------|--------|-----------|
| *Description* | *<span class="status-new">new</span>* | *Action 1: tried X → result. Action 2: tried Y → result.* |

### General Notes
*Important context to keep in mind. Things that should never be forgotten as we work.*

- *e.g. The countdown audio file and these YouTube tracks are the same song — never play them back to back*
- *e.g. Death screen uses separate avatar constants from profile popup*

### <span class="status-perfect">Perfect Items</span>
*When Mikey says something is "perfect", record it here. Everything related to a perfect item must be protected from changes at all costs.*

| Item | What's Perfect | Related Files | Date |
|------|---------------|---------------|------|
| *e.g. Puddle reflections* | *Visual appearance and scroll sync* | *`ReflectionSystem.ts`, `tuning.ts`* | *YYYY-MM-DD* |
