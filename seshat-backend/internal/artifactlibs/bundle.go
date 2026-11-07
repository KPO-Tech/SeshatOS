package artifactlibs

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Library is one entry of the manifest the desktop ships with its library folder (seshat-desktop/artifact-libs.json): an npm package at one
// version, or, with Host set, a file of another CDN (the Tailwind Play CDN).
type Library struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	// Host, when set, is the CDN this entry answers for instead of an npm package: "cdn.tailwindcss.com".
	Host string `json:"host,omitempty"`
	// Main is the file served for an address naming the package without a file.
	Main string `json:"main,omitempty"`
	// Files maps each shipped file, relative to the package, to its SHA-256. Only these are ever served.
	Files map[string]string `json:"files"`
}

type manifest struct {
	Libraries []Library `json:"libraries"`
}

// Bundle is the set of libraries shipped with the app, read-only: an update of the app replaces the whole folder.
type Bundle struct {
	dir  string
	libs []Library
}

// LoadBundle reads dir/manifest.json. A missing folder is an empty bundle, not an error: the cache still works without it.
func LoadBundle(dir string) (*Bundle, error) {
	b := &Bundle{dir: dir}
	if dir == "" {
		return b, nil
	}
	raw, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if os.IsNotExist(err) {
		return b, nil
	}
	if err != nil {
		return b, err
	}
	var m manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return b, fmt.Errorf("read the library manifest: %w", err)
	}
	b.libs = m.Libraries
	return b, nil
}

// lookup finds the shipped file for a request: an exact version only matches itself; a missing version, a tag or a range matches the
// shipped version of the same major (any shipped version when it names no major). sameMajor also lets an exact version fall back to the
// shipped one of its major, used when the exact one cannot be downloaded.
func (b *Bundle) lookup(s spec, sameMajor bool) (string, bool) {
	for _, lib := range b.libs {
		if !b.matches(lib, s) {
			continue
		}
		if s.npm && isExact(s.version) && s.version != lib.Version && !(sameMajor && majorOf(s.version) == majorOf(lib.Version)) {
			continue
		}
		if s.npm && !isExact(s.version) {
			if major := majorOf(s.version); major != "" && major != majorOf(lib.Version) {
				continue
			}
		}
		file := s.file
		if !s.npm {
			file = ""
		}
		if file == "" {
			file = lib.Main
		}
		if _, ok := lib.Files[file]; !ok || file == "" {
			continue
		}
		return filepath.Join(b.dir, lib.Name+"@"+lib.Version, filepath.FromSlash(file)), true
	}
	return "", false
}

func (b *Bundle) matches(lib Library, s spec) bool {
	if lib.Host != "" {
		return lib.Host == s.host
	}
	return s.npm && lib.Name == s.name
}
