package folderplan

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/KPO-Tech/seshat-runtime/pkg/collectionplan"
)

func samplePlan() collectionplan.Plan {
	return collectionplan.Plan{Collections: []collectionplan.Collection{
		{Name: "Contracts", Files: []string{"Contracts/a.pdf", "Contracts/b.pdf"}, Bytes: 20, Folders: []string{"Contracts"}},
		{Name: "Invoices", Files: []string{"Invoices/i.pdf"}, Bytes: 5, Folders: []string{"Invoices"}},
		{Name: "Notes", Files: []string{"Notes/n.txt", "Notes/o.txt"}, Bytes: 7, Folders: []string{"Notes"}},
	}}
}

func analysis() *Analysis { return &Analysis{ID: "id", UserID: "u", Plan: samplePlan()} }

func nameList(a *Analysis) []string {
	var out []string
	for _, c := range a.Plan.Collections {
		out = append(out, c.Name)
	}
	return out
}

func TestRenameChangesTheNameAndKeepsTheOrderByName(t *testing.T) {
	a := analysis()
	if err := Rename(a, 0, "  Legal   papers "); err != nil {
		t.Fatal(err)
	}
	if got, want := nameList(a), []string{"Invoices", "Legal papers", "Notes"}; !reflect.DeepEqual(got, want) {
		t.Errorf("names = %v, want %v (a name is trimmed, spaces collapsed, and the list stays ordered)", got, want)
	}
	if got := a.Plan.Collections[1].Files; len(got) != 2 {
		t.Errorf("the files of the renamed collection = %v", got)
	}
}

func TestRenameRefusesWhatIsNotAName(t *testing.T) {
	cases := map[string]struct {
		index int
		name  string
	}{
		"an empty name":        {0, "   "},
		"a name that is taken": {0, "invoices"}, // case does not matter
		"a name too long":      {0, strings.Repeat("x", MaxNameLength+1)},
		"no such collection":   {9, "Fine"},
		"a negative index":     {-1, "Fine"},
	}
	for name, c := range cases {
		a := analysis()
		if err := Rename(a, c.index, c.name); !errors.Is(err, ErrInvalidEdit) {
			t.Errorf("%s: err = %v, want ErrInvalidEdit", name, err)
		}
	}
	a := analysis()
	if err := Rename(a, 0, "Contracts"); err != nil {
		t.Errorf("giving a collection its own name again is allowed: %v", err)
	}
}

func TestRemoveListsTheFilesAsLeftOutAndDeletesNothingElse(t *testing.T) {
	a := analysis()
	if err := Remove(a, 2); err != nil {
		t.Fatal(err)
	}
	if got, want := nameList(a), []string{"Contracts", "Invoices"}; !reflect.DeepEqual(got, want) {
		t.Errorf("names = %v, want %v", got, want)
	}
	if len(a.Plan.Excluded) != 2 || a.Plan.Excluded[0].Reason != "removed from the plan" || a.Plan.Excluded[1].Path != "Notes/o.txt" {
		t.Errorf("excluded = %+v", a.Plan.Excluded)
	}
	if err := Remove(a, 5); !errors.Is(err, ErrInvalidEdit) {
		t.Errorf("removing a collection that is not there: %v", err)
	}
}

func TestMergePutsCollectionsTogetherUnderOneName(t *testing.T) {
	a := analysis()
	if err := Merge(a, []int{2, 0}, "Papers"); err != nil {
		t.Fatal(err)
	}
	if got, want := nameList(a), []string{"Invoices", "Papers"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("names = %v, want %v", got, want)
	}
	merged := a.Plan.Collections[1]
	if want := []string{"Contracts/a.pdf", "Contracts/b.pdf", "Notes/n.txt", "Notes/o.txt"}; !reflect.DeepEqual(merged.Files, want) {
		t.Errorf("files = %v, want %v", merged.Files, want)
	}
	if merged.Bytes != 27 || !reflect.DeepEqual(merged.Folders, []string{"Contracts", "Notes"}) {
		t.Errorf("bytes %d, folders %v", merged.Bytes, merged.Folders)
	}
}

func TestMergeMayKeepTheNameOfOneOfTheCollectionsItMerges(t *testing.T) {
	a := analysis()
	if err := Merge(a, []int{0, 1}, "contracts"); err != nil {
		t.Errorf("the name of a merged collection is free again: %v", err)
	}
}

func TestMergeRefusesWhatCannotBeMerged(t *testing.T) {
	cases := map[string]struct {
		indexes []int
		name    string
	}{
		"one collection":          {[]int{0}, "X"},
		"none":                    {nil, "X"},
		"the same one twice":      {[]int{1, 1}, "X"},
		"one that is not there":   {[]int{0, 7}, "X"},
		"a name taken by another": {[]int{0, 1}, "Notes"},
		"no name":                 {[]int{0, 1}, ""},
	}
	for name, c := range cases {
		a := analysis()
		if err := Merge(a, c.indexes, c.name); !errors.Is(err, ErrInvalidEdit) {
			t.Errorf("%s: err = %v, want ErrInvalidEdit", name, err)
		}
	}
}

func TestAFailedEditLeavesTheStoredPlanAsItWas(t *testing.T) {
	s := NewStore(time.Hour, 5)
	an := s.Add("u", "/archive", 5, samplePlan())
	_, err := s.Update("u", an.ID, func(a *Analysis) error {
		if err := Remove(a, 0); err != nil { // succeeds on the copy...
			return err
		}
		return Rename(a, 9, "x") // ...then fails
	})
	if !errors.Is(err, ErrInvalidEdit) {
		t.Fatalf("err = %v", err)
	}
	got, _ := s.Get("u", an.ID)
	if len(got.Plan.Collections) != 3 || len(got.Plan.Excluded) != 0 {
		t.Errorf("the plan changed: %d collections, %d excluded", len(got.Plan.Collections), len(got.Plan.Excluded))
	}
}

func TestAnEditDoesNotChangeAPlanThatWasAlreadyRead(t *testing.T) {
	s := NewStore(time.Hour, 5)
	an := s.Add("u", "/archive", 5, samplePlan())
	before, _ := s.Get("u", an.ID)
	if _, err := s.Update("u", an.ID, func(a *Analysis) error { return Rename(a, 0, "Renamed") }); err != nil {
		t.Fatal(err)
	}
	if before.Plan.Collections[0].Name != "Contracts" {
		t.Error("a plan that a request was reading changed under it")
	}
	after, _ := s.Get("u", an.ID)
	if got, want := nameList(after), []string{"Invoices", "Notes", "Renamed"}; !reflect.DeepEqual(got, want) {
		t.Errorf("the update was not stored: %v, want %v", got, want)
	}
}

func TestOnlyTheOwnerUpdatesAnAnalysis(t *testing.T) {
	s := NewStore(time.Hour, 5)
	an := s.Add("u", "/archive", 5, samplePlan())
	if _, err := s.Update("someone-else", an.ID, func(*Analysis) error { return nil }); !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
	if _, err := s.Update("u", "unknown", func(*Analysis) error { return nil }); !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}
