package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/artifactlibs"
	"github.com/KPO-Tech/seshat-runtime/pkg/runtimepath"
)

// artifactLibsDirEnv points at the library folder the desktop ships (seshat-desktop/resources/artifact-libs). Unset, the folder is looked
// for next to the backend's own folder, where the packaged app puts it (resources/backend and resources/artifact-libs).
const artifactLibsDirEnv = "SESHAT_ARTIFACT_LIBS_DIR"

// newArtifactLibs builds the service that serves the CDN libraries of previewed pages: the shipped ones, then a bounded cache in the user's
// data (cache/artifact-libs). Neither is required: without them a page that loads a library simply fails to load it.
func newArtifactLibs() *artifactlibs.Service {
	bundle, err := artifactlibs.LoadBundle(artifactLibsDir())
	if err != nil {
		fmt.Fprintf(os.Stderr, "[API] artifact libraries: %v\n", err)
	}
	cache, err := artifactlibs.OpenCache(filepath.Join(runtimepath.CacheDir(""), "artifact-libs"), artifactlibs.DefaultMaxBytes, artifactlibs.DefaultMaxAge)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[API] artifact library cache: %v\n", err)
		cache = nil
	}
	return artifactlibs.New(bundle, cache)
}

func artifactLibsDir() string {
	if dir := os.Getenv(artifactLibsDirEnv); dir != "" {
		return dir
	}
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Join(filepath.Dir(filepath.Dir(exe)), "artifact-libs")
}
