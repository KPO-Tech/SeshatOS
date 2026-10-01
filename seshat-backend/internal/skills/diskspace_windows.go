//go:build windows

package skills

import "golang.org/x/sys/windows"

// freeDiskBytes reports free space on the volume containing path, via
// Win32's GetDiskFreeSpaceEx — the Windows equivalent of statfs. ok is false
// when the check couldn't be performed — callers should treat that as "skip
// the check" (best-effort), never as "disk full."
func freeDiskBytes(path string) (uint64, bool) {
	ptr, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return 0, false
	}
	var freeBytesAvailable uint64
	if err := windows.GetDiskFreeSpaceEx(ptr, &freeBytesAvailable, nil, nil); err != nil {
		return 0, false
	}
	return freeBytesAvailable, true
}
