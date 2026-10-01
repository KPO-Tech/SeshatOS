package skills

// WriteParams is the domain payload for creating or updating a skill file.
type WriteParams struct {
	DisplayName  string
	Description  string
	ArgumentHint string
	Content      string
	Enabled      *bool
}

// PatchParams carries optional fields for a partial skill update.
type PatchParams struct {
	DisplayName  *string
	Description  *string
	ArgumentHint *string
	Content      *string
	Enabled      *bool
}

// TreeNode is one entry in a recursive skill file tree.
type TreeNode struct {
	Name     string      `json:"name"`
	Path     string      `json:"path"`
	IsDir    bool        `json:"is_dir"`
	Children []*TreeNode `json:"children,omitempty"`
}
