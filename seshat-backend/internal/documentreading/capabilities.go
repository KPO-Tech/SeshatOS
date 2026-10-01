package documentreading

import "github.com/KPO-Tech/seshat/pkg/nativedoc"

type Capabilities struct {
	LocalBasicAvailable         bool
	PDFSmartAvailable           bool
	NativeDocCompiled           bool
	NativeDocRuntimeInitialized bool
	NativeDocModelsAvailable    bool
	NativeDocReady              bool
	VisionFallbackConfigured    bool
}

func DetectCapabilities() Capabilities {
	modelsAvailable := NativeDocModelsAvailable()
	runtimeInitialized := nativedoc.Initialized()
	return Capabilities{
		LocalBasicAvailable:         true,
		PDFSmartAvailable:           true,
		NativeDocCompiled:           nativeDocCompiled(),
		NativeDocRuntimeInitialized: runtimeInitialized,
		NativeDocModelsAvailable:    modelsAvailable,
		NativeDocReady:              nativeDocCompiled() && runtimeInitialized && modelsAvailable,
		VisionFallbackConfigured:    false,
	}
}
