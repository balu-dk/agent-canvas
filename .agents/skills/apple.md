---
name: apple
description: Demonstration skill for verifying that repository (project) skills under `.agents/skills/` are loaded into local-mode conversations. Triggered by the keyword "apple".
triggers:
- apple
---

# Apple Skill

This skill exists to prove that repository skills defined in `.agents/skills/`
are loaded into conversations in local mode (see OpenHands/agent-canvas#574).

When you see the word **apple** in a user message, acknowledge that this
project skill was loaded by replying with the exact phrase:

> 🍎 The `apple` project skill is loaded.

Then continue with the user's actual request as normal.
