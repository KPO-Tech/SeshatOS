package skillinstall

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/KPO-Tech/seshat-runtime/pkg/runtimepath"
)

// uvVersion is the version of uv that is downloaded when the machine has none. It is pinned, with the SHA-256 of each file, so that what
// is run is what was checked here and not whatever the release page holds on the day.
const uvVersion = "0.13.6"

type uvAsset struct {
	file   string
	sha256 string
}

// uvAssets are the official builds of uv (github.com/astral-sh/uv/releases), by "os/arch" as Go names them.
var uvAssets = map[string]uvAsset{
	"windows/amd64": {"uv-x86_64-pc-windows-msvc.zip", "a2a8820d5eea32f08ef467ef3b7f66883a9b076d5737a2fc2fbb5f458d1bb50f"},
	"windows/arm64": {"uv-aarch64-pc-windows-msvc.zip", "c2426c0c8e28b53d8c440e47a18d96ad4db51e159866c0e81435b196d7f0081c"},
	"linux/amd64":   {"uv-x86_64-unknown-linux-gnu.tar.gz", "f29c3e94ffabd7e6f3ba521dba169a9b7ec12100bf3257087f0f24f6123f3645"},
	"linux/arm64":   {"uv-aarch64-unknown-linux-gnu.tar.gz", "229e194255c7958d86d56e8790d969a6f74736592133f0dfd0076f754c642c1d"},
	"darwin/amd64":  {"uv-x86_64-apple-darwin.tar.gz", "63ba17fdda55ad1a230d4b37fc6017ffa10c23688c83818bd3bfdf914c652a02"},
	"darwin/arm64":  {"uv-aarch64-apple-darwin.tar.gz", "60fbd5c8a1ed681845eea28d9d622fcde03c51e91a43465b64a1e17db1ed3472"},
}

// uvDownloadBase is where the files are fetched from; a variable so that a test can serve its own.
var uvDownloadBase = "https://github.com/astral-sh/uv/releases/download/"

var uvHTTPClient = &http.Client{Timeout: 10 * time.Minute}

func uvExecutableName() string {
	if runtime.GOOS == "windows" {
		return "uv.exe"
	}
	return "uv"
}

// uvManagedPath is where the uv that Seshat downloaded lives.
func uvManagedPath() string {
	return runtimepath.Join("", "tools", "uv-"+uvVersion, uvExecutableName())
}

// uvCacheDir is the cache every environment links its packages from. It sits in the data folder, on the same volume as the environments, so
// that the links are hard links and a package present in ten environments is on the disk once.
func uvCacheDir() string {
	return runtimepath.Join("", "uv-cache")
}

// uvEnv is the environment of the programs uv runs.
func uvEnv() []string {
	return append(os.Environ(), "UV_CACHE_DIR="+uvCacheDir(), "UV_NO_PROGRESS=1", "UV_NO_COLOR=1", "NO_COLOR=1")
}

func uvDisabled() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv(EnvUV)), "off")
}

// uvCanBeDownloaded says whether there is an official build of uv for this machine and the person did not turn uv off.
func uvCanBeDownloaded() bool {
	if uvDisabled() {
		return false
	}
	_, ok := uvAssets[runtime.GOOS+"/"+runtime.GOARCH]
	return ok
}

// ensureUV gives the uv to use: the one on the machine, or the pinned one downloaded once and kept. When there is none and it cannot be
// downloaded or does not pass the check, it says false and pip does the work. A variable so that a test can stand in for the machine.
var ensureUV = func(ctx context.Context, progress Progress) (string, bool) {
	if uv, ok := findUV(); ok {
		return uv, true
	}
	if !uvCanBeDownloaded() {
		return "", false
	}
	asset := uvAssets[runtime.GOOS+"/"+runtime.GOARCH]
	say(progress, "Downloading uv, the installer of Python packages")
	if err := downloadUV(ctx, asset, uvManagedPath()); err != nil {
		say(progress, "uv could not be downloaded ("+shorten(err.Error())+"): pip is used instead")
		return "", false
	}
	if uv, ok := findUV(); ok {
		return uv, true
	}
	return "", false
}

func shorten(text string) string {
	if len(text) > 100 {
		return text[:100]
	}
	return text
}

func say(progress Progress, line string) {
	if progress != nil {
		progress.Detail(line)
	}
}

// downloadUV fetches one official build, checks it against the SHA-256 pinned for it, and keeps only the uv program, put in place whole or
// not at all.
func downloadUV(ctx context.Context, asset uvAsset, dest string) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, uvDownloadBase+uvVersion+"/"+asset.file, nil)
	if err != nil {
		return err
	}
	response, err := uvHTTPClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("the download answered %s", response.Status)
	}
	archive, err := os.CreateTemp(filepath.Dir(dest), "uv-download-*")
	if err != nil {
		return err
	}
	defer os.Remove(archive.Name())
	hash := sha256.New()
	if _, err := io.Copy(io.MultiWriter(archive, hash), response.Body); err != nil {
		archive.Close()
		return err
	}
	if err := archive.Close(); err != nil {
		return err
	}
	if got := hex.EncodeToString(hash.Sum(nil)); got != asset.sha256 {
		return fmt.Errorf("the file does not match the checksum that is pinned for it (%s)", got[:12])
	}

	part := dest + ".part"
	defer os.Remove(part)
	if strings.HasSuffix(asset.file, ".zip") {
		err = extractFromZip(archive.Name(), uvExecutableName(), part)
	} else {
		err = extractFromTarGz(archive.Name(), uvExecutableName(), part)
	}
	if err != nil {
		return err
	}
	if err := os.Chmod(part, 0o755); err != nil {
		return err
	}
	return os.Rename(part, dest)
}

func extractFromZip(archive, name, dest string) error {
	reader, err := zip.OpenReader(archive)
	if err != nil {
		return err
	}
	defer reader.Close()
	for _, file := range reader.File {
		if file.FileInfo().IsDir() || filepath.Base(file.Name) != name {
			continue
		}
		source, err := file.Open()
		if err != nil {
			return err
		}
		defer source.Close()
		return writeFile(dest, source)
	}
	return fmt.Errorf("%s is not in the download", name)
}

func extractFromTarGz(archive, name, dest string) error {
	file, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer file.Close()
	unzipped, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer unzipped.Close()
	reader := tar.NewReader(unzipped)
	for {
		header, err := reader.Next()
		if err == io.EOF {
			return fmt.Errorf("%s is not in the download", name)
		}
		if err != nil {
			return err
		}
		if header.Typeflag == tar.TypeReg && filepath.Base(header.Name) == name {
			return writeFile(dest, reader)
		}
	}
}

func writeFile(dest string, source io.Reader) error {
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, source); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
