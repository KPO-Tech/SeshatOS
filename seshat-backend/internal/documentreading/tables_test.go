package documentreading

import (
	"context"
	"errors"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/documentreader"
	"github.com/KPO-Tech/seshat/pkg/pdfsmart"
)

// tableReader is a reader that, like the native one with its models, can say where the tables with no lines are.
type tableReader struct {
	fakeConverter
	tables []pdfsmart.TableStructure
	err    error
	asked  int
}

func (r *tableReader) FindTables(context.Context, []byte, int) ([]pdfsmart.TableStructure, error) {
	r.asked++
	return r.tables, r.err
}

var oneTable = []pdfsmart.TableStructure{{X0: 1, Top: 2, X1: 3, Bottom: 4}}

func TestAWrappedReaderPassesTheTableQuestionOn(t *testing.T) {
	native := &tableReader{tables: oneTable}
	external := fakeConverter{markdown: "from the server"}

	policy := NewPolicyConverterWithLocalAdvanced(native, external, false)
	got, err := policy.FindTables(context.Background(), nil, 0)
	if err != nil || len(got) != 1 || native.asked != 1 {
		t.Fatalf("policy: tables=%v err=%v asked=%d", got, err, native.asked)
	}

	processor := NewProcessorConverter(func(context.Context) documentreader.Converter { return policy })
	got, err = processor.FindTables(context.Background(), nil, 0)
	if err != nil || len(got) != 1 {
		t.Fatalf("processor: tables=%v err=%v", got, err)
	}
}

func TestTheFallbackReaderAsksTheLocalReaderFirstThenTheOther(t *testing.T) {
	local := &tableReader{}
	second := &tableReader{tables: oneTable}
	reader := fallbackConverter{First: local, Second: second}
	got, err := reader.FindTables(context.Background(), nil, 0)
	if err != nil || len(got) != 1 || local.asked != 1 || second.asked != 1 {
		t.Fatalf("tables=%v err=%v local=%d second=%d", got, err, local.asked, second.asked)
	}

	failing := fallbackConverter{First: &tableReader{err: errors.New("models missing")}, Second: fakeConverter{}}
	if got, err := failing.FindTables(context.Background(), nil, 0); err != nil || got != nil {
		t.Fatalf("a failed model must read as no tables: %v, %v", got, err)
	}
}

func TestReadersThatCannotFindTablesAnswerNothing(t *testing.T) {
	for name, reader := range map[string]pdfsmart.TableFinder{
		"policy without a local reader": NewPolicyConverter(fakeConverter{}, true),
		"processor without a resolver":  NewProcessorConverter(nil),
		"nil processor converter":       (*ProcessorConverter)(nil),
	} {
		if got, err := reader.FindTables(context.Background(), nil, 0); err != nil || got != nil {
			t.Errorf("%s: tables=%v err=%v", name, got, err)
		}
	}
}
