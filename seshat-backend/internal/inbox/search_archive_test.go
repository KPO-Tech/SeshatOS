package inbox_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox"
)

// fakeSearchableConnector layers MessageSearcher/ThreadArchiver/
// ThreadReadMarker on top of fakeConnector - kept separate from
// fakeConnector itself so tests exercising the plain Connector contract
// (most of service_test.go) keep asserting that those capabilities are
// correctly reported as unavailable when a connector doesn't implement them.
type fakeSearchableConnector struct {
	*fakeConnector

	searchResults   []inbox.NormalizedMessage
	searchErr       error
	searchCalls     int
	lastSearchQuery string
	lastSearchLimit int

	archiveErr          error
	archiveCalls        int
	lastArchiveThreadID string

	setReadErr          error
	setReadCalls        int
	lastSetReadThreadID string
	lastSetRead         bool
}

func (f *fakeSearchableConnector) SearchMessages(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret, query string, maxResults int) ([]inbox.NormalizedMessage, error) {
	f.searchCalls++
	f.lastSearchQuery, f.lastSearchLimit = query, maxResults
	if f.searchErr != nil {
		return nil, f.searchErr
	}
	return f.searchResults, nil
}

func (f *fakeSearchableConnector) ArchiveThread(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret, externalThreadID string) error {
	f.archiveCalls++
	f.lastArchiveThreadID = externalThreadID
	return f.archiveErr
}

func (f *fakeSearchableConnector) SetThreadRead(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret, externalThreadID string, read bool) error {
	f.setReadCalls++
	f.lastSetReadThreadID, f.lastSetRead = externalThreadID, read
	return f.setReadErr
}

var (
	_ inbox.MessageSearcher  = (*fakeSearchableConnector)(nil)
	_ inbox.ThreadArchiver   = (*fakeSearchableConnector)(nil)
	_ inbox.ThreadReadMarker = (*fakeSearchableConnector)(nil)
)

func TestService_SearchMessagesPersistsMatchesAsThreads(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)

	connector := &fakeSearchableConnector{
		fakeConnector: &fakeConnector{channel: inbox.ChannelGmail},
		searchResults: []inbox.NormalizedMessage{
			{
				ExternalThreadID: "gmail-thread-1", ExternalMessageID: "gmail-msg-1",
				Direction: inbox.MessageDirectionInbound, ContactExternalID: "newsletter@example.com",
				ContactDisplayName: "Newsletter", ThreadSubject: "Weekly digest", BodyText: "Unsubscribe here",
				SentAt: time.Now(),
			},
			{
				// Second message in the same thread - should collapse to
				// one returned Thread, not two.
				ExternalThreadID: "gmail-thread-1", ExternalMessageID: "gmail-msg-2",
				Direction: inbox.MessageDirectionInbound, ContactExternalID: "newsletter@example.com",
				ContactDisplayName: "Newsletter", ThreadSubject: "Weekly digest", BodyText: "Another one",
				SentAt: time.Now(),
			},
		},
	}
	svc.RegisterConnector(connector)

	threads, err := svc.SearchMessages(context.Background(), principal, account.ID, "from:newsletter@example.com", 0)
	require.NoError(t, err)
	require.Len(t, threads, 1, "expected the two search hits in the same thread to collapse to one Thread")
	require.Equal(t, "Newsletter", threads[0].Contact.DisplayName)
	require.Equal(t, 1, connector.searchCalls)
	require.Equal(t, "from:newsletter@example.com", connector.lastSearchQuery)

	// The found thread is now a real, browsable local thread.
	_, messages, _, err := svc.GetThread(context.Background(), principal, threads[0].ID, 0)
	require.NoError(t, err)
	require.Len(t, messages, 2)
}

func TestService_SearchMessagesRequiresQuery(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)
	svc.RegisterConnector(&fakeSearchableConnector{fakeConnector: &fakeConnector{channel: inbox.ChannelGmail}})

	_, err := svc.SearchMessages(context.Background(), principal, account.ID, "", 0)
	require.Error(t, err)
}

func TestService_SearchMessagesRequiresConnectorCapability(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelWhatsApp)
	// Plain fakeConnector - no MessageSearcher.
	svc.RegisterConnector(&fakeConnector{channel: inbox.ChannelWhatsApp})

	_, err := svc.SearchMessages(context.Background(), principal, account.ID, "hello", 0)
	require.Error(t, err)
}

func TestService_SearchMessagesPropagatesConnectorError(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)
	svc.RegisterConnector(&fakeSearchableConnector{
		fakeConnector: &fakeConnector{channel: inbox.ChannelGmail},
		searchErr:     fmt.Errorf("boom"),
	})

	_, err := svc.SearchMessages(context.Background(), principal, account.ID, "query", 0)
	require.Error(t, err)
}

func TestService_ArchiveThreadCallsConnectorAndMarksHandled(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)

	connector := &fakeSearchableConnector{
		fakeConnector: &fakeConnector{
			channel: inbox.ChannelGmail,
			syncMessages: []inbox.NormalizedMessage{{
				ExternalThreadID: "gmail-thread-1", ExternalMessageID: "gmail-msg-1",
				Direction: inbox.MessageDirectionInbound, ContactExternalID: "spam@example.com",
				ContactDisplayName: "Spammer", BodyText: "Buy now", SentAt: time.Now(),
			}},
		},
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)

	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	require.Len(t, threads, 1)
	threadID := threads[0].ID

	err = svc.ArchiveThread(context.Background(), principal, threadID)
	require.NoError(t, err)
	require.Equal(t, 1, connector.archiveCalls)
	require.Equal(t, "gmail-thread-1", connector.lastArchiveThreadID)

	thread, _, _, err := svc.GetThread(context.Background(), principal, threadID, 0)
	require.NoError(t, err)
	require.Equal(t, inbox.ThreadStatusHandled, thread.Status)
}

func TestService_ArchiveThreadRequiresConnectorCapability(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelWhatsApp)
	connector := &fakeConnector{
		channel: inbox.ChannelWhatsApp,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID: "wa-thread-1", ExternalMessageID: "wa-msg-1",
			Direction: inbox.MessageDirectionInbound, ContactExternalID: "+15551234",
			ContactDisplayName: "Someone", BodyText: "hi", SentAt: time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)
	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	require.Len(t, threads, 1)

	err = svc.ArchiveThread(context.Background(), principal, threads[0].ID)
	require.Error(t, err)
}

func TestService_ArchiveThreadOwnershipEnforced(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	owner := testPrincipal("user-1")
	outsider := testPrincipal("user-2")
	account := connectTestAccount(t, svc, owner, inbox.ChannelGmail)

	connector := &fakeSearchableConnector{
		fakeConnector: &fakeConnector{
			channel: inbox.ChannelGmail,
			syncMessages: []inbox.NormalizedMessage{{
				ExternalThreadID: "gmail-thread-1", ExternalMessageID: "gmail-msg-1",
				Direction: inbox.MessageDirectionInbound, ContactExternalID: "spam@example.com",
				ContactDisplayName: "Spammer", BodyText: "Buy now", SentAt: time.Now(),
			}},
		},
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), owner, account.ID)
	require.NoError(t, err)
	threads, _, err := svc.ListThreads(context.Background(), owner, inbox.ListThreadsParams{})
	require.NoError(t, err)
	require.Len(t, threads, 1)

	err = svc.ArchiveThread(context.Background(), outsider, threads[0].ID)
	require.Error(t, err)
	require.Equal(t, 0, connector.archiveCalls, "the connector must never be called for a thread the principal doesn't own")
}

func TestService_SetThreadReadStatusCallsConnector(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelGmail)

	connector := &fakeSearchableConnector{
		fakeConnector: &fakeConnector{
			channel: inbox.ChannelGmail,
			syncMessages: []inbox.NormalizedMessage{{
				ExternalThreadID: "gmail-thread-1", ExternalMessageID: "gmail-msg-1",
				Direction: inbox.MessageDirectionInbound, ContactExternalID: "client@example.com",
				ContactDisplayName: "Client", BodyText: "Hi", SentAt: time.Now(),
			}},
		},
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)
	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)
	threadID := threads[0].ID

	err = svc.SetThreadReadStatus(context.Background(), principal, threadID, false)
	require.NoError(t, err)
	require.Equal(t, 1, connector.setReadCalls)
	require.Equal(t, "gmail-thread-1", connector.lastSetReadThreadID)
	require.False(t, connector.lastSetRead)

	err = svc.SetThreadReadStatus(context.Background(), principal, threadID, true)
	require.NoError(t, err)
	require.Equal(t, 2, connector.setReadCalls)
	require.True(t, connector.lastSetRead)
}

func TestService_SetThreadReadStatusRequiresConnectorCapability(t *testing.T) {
	database := openTestDB(t)
	svc := newTestService(t, database)
	principal := testPrincipal("user-1")
	account := connectTestAccount(t, svc, principal, inbox.ChannelWhatsApp)
	connector := &fakeConnector{
		channel: inbox.ChannelWhatsApp,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID: "wa-thread-1", ExternalMessageID: "wa-msg-1",
			Direction: inbox.MessageDirectionInbound, ContactExternalID: "+15551234",
			ContactDisplayName: "Someone", BodyText: "hi", SentAt: time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	_, err := svc.SyncAccount(context.Background(), principal, account.ID)
	require.NoError(t, err)
	threads, _, err := svc.ListThreads(context.Background(), principal, inbox.ListThreadsParams{})
	require.NoError(t, err)

	err = svc.SetThreadReadStatus(context.Background(), principal, threads[0].ID, true)
	require.Error(t, err)
}
