# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

- Use **Report a vulnerability** in the Security tab of this repository (a private report that only the maintainers see), or
- write to **seshatsupport@seshat-ai.com**.

Say which version and which system you use, what you did, what you expected and what happened, and what an attacker could do with it.
A short proof of concept helps. We read every report and answer as soon as we can, and we tell you what we plan to do about it. Please give
us the time to fix it before you speak about it in public; we credit you in the release notes if you want.

## Supported versions

Only the latest release of SeshatOS receives security fixes. The installers and the update feed are on the
[releases page](https://github.com/KPO-Tech/SeshatOS/releases).

## What is in scope

- The desktop app and its local backend (the API on the loopback address, sessions, files, the permissions of the agent).
- The installers and the way the app updates itself.
- The way the app installs and prepares skills from the catalog (downloads, copies, environments).

What a third-party skill repository contains is the work of its authors: report a problem in a skill to them. If the catalog installs a
commit that you believe is harmful, tell us, so that we move the entry.

## Good to know

- The backend listens on `127.0.0.1` only, and the app sends no usage data. The permission mode "No confirmation" runs every action
  without asking: use it only in a folder you trust.
- The Windows installer is not signed yet, and the macOS app is not notarized. Check the `SHA256SUMS.txt` of a release if you download it
  by hand.
