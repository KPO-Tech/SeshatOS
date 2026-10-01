package inbox

import "testing"

func TestEvaluateEventFilterEmptyAlwaysMatches(t *testing.T) {
	matched, err := EvaluateEventFilter("", map[string]any{"subject": "hello"})
	if err != nil {
		t.Fatalf("EvaluateEventFilter: %v", err)
	}
	if !matched {
		t.Fatal("expected an empty filter to always match")
	}
}

func TestEvaluateEventFilterTrueMatch(t *testing.T) {
	payload := InboxMessageEvent{Subject: "Invoice #42 due"}.Payload()
	matched, err := EvaluateEventFilter(`$event.subject.includes("Invoice")`, payload)
	if err != nil {
		t.Fatalf("EvaluateEventFilter: %v", err)
	}
	if !matched {
		t.Fatal("expected the filter to match a subject containing \"Invoice\"")
	}
}

func TestEvaluateEventFilterFalseMatch(t *testing.T) {
	payload := InboxMessageEvent{Subject: "Lunch tomorrow?"}.Payload()
	matched, err := EvaluateEventFilter(`$event.subject.includes("Invoice")`, payload)
	if err != nil {
		t.Fatalf("EvaluateEventFilter: %v", err)
	}
	if matched {
		t.Fatal("expected the filter to NOT match a subject without \"Invoice\"")
	}
}

func TestEvaluateEventFilterMultipleFields(t *testing.T) {
	payload := InboxMessageEvent{
		Channel: "gmail",
		Sender:  "billing@acme.example",
		Subject: "Invoice #42 due",
	}.Payload()
	matched, err := EvaluateEventFilter(
		`$event.channel === "gmail" && $event.sender.includes("billing") && $event.subject.includes("Invoice")`,
		payload,
	)
	if err != nil {
		t.Fatalf("EvaluateEventFilter: %v", err)
	}
	if !matched {
		t.Fatal("expected a filter combining multiple $event fields to match")
	}
}

func TestEvaluateEventFilterInvalidExpressionErrors(t *testing.T) {
	_, err := EvaluateEventFilter("this is not valid javascript {{{", nil)
	if err == nil {
		t.Fatal("expected an error for a syntactically invalid filter expression")
	}
}

func TestEvaluateEventFilterNonBooleanResultErrors(t *testing.T) {
	_, err := EvaluateEventFilter(`$event.subject`, InboxMessageEvent{Subject: "hello"}.Payload())
	if err == nil {
		t.Fatal("expected an error when the filter evaluates to a non-boolean value")
	}
}
