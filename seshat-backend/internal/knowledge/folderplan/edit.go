package folderplan

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/KPO-Tech/seshat-runtime/pkg/collectionplan"
)

// MaxNameLength is the longest name a collection can be given, in characters.
const MaxNameLength = 120

// ErrInvalidEdit is returned for a change the plan cannot take: a collection that is not there, a name that is empty, too long or taken.
var ErrInvalidEdit = errors.New("invalid change to the plan")

func invalid(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalidEdit, fmt.Sprintf(format, args...))
}

// The edits below work on an analysis the caller holds (see Store.Update). They only reorganise the files the scan found: none of them
// takes a path from the person, which is what keeps the plan from naming a file the scan did not see.

func checkName(a *Analysis, name string, except map[int]bool) (string, error) {
	name = strings.Join(strings.Fields(name), " ")
	switch {
	case name == "":
		return "", invalid("a collection needs a name")
	case utf8.RuneCountInString(name) > MaxNameLength:
		return "", invalid("a name is at most %d characters", MaxNameLength)
	}
	for i, c := range a.Plan.Collections {
		if !except[i] && strings.EqualFold(c.Name, name) {
			return "", invalid("another collection is already named %q", c.Name)
		}
	}
	return name, nil
}

func checkIndex(a *Analysis, i int) error {
	if i < 0 || i >= len(a.Plan.Collections) {
		return invalid("there is no collection %d", i)
	}
	return nil
}

// Rename gives a collection another name.
func Rename(a *Analysis, index int, name string) error {
	if err := checkIndex(a, index); err != nil {
		return err
	}
	name, err := checkName(a, name, map[int]bool{index: true})
	if err != nil {
		return err
	}
	a.Plan.Collections[index].Name = name
	sortCollections(a)
	return nil
}

// Remove takes a collection out of the plan: its files are listed as left out, with the reason, and nothing is deleted from disk.
func Remove(a *Analysis, index int) error {
	if err := checkIndex(a, index); err != nil {
		return err
	}
	for _, f := range a.Plan.Collections[index].Files {
		a.Plan.Excluded = append(a.Plan.Excluded, collectionplan.Excluded{Path: f, Reason: "removed from the plan"})
	}
	a.Plan.Collections = append(a.Plan.Collections[:index], a.Plan.Collections[index+1:]...)
	return nil
}

// Merge puts several collections into one with the given name; the merged collection is placed by its name, like the others.
func Merge(a *Analysis, indexes []int, name string) error {
	seen := map[int]bool{}
	for _, i := range indexes {
		if err := checkIndex(a, i); err != nil {
			return err
		}
		if seen[i] {
			return invalid("collection %d is named twice", i)
		}
		seen[i] = true
	}
	if len(seen) < 2 {
		return invalid("merging needs at least two collections")
	}
	name, err := checkName(a, name, seen)
	if err != nil {
		return err
	}
	merged := collectionplan.Collection{Name: name}
	folders := map[string]bool{}
	var kept []collectionplan.Collection
	for i, c := range a.Plan.Collections {
		if !seen[i] {
			kept = append(kept, c)
			continue
		}
		merged.Files = append(merged.Files, c.Files...)
		merged.Bytes += c.Bytes
		for _, f := range c.Folders {
			folders[f] = true
		}
	}
	sort.Strings(merged.Files)
	for f := range folders {
		merged.Folders = append(merged.Folders, f)
	}
	sort.Strings(merged.Folders)
	a.Plan.Collections = append(kept, merged)
	sortCollections(a)
	return nil
}

func sortCollections(a *Analysis) {
	sort.SliceStable(a.Plan.Collections, func(i, j int) bool {
		return strings.ToLower(a.Plan.Collections[i].Name) < strings.ToLower(a.Plan.Collections[j].Name)
	})
}
