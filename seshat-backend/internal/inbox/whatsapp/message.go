package whatsapp

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types/events"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox"
)

// translateIncoming converts a whatsmeow message event into the
// channel-agnostic shape inbox.Service persists. Group chats are skipped
// (returns ok=false) - v1 scope is 1:1 conversations only, matching the
// restaurant-owner use case this was built for; group support is a
// deliberate later addition, not an oversight.
//
// A message with neither body text nor a downloadable attachment is also
// skipped - but a bare media message (a photo/document with no caption) is
// not: it used to be dropped here entirely (body == "" was the only check),
// which silently lost every caption-less attachment. client is used to
// download attachment bytes inline (nil is tolerated - extractAttachment
// simply finds nothing to attach - so existing text-only call sites/tests
// don't need a real client).
func translateIncoming(ctx context.Context, evt *events.Message, client *whatsmeow.Client) (msg inbox.NormalizedMessage, ok bool) {
	if evt == nil {
		return inbox.NormalizedMessage{}, false
	}
	if evt.Info.IsGroup {
		return inbox.NormalizedMessage{}, false
	}
	body := extractText(evt.Message)
	attachment := extractAttachment(ctx, client, evt.Message)
	if !shouldIngestMessage(body, attachment) {
		return inbox.NormalizedMessage{}, false
	}

	var attachments []inbox.Attachment
	if attachment != nil {
		attachments = []inbox.Attachment{*attachment}
	}

	direction := inbox.MessageDirectionInbound
	if evt.Info.IsFromMe {
		direction = inbox.MessageDirectionOutbound
	}

	return inbox.NormalizedMessage{
		ExternalThreadID:   evt.Info.Chat.String(),
		ExternalMessageID:  evt.Info.ID,
		Direction:          direction,
		ContactExternalID:  evt.Info.Chat.String(),
		ContactDisplayName: evt.Info.PushName,
		BodyText:           body,
		Attachments:        attachments,
		SentAt:             sentAt(evt.Info.Timestamp),
	}, true
}

// shouldIngestMessage decides whether a translated message is worth
// persisting at all - split out as its own pure function so the fix
// described in translateIncoming's doc comment (a caption-less media
// message used to be dropped because only body text was checked) is
// directly testable without needing a real whatsmeow download.
func shouldIngestMessage(body string, attachment *inbox.Attachment) bool {
	return body != "" || attachment != nil
}

func sentAt(t time.Time) time.Time {
	if t.IsZero() {
		return time.Now()
	}
	return t
}

// extractText pulls a display-worthy text out of whatever message type
// WhatsApp sent - a plain chat message (Conversation), a message with a
// link preview (ExtendedTextMessage), or a caption on media. Media itself
// is handled separately by extractAttachment.
func extractText(m *waE2E.Message) string {
	if m == nil {
		return ""
	}
	if t := m.GetConversation(); t != "" {
		return t
	}
	if ext := m.GetExtendedTextMessage(); ext != nil && ext.GetText() != "" {
		return ext.GetText()
	}
	if img := m.GetImageMessage(); img != nil && img.GetCaption() != "" {
		return img.GetCaption()
	}
	if doc := m.GetDocumentMessage(); doc != nil && doc.GetCaption() != "" {
		return doc.GetCaption()
	}
	if vid := m.GetVideoMessage(); vid != nil && vid.GetCaption() != "" {
		return vid.GetCaption()
	}
	return ""
}

// extractAttachment downloads the media on a message, if any, and returns
// it ready to attach - bytes included, since WhatsApp media only comes in
// live over this event stream (unlike Gmail, there's no "fetch it again
// later" option: the directPath/mediaKey pair here isn't something this app
// controls the retention of, so downloading promptly while the event is
// fresh is the only reliable choice). client == nil (text-only test call
// sites) or a download failure both simply yield no attachment rather than
// an error - the message itself still gets ingested via its body text, if
// any.
//
// Mirrors whatsmeow's own (deprecated) DownloadAny's type dispatch, done
// manually here so filename/mimetype/size are available alongside the
// bytes - DownloadAny only returns the bytes.
func extractAttachment(ctx context.Context, client *whatsmeow.Client, m *waE2E.Message) *inbox.Attachment {
	if m == nil || client == nil {
		return nil
	}
	switch {
	case m.GetImageMessage() != nil:
		img := m.GetImageMessage()
		return downloadMedia(ctx, client, img, "", img.GetMimetype(), int64(img.GetFileLength()))
	case m.GetVideoMessage() != nil:
		vid := m.GetVideoMessage()
		return downloadMedia(ctx, client, vid, "", vid.GetMimetype(), int64(vid.GetFileLength()))
	case m.GetAudioMessage() != nil:
		aud := m.GetAudioMessage()
		return downloadMedia(ctx, client, aud, "", aud.GetMimetype(), int64(aud.GetFileLength()))
	case m.GetDocumentMessage() != nil:
		doc := m.GetDocumentMessage()
		return downloadMedia(ctx, client, doc, doc.GetFileName(), doc.GetMimetype(), int64(doc.GetFileLength()))
	default:
		return nil
	}
}

func downloadMedia(ctx context.Context, client *whatsmeow.Client, msg whatsmeow.DownloadableMessage, filename, contentType string, size int64) *inbox.Attachment {
	data, err := client.Download(ctx, msg)
	if err != nil {
		fmt.Printf("[WhatsApp] attachment download failed: %v\n", err)
		return nil
	}
	if filename == "" {
		filename = "attachment" + extensionFor(contentType)
	}
	return &inbox.Attachment{
		Filename:    filename,
		ContentType: contentType,
		Size:        size,
		Data:        data,
	}
}

// extensionFor is a small, deliberately non-exhaustive cosmetic fallback -
// only used to give an unnamed image/audio/video attachment (WhatsApp
// doesn't carry filenames for those, only DocumentMessage does) a
// reasonable-looking name instead of a bare "attachment".
func extensionFor(contentType string) string {
	switch {
	case strings.HasPrefix(contentType, "image/jpeg"):
		return ".jpg"
	case strings.HasPrefix(contentType, "image/png"):
		return ".png"
	case strings.HasPrefix(contentType, "image/webp"):
		return ".webp"
	case strings.HasPrefix(contentType, "video/mp4"):
		return ".mp4"
	case strings.HasPrefix(contentType, "audio/ogg"):
		return ".ogg"
	case strings.HasPrefix(contentType, "audio/mpeg"):
		return ".mp3"
	default:
		return ""
	}
}
