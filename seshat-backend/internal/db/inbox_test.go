package db

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestChannelAccountStore_CreateConnectAndGetSecret(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "inbox-connect@example.com")

	store, err := NewChannelAccountStore(database)
	if err != nil {
		t.Fatalf("NewChannelAccountStore: %v", err)
	}

	account, err := store.Create(ctx, CreateChannelAccountParams{
		UserID:  user.ID,
		Channel: ChannelGmail,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if account.Status != ChannelAccountStatusPending {
		t.Fatalf("expected pending status, got %q", account.Status)
	}

	connected, err := store.UpdateConnected(ctx, UpdateChannelAccountConnectedParams{
		ID:                account.ID,
		DisplayName:       "friend@restaurant.com",
		ExternalAccountID: "friend@restaurant.com",
		AccessToken:       "access-secret",
		RefreshToken:      "refresh-secret",
		Scope:             "gmail.readonly gmail.send",
		ExpiresAt:         time.Now().Add(time.Hour),
	})
	if err != nil {
		t.Fatalf("UpdateConnected: %v", err)
	}
	if connected.Status != ChannelAccountStatusConnected {
		t.Fatalf("expected connected status, got %q", connected.Status)
	}
	if !connected.HasRefreshToken {
		t.Fatal("expected HasRefreshToken to be true")
	}

	secret, err := store.GetSecret(ctx, account.ID)
	if err != nil {
		t.Fatalf("GetSecret: %v", err)
	}
	if secret.AccessToken != "access-secret" || secret.RefreshToken != "refresh-secret" {
		t.Fatalf("expected round-tripped decrypted secrets, got %+v", secret)
	}

	accounts, err := store.ListByUserID(ctx, user.ID)
	if err != nil {
		t.Fatalf("ListByUserID: %v", err)
	}
	if len(accounts) != 1 || accounts[0].ID != account.ID {
		t.Fatalf("expected 1 account for user, got %+v", accounts)
	}
}

func TestChannelAccountStore_UpdateSyncStateAndStatus(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "inbox-sync@example.com")

	store, err := NewChannelAccountStore(database)
	if err != nil {
		t.Fatalf("NewChannelAccountStore: %v", err)
	}
	account, err := store.Create(ctx, CreateChannelAccountParams{UserID: user.ID, Channel: ChannelWhatsApp})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := store.UpdateSyncState(ctx, UpdateChannelAccountSyncParams{
		ID:           account.ID,
		SyncCursor:   "cursor-123",
		LastSyncedAt: time.Now(),
	}); err != nil {
		t.Fatalf("UpdateSyncState: %v", err)
	}
	refreshed, err := store.GetByID(ctx, account.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if refreshed.SyncCursor != "cursor-123" {
		t.Fatalf("expected sync cursor to persist, got %q", refreshed.SyncCursor)
	}

	if err := store.UpdateStatus(ctx, account.ID, ChannelAccountStatusError, "session expired"); err != nil {
		t.Fatalf("UpdateStatus: %v", err)
	}
	refreshed, err = store.GetByID(ctx, account.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if refreshed.Status != ChannelAccountStatusError || refreshed.LastError != "session expired" {
		t.Fatalf("expected error status with message, got %+v", refreshed)
	}
}

func TestChannelAccountStore_GetByChannelAndExternalID(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "inbox-getbyext@example.com")

	store, err := NewChannelAccountStore(database)
	if err != nil {
		t.Fatalf("NewChannelAccountStore: %v", err)
	}
	created, err := store.Create(ctx, CreateChannelAccountParams{
		UserID:            user.ID,
		Channel:           ChannelGmail,
		ExternalAccountID: "owner@restaurant.com",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	found, ok, err := store.GetByChannelAndExternalID(ctx, user.ID, ChannelGmail, "owner@restaurant.com")
	if err != nil {
		t.Fatalf("GetByChannelAndExternalID: %v", err)
	}
	if !ok || found.ID != created.ID {
		t.Fatalf("expected to find the created account, got ok=%v found=%+v", ok, found)
	}

	_, ok, err = store.GetByChannelAndExternalID(ctx, user.ID, ChannelGmail, "someone-else@example.com")
	if err != nil {
		t.Fatalf("GetByChannelAndExternalID (no match): %v", err)
	}
	if ok {
		t.Fatal("expected no match for a different external account ID")
	}

	// Different channel, same external ID - must not match.
	_, ok, err = store.GetByChannelAndExternalID(ctx, user.ID, ChannelWhatsApp, "owner@restaurant.com")
	if err != nil {
		t.Fatalf("GetByChannelAndExternalID (different channel): %v", err)
	}
	if ok {
		t.Fatal("expected no match across a different channel")
	}
}

func TestInboxContactStore_UpsertIsIdempotentAndRefreshesName(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()
	store, err := NewInboxContactStore(database)
	if err != nil {
		t.Fatalf("NewInboxContactStore: %v", err)
	}

	c1, err := store.Upsert(ctx, UpsertContactParams{
		ChannelAccountID: "chacc_1",
		ExternalID:       "+15551234",
		DisplayName:      "Restaurant Owner",
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	c2, err := store.Upsert(ctx, UpsertContactParams{
		ChannelAccountID: "chacc_1",
		ExternalID:       "+15551234",
		DisplayName:      "Restaurant Owner (Updated)",
	})
	if err != nil {
		t.Fatalf("Upsert (second): %v", err)
	}
	if c1.ID != c2.ID {
		t.Fatalf("expected same contact ID on re-upsert, got %q vs %q", c1.ID, c2.ID)
	}
	if c2.DisplayName != "Restaurant Owner (Updated)" {
		t.Fatalf("expected refreshed display name, got %q", c2.DisplayName)
	}
}

func TestInboxThreadStore_UpsertCreatesThenReopensOnNewMessage(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()
	store, err := NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}

	t1, err := store.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: "chacc_1",
		ExternalThreadID: "ext-thread-1",
		Subject:          "Table for 4 tonight?",
		LastMessageAt:    time.Now(),
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if t1.Status != InboxThreadStatusOpen {
		t.Fatalf("expected new thread to start open, got %q", t1.Status)
	}

	if err := store.UpdateStatus(ctx, t1.ID, InboxThreadStatusHandled); err != nil {
		t.Fatalf("UpdateStatus: %v", err)
	}

	t2, err := store.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: "chacc_1",
		ExternalThreadID: "ext-thread-1",
		LastMessageAt:    time.Now().Add(time.Minute),
	})
	if err != nil {
		t.Fatalf("Upsert (reopen): %v", err)
	}
	if t2.ID != t1.ID {
		t.Fatalf("expected same thread ID, got %q vs %q", t1.ID, t2.ID)
	}
	if t2.Status != InboxThreadStatusOpen {
		t.Fatalf("expected a new message to reopen a handled thread, got %q", t2.Status)
	}
}

func TestInboxThreadStore_UpsertDoesNotReopenSnoozedThread(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()
	store, err := NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}

	thread, err := store.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: "chacc_1",
		ExternalThreadID: "ext-thread-2",
		LastMessageAt:    time.Now(),
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if err := store.UpdateStatus(ctx, thread.ID, InboxThreadStatusSnoozed); err != nil {
		t.Fatalf("UpdateStatus: %v", err)
	}

	reUpserted, err := store.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: "chacc_1",
		ExternalThreadID: "ext-thread-2",
		LastMessageAt:    time.Now().Add(time.Minute),
	})
	if err != nil {
		t.Fatalf("Upsert (again): %v", err)
	}
	if reUpserted.Status != InboxThreadStatusSnoozed {
		t.Fatalf("expected snoozed status to be preserved, got %q", reUpserted.Status)
	}
}

func TestInboxMessageStore_CreateIsIdempotentByExternalID(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()
	threadStore, err := NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}
	messageStore, err := NewInboxMessageStore(database)
	if err != nil {
		t.Fatalf("NewInboxMessageStore: %v", err)
	}

	thread, err := threadStore.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: "chacc_1",
		ExternalThreadID: "ext-thread-3",
		LastMessageAt:    time.Now(),
	})
	if err != nil {
		t.Fatalf("Upsert thread: %v", err)
	}

	m1, err := messageStore.Create(ctx, CreateMessageParams{
		ThreadID:          thread.ID,
		ChannelAccountID:  "chacc_1",
		ExternalMessageID: "ext-msg-1",
		Direction:         InboxMessageDirectionInbound,
		BodyText:          "Is there space for 4 tonight?",
		SentAt:            time.Now(),
	})
	if err != nil {
		t.Fatalf("Create message: %v", err)
	}

	m2, err := messageStore.Create(ctx, CreateMessageParams{
		ThreadID:          thread.ID,
		ChannelAccountID:  "chacc_1",
		ExternalMessageID: "ext-msg-1",
		Direction:         InboxMessageDirectionInbound,
		BodyText:          "Is there space for 4 tonight?",
		SentAt:            time.Now(),
	})
	if err != nil {
		t.Fatalf("Create message (re-sync): %v", err)
	}
	if m1.ID != m2.ID {
		t.Fatalf("expected the same message ID on re-sync, got %q vs %q", m1.ID, m2.ID)
	}

	messages, _, err := messageStore.ListByThreadID(ctx, thread.ID, 50, 0)
	if err != nil {
		t.Fatalf("ListByThreadID: %v", err)
	}
	if len(messages) != 1 {
		t.Fatalf("expected exactly 1 message despite re-sync, got %d", len(messages))
	}
}

func TestInboxMessageStore_ListByThreadIDPaginatesNewestFirstButReturnsAscending(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()
	threadStore, err := NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}
	messageStore, err := NewInboxMessageStore(database)
	if err != nil {
		t.Fatalf("NewInboxMessageStore: %v", err)
	}

	thread, err := threadStore.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: "chacc_1",
		ExternalThreadID: "ext-thread-msg-page",
		LastMessageAt:    time.Now(),
	})
	if err != nil {
		t.Fatalf("Upsert thread: %v", err)
	}

	base := time.Now()
	for i := 0; i < 3; i++ {
		if _, err := messageStore.Create(ctx, CreateMessageParams{
			ThreadID:          thread.ID,
			ChannelAccountID:  "chacc_1",
			ExternalMessageID: fmt.Sprintf("ext-msg-page-%d", i),
			Direction:         InboxMessageDirectionInbound,
			BodyText:          fmt.Sprintf("message %d", i),
			SentAt:            base.Add(time.Duration(i) * time.Minute),
		}); err != nil {
			t.Fatalf("Create message %d: %v", i, err)
		}
	}

	// Default page (offset 0) should be the 2 most recent messages, in
	// ascending order (oldest of the page first).
	page1, hasMore, err := messageStore.ListByThreadID(ctx, thread.ID, 2, 0)
	if err != nil {
		t.Fatalf("ListByThreadID (page 1): %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("expected 2 messages on page 1, got %d", len(page1))
	}
	if !hasMore {
		t.Fatal("expected hasMore=true on page 1 (3 messages seeded, limit 2)")
	}
	if page1[0].BodyText != "message 1" || page1[1].BodyText != "message 2" {
		t.Fatalf("expected ascending order within the newest page, got %+v", page1)
	}

	// Paging further back (offset 2) should surface the oldest message,
	// with hasMore=false.
	page2, hasMore, err := messageStore.ListByThreadID(ctx, thread.ID, 2, 2)
	if err != nil {
		t.Fatalf("ListByThreadID (page 2): %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("expected 1 message on page 2, got %d", len(page2))
	}
	if hasMore {
		t.Fatal("expected hasMore=false on page 2 (exhausted)")
	}
	if page2[0].BodyText != "message 0" {
		t.Fatalf("expected the oldest message on page 2, got %+v", page2)
	}
}

func TestInboxMessageStore_GetByID(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()
	threadStore, err := NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}
	messageStore, err := NewInboxMessageStore(database)
	if err != nil {
		t.Fatalf("NewInboxMessageStore: %v", err)
	}
	thread, err := threadStore.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: "chacc_1",
		ExternalThreadID: "ext-thread-getbyid",
		LastMessageAt:    time.Now(),
	})
	if err != nil {
		t.Fatalf("Upsert thread: %v", err)
	}
	created, err := messageStore.Create(ctx, CreateMessageParams{
		ThreadID:         thread.ID,
		ChannelAccountID: "chacc_1",
		Direction:        InboxMessageDirectionInbound,
		BodyText:         "hello",
		SentAt:           time.Now(),
	})
	if err != nil {
		t.Fatalf("Create message: %v", err)
	}

	got, err := messageStore.GetByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.ID != created.ID || got.BodyText != "hello" {
		t.Fatalf("expected the created message back, got %+v", got)
	}

	if _, err := messageStore.GetByID(ctx, "does-not-exist"); err == nil {
		t.Fatal("expected an error for an unknown message ID")
	}
}

func TestInboxMessageStore_UpdateAttachments(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()
	threadStore, err := NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}
	messageStore, err := NewInboxMessageStore(database)
	if err != nil {
		t.Fatalf("NewInboxMessageStore: %v", err)
	}
	thread, err := threadStore.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: "chacc_1",
		ExternalThreadID: "ext-thread-updateatt",
		LastMessageAt:    time.Now(),
	})
	if err != nil {
		t.Fatalf("Upsert thread: %v", err)
	}
	created, err := messageStore.Create(ctx, CreateMessageParams{
		ThreadID:         thread.ID,
		ChannelAccountID: "chacc_1",
		Direction:        InboxMessageDirectionInbound,
		BodyText:         "has an attachment",
		AttachmentsJSON:  `[{"id":"att-1","filename":"invoice.pdf"}]`,
		SentAt:           time.Now(),
	})
	if err != nil {
		t.Fatalf("Create message: %v", err)
	}

	updated := `[{"id":"att-1","filename":"invoice.pdf","storage_key":"inbox-attachments/abc"}]`
	if err := messageStore.UpdateAttachments(ctx, created.ID, updated); err != nil {
		t.Fatalf("UpdateAttachments: %v", err)
	}

	got, err := messageStore.GetByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.AttachmentsJSON != updated {
		t.Fatalf("expected attachments_json to be overwritten, got %q", got.AttachmentsJSON)
	}
}

func TestInboxThreadStore_ListByUserIDJoinsChannelAccounts(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "inbox-list@example.com")

	accountStore, err := NewChannelAccountStore(database)
	if err != nil {
		t.Fatalf("NewChannelAccountStore: %v", err)
	}
	account, err := accountStore.Create(ctx, CreateChannelAccountParams{UserID: user.ID, Channel: ChannelGmail})
	if err != nil {
		t.Fatalf("Create account: %v", err)
	}

	threadStore, err := NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}
	if _, err := threadStore.Upsert(ctx, UpsertThreadParams{
		ChannelAccountID: account.ID,
		ExternalThreadID: "ext-thread-4",
		Subject:          "Reservation request",
		LastMessageAt:    time.Now(),
	}); err != nil {
		t.Fatalf("Upsert thread: %v", err)
	}

	threads, _, err := threadStore.ListByUserID(ctx, user.ID, "", 10, 0)
	if err != nil {
		t.Fatalf("ListByUserID: %v", err)
	}
	if len(threads) != 1 || threads[0].Subject != "Reservation request" {
		t.Fatalf("expected 1 thread for user via channel account join, got %+v", threads)
	}

	openThreads, _, err := threadStore.ListByUserID(ctx, user.ID, InboxThreadStatusOpen, 10, 0)
	if err != nil {
		t.Fatalf("ListByUserID (status filter): %v", err)
	}
	if len(openThreads) != 1 {
		t.Fatalf("expected 1 open thread, got %d", len(openThreads))
	}
	handledThreads, _, err := threadStore.ListByUserID(ctx, user.ID, InboxThreadStatusHandled, 10, 0)
	if err != nil {
		t.Fatalf("ListByUserID (handled filter): %v", err)
	}
	if len(handledThreads) != 0 {
		t.Fatalf("expected 0 handled threads, got %d", len(handledThreads))
	}
}

func TestInboxThreadStore_ListByUserIDPaginatesWithOffsetAndHasMore(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "inbox-paginate@example.com")

	accountStore, err := NewChannelAccountStore(database)
	if err != nil {
		t.Fatalf("NewChannelAccountStore: %v", err)
	}
	account, err := accountStore.Create(ctx, CreateChannelAccountParams{UserID: user.ID, Channel: ChannelGmail})
	if err != nil {
		t.Fatalf("Create account: %v", err)
	}

	threadStore, err := NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}
	// Seed 3 threads with strictly increasing LastMessageAt, so
	// most-recent-first order is deterministic.
	base := time.Now()
	for i := 0; i < 3; i++ {
		if _, err := threadStore.Upsert(ctx, UpsertThreadParams{
			ChannelAccountID: account.ID,
			ExternalThreadID: fmt.Sprintf("ext-thread-page-%d", i),
			LastMessageAt:    base.Add(time.Duration(i) * time.Minute),
		}); err != nil {
			t.Fatalf("Upsert thread %d: %v", i, err)
		}
	}

	page1, hasMore, err := threadStore.ListByUserID(ctx, user.ID, "", 2, 0)
	if err != nil {
		t.Fatalf("ListByUserID (page 1): %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("expected 2 threads on page 1, got %d", len(page1))
	}
	if !hasMore {
		t.Fatal("expected hasMore=true on page 1 (3 threads seeded, limit 2)")
	}
	if page1[0].ExternalThreadID != "ext-thread-page-2" || page1[1].ExternalThreadID != "ext-thread-page-1" {
		t.Fatalf("expected most-recent-first order, got %+v", page1)
	}

	page2, hasMore, err := threadStore.ListByUserID(ctx, user.ID, "", 2, 2)
	if err != nil {
		t.Fatalf("ListByUserID (page 2): %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("expected 1 thread on page 2, got %d", len(page2))
	}
	if hasMore {
		t.Fatal("expected hasMore=false on page 2 (exhausted)")
	}
	if page2[0].ExternalThreadID != "ext-thread-page-0" {
		t.Fatalf("expected the oldest thread on page 2, got %+v", page2)
	}
}
