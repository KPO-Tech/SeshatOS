package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/api"
	seshatconfig "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/config"
	appconfig "github.com/KPO-Tech/seshat/pkg/config"
)

// version is stamped at build time via -ldflags "-X main.version=vX.Y.Z"
// (see .github/workflows/release-desktop.yml); "dev" for local builds.
var version = "dev"

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Println(version)
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		ch := make(chan os.Signal, 1)
		signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
		<-ch
		fmt.Println("\n[API] Arret du serveur en cours...")
		cancel()
	}()

	fmt.Printf("[API] seshat-backend %s\n", version)

	config, err := appconfig.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[API] Avertissement config: %v\n", err)
	}

	app, cleanup, err := seshatconfig.BuildApp(ctx, config)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[API] Erreur initialisation: %v\n", err)
		os.Exit(1)
	}
	defer func() { _ = cleanup() }()

	apiCfg := defaultAPIConfig(config)
	router := api.CreateRouter(apiCfg, app)

	ln, actualPort, err := listen(apiCfg.Port)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[API] Impossible d'ouvrir un port d'ecoute: %v\n", err)
		os.Exit(1)
	}

	srv := &http.Server{
		Handler:      router,
		ReadTimeout:  apiCfg.ReadTimeout,
		WriteTimeout: apiCfg.WriteTimeout,
		IdleTimeout:  apiCfg.IdleTimeout,
	}

	go func() {
		fmt.Printf("[API] Serveur demarre sur http://localhost:%d\n", actualPort)
		// Machine-readable line for a parent process (e.g. Electron's sidecar
		// spawner) that needs to discover the real port when the preferred
		// one was already taken - see listen()'s fallback below.
		fmt.Printf("SESHAT_BACKEND_READY port=%d\n", actualPort)
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "[API] Erreur serveur: %v\n", err)
			cancel()
		}
	}()

	<-ctx.Done()

	fmt.Println("[API] Arret graceful...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		fmt.Fprintf(os.Stderr, "[API] Erreur lors de l'arret: %v\n", err)
	}
	fmt.Println("[API] Serveur arrete")
}

// listen opens a TCP listener on preferredPort. If that port is already in
// use, it falls back to an OS-assigned free port (":0") instead of failing
// outright - a packaged desktop app can't assume its preferred port is free
// on every user's machine. Returns the listener and the port actually bound.
func listen(preferredPort int) (net.Listener, int, error) {
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", preferredPort))
	if err != nil {
		fmt.Printf("[API] Port %d indisponible (%v), selection d'un port libre...\n", preferredPort, err)
		ln, err = net.Listen("tcp", ":0")
		if err != nil {
			return nil, 0, err
		}
	}
	return ln, ln.Addr().(*net.TCPAddr).Port, nil
}
