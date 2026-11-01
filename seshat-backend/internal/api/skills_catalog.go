package api

// DefaultFeaturedRepos are always included in the catalog unless the operator sets SESHAT_FEATURED_SKILL_REPOS to override them entirely.
//
// Each entry was read before it was listed: the repository answers, is not archived, has a licence that lets it be installed, and the
// skills chosen from it were opened and checked. Skills is the choice made from a larger repository; the others stay unused on disk. The
// repository folder is named after Name, so that two repositories that end in the same word ("skills") never share one.
//
// Checked on 2026-10-31. Removed: gstack, which is written for Claude Code (its setup script, its hooks in ~/.claude, its commands).
var DefaultFeaturedRepos = []FeaturedSkillRepo{
	{
		Name:        "remotion-skills",
		URL:         "https://github.com/remotion-dev/skills",
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
		Description: "Makes editable PowerPoint decks from a topic, a document, a PDF or a web page, with native shapes, charts, transitions and optional narration.",
		Category:    "Presentations",
		Needs:       []string{"Python 3.10+"},
		Skills:      []string{"ppt-master"},
	},
	{
		Name:        "strix",
		URL:         "https://github.com/usestrix/strix",
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
		Description: "Pour la paperasse française : comptabilité, fiscalité, notariat, syndic, commissariat aux comptes et contrôle fiscal.",
		Category:    "Administration (FR)",
		Needs:       []string{"Node.js"},
		Skills:      []string{"comptable", "fiscaliste", "controleur-fiscal", "commissaire-aux-comptes", "notaire", "syndic"},
	},
	{
		Name:        "linkedin-skills",
		URL:         "https://github.com/sergebulaev/linkedin-skills",
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
