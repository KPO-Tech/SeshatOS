package skillinstall

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Without git, a repository on GitHub is downloaded as the zip of its default branch: the same files as a clone of depth one, without the
// history. These limits keep a hostile or broken archive from filling the disk; the largest repository of the catalog is far below them.
const (
	archiveMaxDownload = 1 << 30 // bytes of the zip
	archiveMaxUnpacked = 2 << 30 // bytes once unpacked
	archiveMaxFiles    = 100_000
)

// DownloadMarker is the file left at the root of a repository downloaded as an archive. It stands for the .git folder a clone has: it says
// the repository is whole, and where it came from.
const DownloadMarker = ".seshat-download.json"

type downloadRecord struct {
	URL          string    `json:"url"`
	DownloadedAt time.Time `json:"downloaded_at"`
}

var archiveHTTPClient = &http.Client{}

// IsDownloaded reports whether dir holds a whole repository: a clone, or an archive downloaded without git.
func IsDownloaded(dir string) bool {
	if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
		return true
	}
	_, err := os.Stat(filepath.Join(dir, DownloadMarker))
	return err == nil
}

// DownloadedFrom is the address a repository downloaded as an archive came from, or "" when it was cloned or nothing is recorded.
func DownloadedFrom(dir string) string {
	data, err := os.ReadFile(filepath.Join(dir, DownloadMarker))
	if err != nil {
		return ""
	}
	var record downloadRecord
	if json.Unmarshal(data, &record) != nil {
		return ""
	}
	return record.URL
}

// gitAvailable reports whether git can be run. A variable so that the tests can take the path of a computer without it.
var gitAvailable = func() bool {
	_, err := exec.LookPath("git")
	return err == nil
}

// archiveURL is the address of the zip of the default branch of a GitHub repository, or false for another host.
func archiveURL(repoURL string) (string, bool) {
	parsed, err := url.Parse(strings.TrimSpace(repoURL))
	if err != nil || parsed.Scheme != "https" || !strings.EqualFold(parsed.Host, "github.com") {
		return "", false
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", false
	}
	owner, repo := parts[0], strings.TrimSuffix(parts[1], ".git")
	if repo == "" || repo == "." || repo == ".." || owner == "." || owner == ".." {
		return "", false
	}
	return "https://github.com/" + owner + "/" + repo + "/archive/HEAD.zip", true
}

// downloadArchive fetches the zip of a repository and unpacks it into dest, which must not exist yet.
func downloadArchive(ctx context.Context, repoURL, zipURL, dest string, progress Progress) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, zipURL, nil)
	if err != nil {
		return err
	}
	response, err := archiveHTTPClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	switch {
	case response.StatusCode == http.StatusNotFound:
		return errors.New("the repository was not found, or it is private")
	case response.StatusCode != http.StatusOK:
		return fmt.Errorf("the download answered %s", response.Status)
	}

	archive, err := os.CreateTemp(filepath.Dir(dest), "skill-archive-*.zip")
	if err != nil {
		return err
	}
	defer os.Remove(archive.Name())
	written, err := io.Copy(archive, &countingReader{source: io.LimitReader(response.Body, archiveMaxDownload+1), progress: progress})
	if closeErr := archive.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if written > archiveMaxDownload {
		return fmt.Errorf("the repository is larger than %d MB", archiveMaxDownload>>20)
	}

	say(progress, "Unpacking the files")
	if err := unpackArchive(archive.Name(), dest); err != nil {
		return err
	}
	record, err := json.MarshalIndent(downloadRecord{URL: repoURL, DownloadedAt: time.Now().UTC()}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dest, DownloadMarker), record, 0o644)
}

// unpackArchive writes the files of a GitHub zip into dest, without the folder named after the repository and the commit that wraps them.
// Links are left out: on Windows they need a privilege, and a link could point outside the repository.
func unpackArchive(archive, dest string) error {
	reader, err := zip.OpenReader(archive)
	if err != nil {
		return fmt.Errorf("the download is not a readable archive: %w", err)
	}
	defer reader.Close()
	if len(reader.File) > archiveMaxFiles {
		return fmt.Errorf("the repository has more than %d files", archiveMaxFiles)
	}
	var unpacked int64
	for _, file := range reader.File {
		// The name is checked as written: cleaned first, "repo/../../x" would turn into "x" and hide that it was trying to leave.
		_, inner, found := strings.Cut(file.Name, "/")
		if !found || strings.Trim(inner, "/") == "" {
			continue
		}
		if !filepath.IsLocal(filepath.FromSlash(inner)) {
			return fmt.Errorf("the archive holds a path outside the repository: %s", file.Name)
		}
		target := filepath.Join(dest, filepath.FromSlash(inner))
		mode := file.Mode()
		switch {
		case mode.IsDir():
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		case !mode.IsRegular():
			continue
		}
		unpacked += int64(file.UncompressedSize64)
		if unpacked > archiveMaxUnpacked {
			return fmt.Errorf("the repository is larger than %d MB once unpacked", archiveMaxUnpacked>>20)
		}
		if err := unpackFile(file, target, mode.Perm()|0o600); err != nil {
			return err
		}
	}
	return nil
}

func unpackFile(file *zip.File, target string, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	source, err := file.Open()
	if err != nil {
		return err
	}
	defer source.Close()
	out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, perm)
	if err != nil {
		return err
	}
	// The size in the header can lie; never write more than it announced.
	if _, err := io.Copy(out, io.LimitReader(source, int64(file.UncompressedSize64))); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// countingReader says how much has been received, once per megabyte, the way git says "Receiving objects".
type countingReader struct {
	source   io.Reader
	progress Progress
	read     int64
	shown    int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.source.Read(p)
	c.read += int64(n)
	if c.progress != nil && c.read>>20 > c.shown {
		c.shown = c.read >> 20
		c.progress.Detail(fmt.Sprintf("Received %d MB", c.shown))
	}
	return n, err
}
