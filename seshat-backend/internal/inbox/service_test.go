package inbox_test

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox"
	"github.com/KPO-Tech/seshat/pkg/storage"
	"golang.org/x/oauth2"
)

// fakeConnector is a scripted Connector - each test controls exactly what
// Sync returns and asserts on what Send was called with, without touching
// any real external API.
type fakeConnector struct {
	channel string

	syncMessages []inbox.NormalizedMessage
	syncCursor   string
	syncErr      error
	syncCalls    int

	sendExternalMessageID string
	sendErr               error
	lastSendThreadID      string
	lastSendContactID     string
	lastSendBody          string
	sendCalls             int

	// fetchAttachment fields - only exercised by connectors under test as
	// an inbox.AttachmentFetcher (Gmail-style lazy fetch).
	fetchData  []byte
	fetchErr   error
	fetchCalls int
}

func (f *fakeConnector) Channel() string { return f.channel }

func (f *fakeConnector) Kind() connector.Kind { return connector.Kind(f.channel) }

func (f *fakeConnector) Capabilities() []connector.Capability {
	return []connector.Capability{connector.CapabilityMessaging}
}

func (f *fakeConnector) Sync(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret) ([]inbox.NormalizedMessage, string, error) {
	f.syncCalls++
	if f.syncErr != nil {
		return nil, "", f.syncErr
	}
	return f.syncMessages, f.syncCursor, nil
}

func (f *fakeConnector) Send(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret, externalThreadID, contactExternalID, body string) (string, error) {
	f.sendCalls++
	f.lastSendThreadID = externalThreadID
	f.lastSendContactID = contactExternalID
	f.lastSendBody = body
	if f.sendErr != nil {
		return "", f.sendErr
	}
	if f.sendExternalMessageID != "" {
		return f.sendExternalMessageID, nil
	}
	return "sent-" + externalThreadID, nil
}

// FetchAttachment implements inbox.AttachmentFetcher, letting tests
// simulate Gmail's lazy-fetch-on-download path without a real Gmail API.
func (f *fakeConnector) FetchAttachment(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret, _, _ string) ([]byte, error) {
	f.fetchCalls++
	if f.fetchErr != nil {
		return nil, f.fetchErr
	}
	return f.fetchData, nil
}

var _ inbox.AttachmentFetcher = (*fakeConnector)(nil)

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	require.NoError(t, err, "open test db")
	t.Cleanup(func() { _ = database.Close() })
	return database
}

func newTestService(t *testing.T, database *db.DB) *inbox.Service {
	t.Helper()
	accounts, err := db.NewChannelAccountStore(database)
	require.NoError(t, err)
	contacts, err := db.NewInboxContactStore(database)
	require.NoError(t, err)
	threads, err := db.NewInboxThreadStore(database)
	require.NoError(t, err)
	messages, err := db.NewInboxMessageStore(database)
	require.NoError(t, err)
	return inbox.NewService(accounts, contacts, threads, messages)
}

// newTestServiceWithArtifactStore is newTestService plus a real local-disk
// storage.ArtifactStore (rooted in a per-test temp dir) - needed by any
// test exercising attachment storage (Service.OpenAttachment,
// storeAttachments's Put path).
func newTestServiceWithArtifactStore(t *testing.T, database *db.DB) *inbox.Service {
	t.Helper()
	svc := newTestService(t, database)
	store, err := storage.NewArtifactStoreFromConfig(storage.Config{
		Provider:  storage.ProviderLocal,
		LocalPath: t.TempDir(),
	})
	require.NoError(t, err)
	return svc.WithArtifactStore(store)
}

func testPrincipal(userID string) *backendauth.Principal {
	return &backendauth.Principal{User: backendauth.User{ID: userID}, Roles: []string{"member"}}
}

func connectTestAccount(t *testing.T, svc *inbox.Service, principal *backendauth.Principal, channel string) *inbox.ChannelAccount {
	t.Helper()
	account, err := svc.ConnectAccount(context.Background(), principal, inbox.ConnectAccountParams{
		Channel:           channel,
		DisplayName:       "Test Account",
		ExternalAccountID: "test@example.com",
		AccessToken:       "access-token",
		RefreshToken:      "refresh-token",
		ExpiresAt:         time.Now().Add(time.Hour),
	})
	require.NoError(t, err)
	return account
}

func TestService_ConnectAccountAndList(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")

	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)
	require.Equal(t, inbox.AccountStatusConnected, account.Status)
	require.True(t, account.HasRefreshToken)

	accounts, err := svc.ListAccounts(context.Background(), principal)
	require.NoError(t, err)
	require.Len(t, accounts, 1)
	require.Equal(t, account.ID, accounts[0].ID)
}

func TestService_SyncAccountPersistsNormalizedMessages(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelWhatsApp)

	connector := &fakeConnector{
		channel:    inbox.ChannelWhatsApp,
		syncCursor: "cursor-after-1",
		syncMessages: []inbox.NormalizedMessage{
			{
				ExternalThreadID:   "wa-thread-1",
				ExternalMessageID:  "wa-msg-1",
				Direction:          inbox.MessageDirectionInbound,
				ContactExternalID:  "+15551234",
				ContactDisplayName: "Restaurant Regular",
				BodyText:           "Table for 4 tonight?",
				SentAt:             time.Now(),
			},
		},
	}
	svc.RegisterConnector(connector)

	n, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)
	require.Equal(t, 1, n)
	require.Equal(t, 1, connector.syncCalls)

	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	require.Len(t, threads, 1)
	require.Equal(t, "Restaurant Regular", threads[0].Contact.DisplayName)
	require.Equal(t, inbox.ChannelWhatsApp, threads[0].Channel)

	thread, messages, _, err := svc.GetThread(context.Background(), principal, threads[0].ID, 0)
	require.NoError(t, err)
	require.Equal(t, inbox.ThreadStatusOpen, thread.Status)
	require.Len(t, messages, 1)
	require.Equal(t, "Table for 4 tonight?", messages[0].BodyText)

	accounts, err := svc.ListAccounts(context.Background(), principal)
	require.NoError(t, err)
	require.Equal(t, "", accounts[0].LastError)
}

func TestService_SyncAccountIsIdempotentAcrossRuns(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)

	msg := inbox.NormalizedMessage{
		ExternalThreadID:   "gmail-thread-1",
		ExternalMessageID:  "gmail-msg-1",
		Direction:          inbox.MessageDirectionInbound,
		ContactExternalID:  "client@example.com",
		ContactDisplayName: "Client",
		ThreadSubject:      "Reservation",
		BodyText:           "Can I book a table?",
		SentAt:             time.Now(),
	}
	connector := &fakeConnector{channel: inbox.ChannelGmail, syncMessages: []inbox.NormalizedMessage{msg}}
	svc.RegisterConnector(connector)

	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)
	// Simulate a cursor reset / re-delivery: the connector returns the exact
	// same message again on a second sync.
	_, err = svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)

	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	require.Len(t, threads, 1, "expected exactly one thread despite two syncs")

	_, messages, _, err := svc.GetThread(context.Background(), principal, threads[0].ID, 0)
	require.NoError(t, err)
	require.Len(t, messages, 1, "expected exactly one message despite re-syncing the same external ID")
}

func TestService_SendReplyCallsConnectorAndMarksThreadHandled(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelWhatsApp)

	connector := &fakeConnector{
		channel: inbox.ChannelWhatsApp,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:   "wa-thread-1",
			ExternalMessageID:  "wa-msg-1",
			Direction:          inbox.MessageDirectionInbound,
			ContactExternalID:  "+15551234",
			ContactDisplayName: "Restaurant Regular",
			BodyText:           "Table for 4 tonight?",
			SentAt:             time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)

	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	require.Len(t, threads, 1)
	threadID := threads[0].ID

	sent, err := svc.SendReply(context.Background(), principal, inbox.SendReplyParams{
		ThreadID: threadID,
		Body:     "Yes, see you at 8pm!",
	})
	require.NoError(t, err)
	require.Equal(t, inbox.MessageDirectionOutbound, sent.Direction)
	require.False(t, sent.IsDraft)

	require.Equal(t, 1, connector.sendCalls)
	require.Equal(t, "wa-thread-1", connector.lastSendThreadID)
	require.Equal(t, "+15551234", connector.lastSendContactID)
	require.Equal(t, "Yes, see you at 8pm!", connector.lastSendBody)

	thread, messages, _, err := svc.GetThread(context.Background(), principal, threadID, 0)
	require.NoError(t, err)
	require.Equal(t, inbox.ThreadStatusHandled, thread.Status)
	require.Len(t, messages, 2)
}

func TestService_SaveDraftDoesNotCallConnector(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)

	connector := &fakeConnector{
		channel: inbox.ChannelGmail,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:  "gmail-thread-1",
			ExternalMessageID: "gmail-msg-1",
			Direction:         inbox.MessageDirectionInbound,
			ContactExternalID: "client@example.com",
			ThreadSubject:     "Reservation",
			BodyText:          "Can I book a table?",
			SentAt:            time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)

	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)

	draft, err := svc.SaveDraft(context.Background(), principal, inbox.SendReplyParams{
		ThreadID: threads[0].ID,
		Body:     "Draft: yes, we have space.",
	})
	require.NoError(t, err)
	require.True(t, draft.IsDraft)
	require.Equal(t, 0, connector.sendCalls, "SaveDraft must never call the connector")

	thread, _, _, err := svc.GetThread(context.Background(), principal, threads[0].ID, 0)
	require.NoError(t, err)
	require.Equal(t, inbox.ThreadStatusOpen, thread.Status, "a draft alone should not change thread status")
}

func TestService_OwnershipIsEnforcedAcrossUsers(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	owner := testPrincipal("user-1")
	stranger := testPrincipal("user-2")
	account := connectTestAccount(t, svc, owner, inbox.ChannelGmail)

	_, err := svc.SyncAccount(context.Background(), stranger, account.ID)
	require.Error(t, err)
	require.Equal(t, bkerr.ErrorKindForbidden, bkerr.KindOf(err))

	_, _, err = svc.ListThreads(context.Background(), stranger, inbox.ListThreadsParams{})
	require.NoError(t, err) // stranger simply sees an empty list, not an error

	err = svc.DisconnectAccount(context.Background(), stranger, account.ID)
	require.Error(t, err)
	require.Equal(t, bkerr.ErrorKindForbidden, bkerr.KindOf(err))
}

func TestService_SyncAccountWithNoRegisteredConnectorFailsClearly(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelOutlook)

	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.Error(t, err)
	require.Equal(t, bkerr.ErrorKindUnavailable, bkerr.KindOf(err))
}

func TestService_ListThreadsReportsHasMoreAcrossPages(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelWhatsApp)

	// Seed 3 separate threads in one sync call.
	base := time.Now()
	connector := &fakeConnector{channel: inbox.ChannelWhatsApp}
	for i := 0; i < 3; i++ {
		connector.syncMessages = append(connector.syncMessages, inbox.NormalizedMessage{
			ExternalThreadID:   fmt.Sprintf("wa-thread-page-%d", i),
			ExternalMessageID:  fmt.Sprintf("wa-msg-page-%d", i),
			Direction:          inbox.MessageDirectionInbound,
			ContactExternalID:  fmt.Sprintf("+1555%04d", i),
			ContactDisplayName: fmt.Sprintf("Contact %d", i),
			BodyText:           "hi",
			SentAt:             base.Add(time.Duration(i) * time.Minute),
		})
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)

	page1, hasMore, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{Limit: 2, Offset: 0})
	require.NoError(t, err)
	require.Len(t, page1, 2)
	require.True(t, hasMore, "expected hasMore=true with 3 threads seeded and limit=2")

	page2, hasMore, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{Limit: 2, Offset: 2})
	require.NoError(t, err)
	require.Len(t, page2, 1)
	require.False(t, hasMore, "expected hasMore=false once every thread has been paged through")
}

func TestService_GetThreadPaginatesMessagesWithOffset(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelWhatsApp)

	base := time.Now()
	connector := &fakeConnector{channel: inbox.ChannelWhatsApp}
	for i := 0; i < 3; i++ {
		connector.syncMessages = append(connector.syncMessages, inbox.NormalizedMessage{
			ExternalThreadID:   "wa-thread-msg-page",
			ExternalMessageID:  fmt.Sprintf("wa-msg-msg-page-%d", i),
			Direction:          inbox.MessageDirectionInbound,
			ContactExternalID:  "+15551234",
			ContactDisplayName: "Restaurant Regular",
			BodyText:           fmt.Sprintf("message %d", i),
			SentAt:             base.Add(time.Duration(i) * time.Minute),
		})
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)

	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	require.Len(t, threads, 1)

	// defaultMessagePageSize (50) comfortably covers 3 seeded messages, so
	// offset=0 returns everything, ascending, with hasMore=false.
	_, messages, hasMore, err := svc.GetThread(context.Background(), principal, threads[0].ID, 0)
	require.NoError(t, err)
	require.Len(t, messages, 3)
	require.False(t, hasMore)
	require.Equal(t, "message 0", messages[0].BodyText)
	require.Equal(t, "message 2", messages[2].BodyText)

	// offset counts from the newest end - skipping the 2 most recent
	// leaves only the oldest message.
	_, messages, hasMore, err = svc.GetThread(context.Background(), principal, threads[0].ID, 2)
	require.NoError(t, err)
	require.Len(t, messages, 1)
	require.False(t, hasMore)
	require.Equal(t, "message 0", messages[0].BodyText)
}

func TestService_SyncAccountConnectorErrorIsRecordedOnAccount(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)

	connector := &fakeConnector{channel: inbox.ChannelGmail, syncErr: fmt.Errorf("token expired")}
	svc.RegisterConnector(connector)

	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.Error(t, err)
	require.Equal(t, bkerr.ErrorKindBadGateway, bkerr.KindOf(err))

	accounts, err := svc.ListAccounts(context.Background(), principal)
	require.NoError(t, err)
	require.Contains(t, accounts[0].LastError, "token expired")
}

// ─── Attachments ────────────────────────────────────────────────────────────

func TestService_StoreAttachments_WhatsAppStyleDataIsStoredEagerly(t *testing.T) {
	database := openTestDB(t)
	svc := newTestServiceWithArtifactStore(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelWhatsApp)

	connector := &fakeConnector{
		channel: inbox.ChannelWhatsApp,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:   "wa-thread-att",
			ExternalMessageID:  "wa-msg-att",
			Direction:          inbox.MessageDirectionInbound,
			ContactExternalID:  "+15551234",
			ContactDisplayName: "Restaurant Regular",
			BodyText:           "",
			Attachments: []inbox.Attachment{{
				Filename:    "photo.jpg",
				ContentType: "image/jpeg",
				Size:        4,
				Data:        []byte("fake"),
			}},
			SentAt: time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)

	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	require.Len(t, threads, 1)
	_, messages, _, err := svc.GetThread(context.Background(), principal, threads[0].ID, 0)
	require.NoError(t, err)
	require.Len(t, messages, 1)
	require.Len(t, messages[0].Attachments, 1)
	att := messages[0].Attachments[0]
	require.NotEmpty(t, att.ID, "expected a minted attachment ID")
	require.NotEmpty(t, att.StorageKey, "expected WhatsApp-style Data to be stored eagerly")

	reader, gotAtt, err := svc.OpenAttachment(context.Background(), principal, threads[0].ID, messages[0].ID, att.ID)
	require.NoError(t, err)
	defer reader.Close()
	data, err := io.ReadAll(reader)
	require.NoError(t, err)
	require.Equal(t, "fake", string(data))
	require.Equal(t, "photo.jpg", gotAtt.Filename)
	require.Zero(t, connector.fetchCalls, "WhatsApp-style attachments must never call FetchAttachment")
}

func TestService_OpenAttachment_GmailStyleLazyFetchAndCache(t *testing.T) {
	database := openTestDB(t)
	svc := newTestServiceWithArtifactStore(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)

	connector := &fakeConnector{
		channel: inbox.ChannelGmail,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:  "gmail-thread-att",
			ExternalMessageID: "gmail-msg-att",
			Direction:         inbox.MessageDirectionInbound,
			ContactExternalID: "client@example.com",
			BodyText:          "See attached",
			Attachments: []inbox.Attachment{{
				Filename:          "invoice.pdf",
				ContentType:       "application/pdf",
				Size:              9,
				GmailAttachmentID: "gmail-att-1",
			}},
			SentAt: time.Now(),
		}},
		fetchData: []byte("pdf-bytes"),
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)

	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	_, messages, _, err := svc.GetThread(context.Background(), principal, threads[0].ID, 0)
	require.NoError(t, err)
	require.Len(t, messages[0].Attachments, 1)
	att := messages[0].Attachments[0]
	require.Empty(t, att.StorageKey, "Gmail attachments must not be fetched during sync")

	// First download - triggers FetchAttachment and caches the result.
	reader, _, err := svc.OpenAttachment(context.Background(), principal, threads[0].ID, messages[0].ID, att.ID)
	require.NoError(t, err)
	data, err := io.ReadAll(reader)
	reader.Close()
	require.NoError(t, err)
	require.Equal(t, "pdf-bytes", string(data))
	require.Equal(t, 1, connector.fetchCalls)

	// Second download - should be served from the cached blob, not fetch again.
	reader2, _, err := svc.OpenAttachment(context.Background(), principal, threads[0].ID, messages[0].ID, att.ID)
	require.NoError(t, err)
	data2, err := io.ReadAll(reader2)
	reader2.Close()
	require.NoError(t, err)
	require.Equal(t, "pdf-bytes", string(data2))
	require.Equal(t, 1, connector.fetchCalls, "second download must be served from the cache, not fetch again")
}

func TestService_OpenAttachment_OwnershipEnforced(t *testing.T) {
	database := openTestDB(t)
	svc := newTestServiceWithArtifactStore(t, database)
	owner := testPrincipal("user-1")
	stranger := testPrincipal("user-2")
	account := connectTestAccount(t, svc, owner, inbox.ChannelWhatsApp)

	connector := &fakeConnector{
		channel: inbox.ChannelWhatsApp,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:  "wa-thread-owned",
			ExternalMessageID: "wa-msg-owned",
			Direction:         inbox.MessageDirectionInbound,
			ContactExternalID: "+15551234",
			Attachments: []inbox.Attachment{{
				Filename: "secret.jpg", ContentType: "image/jpeg", Data: []byte("secret"),
			}},
			SentAt: time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), owner, account.ID)
	require.NoError(t, err)

	threads, _, err := svc.ListThreads(context.Background(), owner, inbox.ListThreadsParams{})
	require.NoError(t, err)
	_, messages, _, err := svc.GetThread(context.Background(), owner, threads[0].ID, 0)
	require.NoError(t, err)
	att := messages[0].Attachments[0]

	_, _, err = svc.OpenAttachment(context.Background(), stranger, threads[0].ID, messages[0].ID, att.ID)
	require.Error(t, err)
	require.Equal(t, bkerr.ErrorKindForbidden, bkerr.KindOf(err))
}

func TestService_OpenAttachment_UnknownAttachmentIDNotFound(t *testing.T) {
	database := openTestDB(t)
	svc := newTestServiceWithArtifactStore(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelWhatsApp)

	connector := &fakeConnector{
		channel: inbox.ChannelWhatsApp,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:  "wa-thread-noatt",
			ExternalMessageID: "wa-msg-noatt",
			Direction:         inbox.MessageDirectionInbound,
			ContactExternalID: "+15551234",
			BodyText:          "no attachment here",
			SentAt:            time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)

	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	_, messages, _, err := svc.GetThread(context.Background(), principal, threads[0].ID, 0)
	require.NoError(t, err)

	_, _, err = svc.OpenAttachment(context.Background(), principal, threads[0].ID, messages[0].ID, "does-not-exist")
	require.Error(t, err)
	require.Equal(t, bkerr.ErrorKindNotFound, bkerr.KindOf(err))
}

func TestService_OpenAttachment_SizeCapRejectsOversizedGmailAttachment(t *testing.T) {
	database := openTestDB(t)
	svc := newTestServiceWithArtifactStore(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)

	connector := &fakeConnector{
		channel: inbox.ChannelGmail,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:  "gmail-thread-big",
			ExternalMessageID: "gmail-msg-big",
			Direction:         inbox.MessageDirectionInbound,
			ContactExternalID: "client@example.com",
			BodyText:          "huge attachment",
			Attachments: []inbox.Attachment{{
				Filename:          "movie.mp4",
				ContentType:       "video/mp4",
				Size:              26 * 1024 * 1024, // over the 25MB cap
				GmailAttachmentID: "gmail-att-big",
			}},
			SentAt: time.Now(),
		}},
		fetchData: []byte("should never be fetched"),
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)

	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	_, messages, _, err := svc.GetThread(context.Background(), principal, threads[0].ID, 0)
	require.NoError(t, err)
	att := messages[0].Attachments[0]

	_, _, err = svc.OpenAttachment(context.Background(), principal, threads[0].ID, messages[0].ID, att.ID)
	require.Error(t, err)
	require.Equal(t, bkerr.ErrorKindTooLarge, bkerr.KindOf(err))
	require.Zero(t, connector.fetchCalls, "an oversized attachment must never be fetched")
}

// ─── Gmail refresh-token expiry mitigation ─────────────────────────────────

func TestService_SyncAccount_AuthExpiredFlipsStatusToError(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)

	connector := &fakeConnector{
		channel: inbox.ChannelGmail,
		syncErr: &oauth2.RetrieveError{ErrorCode: "invalid_grant"},
	}
	svc.RegisterConnector(connector)

	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.Error(t, err)

	accounts, err := svc.ListAccounts(context.Background(), principal)
	require.NoError(t, err)
	require.Len(t, accounts, 1)
	require.Equal(t, inbox.AccountStatusError, accounts[0].Status)
	require.Equal(t, "Authorization has expired - reconnect this account to keep syncing.", accounts[0].LastError)
}

func TestService_SyncAccount_TransientErrorDoesNotFlipStatus(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)

	connector := &fakeConnector{
		channel: inbox.ChannelGmail,
		syncErr: fmt.Errorf("connection reset by peer"),
	}
	svc.RegisterConnector(connector)

	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.Error(t, err)

	accounts, err := svc.ListAccounts(context.Background(), principal)
	require.NoError(t, err)
	require.Len(t, accounts, 1)
	require.Equal(t, inbox.AccountStatusConnected, accounts[0].Status,
		"a transient sync error must not be reclassified as needing reconnection")
	require.Contains(t, accounts[0].LastError, "connection reset by peer")
}

func TestService_SendReply_AuthExpiredFlipsStatusToError(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelWhatsApp)

	connector := &fakeConnector{
		channel: inbox.ChannelWhatsApp,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:  "wa-thread-sendfail",
			ExternalMessageID: "wa-msg-sendfail",
			Direction:         inbox.MessageDirectionInbound,
			ContactExternalID: "+15551234",
			BodyText:          "hi",
			SentAt:            time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)
	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)

	connector.sendErr = &oauth2.RetrieveError{ErrorCode: "invalid_grant"}
	_, err = svc.SendReply(context.Background(), principal, inbox.SendReplyParams{
		ThreadID: threads[0].ID,
		Body:     "reply",
	})
	require.Error(t, err)

	accounts, err := svc.ListAccounts(context.Background(), principal)
	require.NoError(t, err)
	require.Equal(t, inbox.AccountStatusError, accounts[0].Status)
}

func TestService_ConnectAccount_ReconnectUpdatesExistingAccountInPlace(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")

	first, err := svc.ConnectAccount(context.Background(), principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelGmail,
		DisplayName:       "owner@restaurant.com",
		ExternalAccountID: "owner@restaurant.com",
		AccessToken:       "access-1",
		RefreshToken:      "refresh-1",
		ExpiresAt:         time.Now().Add(time.Hour),
	})
	require.NoError(t, err)

	// Simulate the token dying, same as a real 7-day-expired Gmail refresh
	// token would.
	connector := &fakeConnector{channel: inbox.ChannelGmail, syncErr: &oauth2.RetrieveError{ErrorCode: "invalid_grant"}}
	svc.RegisterConnector(connector)
	_, err = svc.SyncAccount(context.Background(), principal, first.ID)
	require.Error(t, err)
	accounts, err := svc.ListAccounts(context.Background(), principal)
	require.NoError(t, err)
	require.Equal(t, inbox.AccountStatusError, accounts[0].Status)

	// Reconnecting (redoing OAuth) for the same external account must
	// update the existing row, not create a second one.
	second, err := svc.ConnectAccount(context.Background(), principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelGmail,
		DisplayName:       "owner@restaurant.com",
		ExternalAccountID: "owner@restaurant.com",
		AccessToken:       "access-2",
		RefreshToken:      "refresh-2",
		ExpiresAt:         time.Now().Add(time.Hour),
	})
	require.NoError(t, err)
	require.Equal(t, first.ID, second.ID, "reconnecting must update the existing account, not create a duplicate")
	require.Equal(t, inbox.AccountStatusConnected, second.Status, "a successful reconnect must clear the error state")

	accounts, err = svc.ListAccounts(context.Background(), principal)
	require.NoError(t, err)
	require.Len(t, accounts, 1, "must still be exactly one account for this mailbox, not two")
	require.Equal(t, inbox.AccountStatusConnected, accounts[0].Status)
	require.Empty(t, accounts[0].LastError)
}
