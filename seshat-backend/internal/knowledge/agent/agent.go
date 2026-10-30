// Package knowledgeagent defines the Knowledge agent: the agent behind the Ask view of the Knowledge platform. It is built into the
// product, not stored in the database, so that what it may do (the exact tools it has, the prompt it follows) is not something a
// user-defined agent or an organization preset can replace by taking the same slug.
//
// Who may read a document is decided by the knowledge backend, per person, whatever this agent asks for: the agent narrows what it
// can do, it never widens what the person can see.
package knowledgeagent

import (
	knowledgetool "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/tool"
	pkgagent "github.com/KPO-Tech/seshat-runtime/pkg/agent"
)

// Slug is the agent_slug a conversation uses to talk to the Knowledge agent.
const Slug = "knowledge"

// Tools is the exact list of tools the agent has, and no other: the session is pruned down to them. All read only.
// It grows by decision, one tool at a time; a list of patterns would fail open (see toolAllowlistFromPatterns in internal/query).
func Tools() []string {
	return []string{knowledgetool.ToolName, knowledgetool.ReadToolName}
}

// IsKnowledge reports whether a slug is the Knowledge agent's.
func IsKnowledge(slug string) bool {
	return slug == Slug
}

// Definition returns the agent as the engine reads it. A fresh value each time: callers may adjust their copy.
func Definition() *pkgagent.AgentDefinition {
	prompt := Prompt
	return &pkgagent.AgentDefinition{
		AgentType:       Slug,
		WhenToUse:       "Answer a question from the documents of the organization the person can read, with the passages cited.",
		Source:          pkgagent.AgentSource("built-in"),
		Tools:           Tools(),
		GetSystemPrompt: func() string { return prompt },
	}
}

// ScopeBlock is added to the prompt when the person limited the question to one collection. The limit is applied by the search tool;
// this tells the agent what it means for what it may conclude.
const ScopeBlock = `## Scope of this question

The person limited this question to one collection. Every search you make is already restricted to it: you do not need to say where to look. A search that finds nothing means that this collection has nothing on it, not that the organization has nothing. Say so in those terms, and mention that the person can widen the question to all collections.`
