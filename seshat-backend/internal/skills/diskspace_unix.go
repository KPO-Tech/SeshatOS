//go:build !windows

package skills

import "syscall"

// freeDiskBytes reports free space on the filesystem containing path.
// ok is false when the check couldn't be performed — callers should treat
// that as "skip the check" (best-effort), never as "disk full."
func freeDiskBytes(path string) (uint64, bool) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(path, &st); err != nil {
		return 0, false
	}
	return st.Bavail * uint64(st.Bsize), true
}
