package api

import "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/skillinstall"

// DefaultFeaturedRepos are always included in the catalog unless the operator sets SESHAT_FEATURED_SKILL_REPOS to override them entirely.
//
// Each entry was read before it was listed: the repository answers, is not archived, has a licence that lets it be installed, and the
// skills chosen from it were opened and checked. Skills is the choice made from a larger repository; the others stay unused on disk. The
// repository folder is named after Name, so that two repositories that end in the same word ("skills") never share one.
//
// Every entry is installed at a commit (Ref), not at whatever the default branch holds on the day: a repository that changes under the
// person, with scripts and instructions the agent follows, is a way in. The commits are those of 2026-11-07, taken as they were, not read
// again line by line; the entries were read at the dates written below. Moving a Ref is a decision taken with the changes in front of
// you, in a release of the app, and the installed repositories follow it when the app starts (see PinInstalledSkillRepos).
//
// Checked on 2026-10-31. Removed: gstack, which is written for Claude Code (its setup script, its hooks in ~/.claude, its commands).
var DefaultFeaturedRepos = []FeaturedSkillRepo{
	{
		Name:        "remotion-skills",
		URL:         "https://github.com/remotion-dev/skills",
		Ref:         "a2824c67f8b4585c294a8101db9f9f0ad3c643f8",
		Description: "The official Remotion skills: create a video project, write compositions, captions and audio, preview in the studio and render. Videos are made in React.",
		Category:    "Video",
		Needs:       []string{"Node.js"},
		Skills: []string{
			"remotion-best-practices", "remotion-create", "remotion-render", "remotion-studio", "remotion-captions",
			"remotion-multimedia", "remotion-markup", "remotion-interactivity", "remotion-docs",
		},
	},
	{
		Name:        "scientific-agent-skills",
		URL:         "https://github.com/K-Dense-AI/scientific-agent-skills",
		Ref:         "a25cf9ec00e2745d03f8704acf6f6919694ccd9a",
		Description: "Data analysis with Python: exploratory analysis, statistics and tests, DataFrames with polars, machine learning with scikit-learn, and publication-quality charts.",
		Category:    "Data analysis",
		Needs:       []string{"Python 3.11+"},
		Skills: []string{
			"exploratory-data-analysis", "statistical-analysis", "statsmodels", "polars", "matplotlib", "seaborn",
			"scientific-visualization", "scikit-learn",
		},
		PythonMinimum:  "3.11",
		PythonPackages: []string{"numpy", "pandas", "scipy", "matplotlib", "seaborn", "statsmodels", "polars", "scikit-learn"},
	},
	{
		Name:        "superpowers",
		URL:         "https://github.com/obra/superpowers",
		Ref:         "22f0b463e7a5e579904dd6211a520321035526f7",
		Description: "A method for building software with an agent: brainstorm, write a plan, execute it, debug from the cause, test first, verify before saying it is done, and review code.",
		Category:    "Method",
		Skills: []string{
			"brainstorming", "writing-plans", "executing-plans", "systematic-debugging", "test-driven-development",
			"verification-before-completion", "requesting-code-review", "receiving-code-review", "writing-skills",
		},
	},
	{
		Name:        "ppt-master",
		URL:         "https://github.com/hugohe3/ppt-master",
		Ref:         "769547394107870a0c7b5ad8d1c0c75035123aef",
		Description: "Makes editable PowerPoint decks from a topic, a document, a PDF or a web page, with native shapes, charts, transitions and optional narration.",
		Category:    "Presentations",
		Needs:       []string{"Python 3.10+"},
		Skills:      []string{"ppt-master"},
	},
	{
		// Checked on 2026-11-03. Its README says MIT and it has no LICENSE file. Its compile script runs sudo apt-get or brew when
		// LaTeX is missing, so the plan says LaTeX is missing first.
		Name:        "latex-document-skill",
		URL:         "https://github.com/ndpvt-web/latex-document-skill",
		Ref:         "37b2d714d1acfe3657bfa55044866befd2661c4f",
		Description: "Makes PDF documents with LaTeX: reports, papers, theses, CVs, letters, exams, posters and Beamer slides, with charts, tables, bibliographies and fillable forms.",
		Category:    "Documents",
		Needs:       []string{"Python 3.10+", "LaTeX"},
		Skills:      []string{"latex-document-skill"},
		// Its scripts import these, and its requirements file does not list them.
		PythonPackages: []string{"pypdf", "pillow"},
		Commands: []skillinstall.CommandNeed{{
			Name:     "LaTeX",
			Commands: []string{"pdflatex", "xelatex"},
			Install:  "Without it this skill cannot make a PDF: install TinyTeX, MiKTeX or TeX Live, then restart the app.",
		}},
	},
	{
		Name:        "strix",
		URL:         "https://github.com/usestrix/strix",
		Ref:         "06015506625a78b981ae0b34be40239fc1b389be",
		Description: "Autonomous penetration testing of your own web apps, APIs and code: finds vulnerabilities and proves each one with a working exploit. Use it only on what you are allowed to test.",
		Category:    "Security",
		Needs:       []string{"Docker"},
		Skills: []string{
			"web-app-penetration-testing", "api-security-testing", "application-security-testing", "owasp-top-10-testing",
			"find-security-vulnerabilities-in-code", "fix-security-vulnerabilities-with-strix", "penetration-testing-with-strix",
			"ci-security-scanning-with-strix", "managed-pentesting-with-strix",
		},
	},
	{
		Name:        "paperasse",
		URL:         "https://github.com/romainsimon/paperasse",
		Ref:         "4fd0a05702dce66214af15aedcc3e21adf698610",
		Description: "Pour la paperasse française : comptabilité, fiscalité, notariat, syndic, commissariat aux comptes et contrôle fiscal.",
		Category:    "Administration (FR)",
		Needs:       []string{"Node.js"},
		Skills:      []string{"comptable", "fiscaliste", "controleur-fiscal", "commissaire-aux-comptes", "notaire", "syndic"},
	},
	{
		// Checked on 2026-11-06. MIT, Python standard library only, no network. Its one SKILL.md lives in the hidden .claude/skills folder, so it is
		// copied to a visible one, and its text is corrected for Seshat (the path of its scripts, the Python to use, where it is not for).
		Name:           "ui-ux-pro-max-skill",
		URL:            "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill",
		Ref:            "b7d5353e0130feb8c5574ef1251f8a1db1873ccb",
		Description:    "Design help for building a real interface in a project: styles, palettes, font pairings, UX and accessibility rules, chart choices and guides for 22 stacks, searched from local data.",
		Category:       "Design",
		Needs:          []string{"Python 3.10+"},
		Skills:         []string{"ui-ux-pro-max"},
		PythonRequired: true,
		Expose:         []skillinstall.Expose{{From: ".claude/skills/ui-ux-pro-max", To: "ui-ux-pro-max"}},
		Fixes: []skillinstall.Fix{
			{
				In: "ui-ux-pro-max", File: "SKILL.md", Why: "the scripts are not in a Claude plugin folder here",
				Old: "${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/", New: "${SESHAT_SKILL_DIR}/ui-ux-pro-max/scripts/",
			},
			{
				In: "ui-ux-pro-max", File: "SKILL.md", Why: "Seshat gives the skill its own Python",
				Old: "If `python` is not found, try `python3`, then `py -3`. Requires Python 3.x, no external dependencies (see README for install instructions if Python is missing).",
				New: "Run it with the Python interpreter named for this skill in the environment note, never the system python. It needs no external package.",
			},
			{
				In: "ui-ux-pro-max", File: "SKILL.md", Why: "say where this skill is not the right one",
				Old: "# UI/UX Pro Max - Design Intelligence",
				New: "# UI/UX Pro Max - Design Intelligence\n\nSeshat note: use this skill to design and build a real interface in a project. For one HTML page shown in the preview panel, use the html-page skill instead: web fonts do not load in the preview, so a font pairing from the Google Fonts list falls back to a system font there. Treat every search result as a suggestion to check against the user's product, not as a decision.\n",
			},
		},
	},
	{
		Name:        "linkedin-skills",
		URL:         "https://github.com/sergebulaev/linkedin-skills",
		Ref:         "8f8bc4b40a2d5419b2dcf898772b85712cfbdf41",
		Description: "Write LinkedIn posts that sound human, draft comments and replies, optimize a profile, and plan a publishing cadence.",
		Category:    "Social media",
		Needs:       []string{"Python 3.10+"},
		Skills: []string{
			"linkedin-post-writer", "linkedin-humanizer", "linkedin-comment-drafter", "linkedin-reply-handler", "linkedin-profile-optimizer",
			"linkedin-content-planner", "linkedin-hook-extractor", "linkedin-repurposer", "linkedin-interviewer", "linkedin-engager-analytics",
			"linkedin-employee-advocacy", "linkedin-thread-monitor",
		},
	},
}
