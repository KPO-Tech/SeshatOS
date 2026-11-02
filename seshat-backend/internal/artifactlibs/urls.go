// Package artifactlibs serves the web libraries an agent-made page loads from a CDN (Chart.js, three.js, React, ...) without letting the
// page reach the network. The page keeps its ordinary CDN addresses; when it is previewed, they are rewritten to this backend, which answers
// from the copies shipped with the app, then from a bounded cache of exact versions it downloaded earlier, and downloads a missing exact
// version only for a page the app itself asked to preview.
package artifactlibs

import (
	"regexp"
	"strings"
)

// Hosts are the CDNs whose addresses are rewritten and served here. Any other address is left as it is, and the preview's CSP blocks it.
var Hosts = []string{"cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com", "esm.sh", "cdn.tailwindcss.com"}

func knownHost(host string) bool {
	for _, known := range Hosts {
		if host == known {
			return true
		}
	}
	return false
}

// cdnURL matches an absolute or protocol-relative address on one of Hosts, up to the first character that cannot be part of it in HTML,
// CSS or JavaScript source.
var cdnURL = regexp.MustCompile(`(?:https?:)?//(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|esm\.sh|cdn\.tailwindcss\.com)((?:[/?][^\s"'<>\x60()\\]*)?)`)

// RewriteCDNURLs points every CDN address in source at base (the backend's library route, without a trailing slash), keeping the host and
// the path so that relative imports inside a served file resolve back here too.
func RewriteCDNURLs(source, base string) string {
	return cdnURL.ReplaceAllStringFunc(source, func(match string) string {
		parts := cdnURL.FindStringSubmatch(match)
		rest := parts[2]
		if rest == "" {
			rest = "/"
		}
		return base + "/" + parts[1] + rest
	})
}

// rootRelativeImport matches an import or export whose module is a root-relative path ("/npm/react@18.3.1/+esm"): jsDelivr's +esm builds
// and esm.sh write their own modules that way, and the browser would resolve them against the backend instead of the CDN.
var rootRelativeImport = regexp.MustCompile(`((?:\bfrom|\bimport)\s*\(?\s*["'])/([^/"'])`)

// rewriteServed adapts a JavaScript or CSS file served for host: its absolute CDN addresses, and for the hosts that write them, its
// root-relative imports.
func rewriteServed(body []byte, host, contentType, base string) []byte {
	if !isText(contentType) {
		return body
	}
	text := RewriteCDNURLs(string(body), base)
	if host == "esm.sh" || host == "cdn.jsdelivr.net" {
		text = rootRelativeImport.ReplaceAllString(text, "${1}"+base+"/"+host+"/${2}")
	}
	return []byte(text)
}

func isText(contentType string) bool {
	return strings.HasPrefix(contentType, "text/") || strings.Contains(contentType, "javascript") || strings.Contains(contentType, "json")
}

// spec is a request for a library file, parsed from "<host>/<rest>".
type spec struct {
	host string
	// rest is the path after the host, without its leading slash, query included.
	rest string
	// For an npm-style address (jsDelivr's /npm/, unpkg): the package, the version as written (empty when none) and the file.
	npm     bool
	name    string
	version string
	file    string
}

// parseSpec reads "<host>/<path>[?query]" as written after the library route.
func parseSpec(hostAndRest string) (spec, bool) {
	host, rest, _ := strings.Cut(strings.TrimPrefix(hostAndRest, "/"), "/")
	if !knownHost(host) || strings.Contains(rest, "..") {
		return spec{}, false
	}
	s := spec{host: host, rest: rest}
	path, _, _ := strings.Cut(rest, "?")
	switch host {
	case "cdn.jsdelivr.net":
		if !strings.HasPrefix(path, "npm/") {
			return s, true
		}
		path = strings.TrimPrefix(path, "npm/")
	case "unpkg.com":
	default:
		return s, true
	}
	name, version, file, ok := splitPackage(path)
	if !ok {
		return spec{}, false
	}
	s.npm, s.name, s.version, s.file = true, name, version, file
	return s, true
}

// splitPackage reads "name[@version][/file]" or "@scope/name[@version][/file]".
func splitPackage(path string) (name, version, file string, ok bool) {
	scope := ""
	if strings.HasPrefix(path, "@") {
		var after string
		scope, after, ok = strings.Cut(path, "/")
		if !ok || scope == "@" {
			return "", "", "", false
		}
		path = after
		scope += "/"
	}
	head, file, _ := strings.Cut(path, "/")
	name, version, _ = strings.Cut(head, "@")
	if name == "" {
		return "", "", "", false
	}
	return scope + name, version, file, true
}

var exactVersion = regexp.MustCompile(`^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$`)

// isExact reports whether version names one release, the only kind ever downloaded: a range or a tag such as "latest" could change under
// a page that worked.
func isExact(version string) bool { return exactVersion.MatchString(version) }

// majorOf returns what two versions must share to be compatible, read from a version or a range ("4", "^4.2", "4.x", "~4.4.0"): the major
// number, or "0.<minor>" below 1.0, where a minor release may break (three.js, KaTeX). "" when it names none.
func majorOf(version string) string {
	version = strings.TrimLeft(version, "^~=v")
	major := leadingDigits(version)
	if major != "0" {
		return major
	}
	if minor := leadingDigits(strings.TrimPrefix(version, "0.")); minor != "" && strings.HasPrefix(version, "0.") {
		return "0." + minor
	}
	return "0"
}

func leadingDigits(s string) string {
	end := 0
	for end < len(s) && s[end] >= '0' && s[end] <= '9' {
		end++
	}
	return s[:end]
}

// fetchScope is what one previewed address allows to be downloaded: the whole package version for an npm-style address (its files import
// one another by relative path), the whole host for esm.sh (its modules import other packages of the same host), the address itself
// otherwise. Only an exact version opens a scope.
func fetchScope(s spec) string {
	switch {
	case s.npm:
		if !isExact(s.version) {
			return ""
		}
		prefix := s.host + "/"
		if s.host == "cdn.jsdelivr.net" {
			prefix += "npm/"
		}
		return prefix + s.name + "@" + s.version + "/"
	case s.host == "esm.sh":
		return "esm.sh/"
	case s.host == "cdnjs.cloudflare.com":
		parts := strings.Split(s.rest, "/")
		if len(parts) >= 5 && parts[0] == "ajax" && parts[1] == "libs" && isExact(parts[3]) {
			return strings.Join([]string{s.host, "ajax", "libs", parts[2], parts[3]}, "/") + "/"
		}
		return ""
	default:
		return ""
	}
}
