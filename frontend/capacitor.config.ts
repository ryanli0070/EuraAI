import type { CapacitorConfig } from '@capacitor/cli';

// Live-reload toggle: set CAP_SERVER_URL to your Mac's LAN dev-server URL
// (e.g. http://192.168.1.20:5173) to run the *native app shell* against the
// Vite dev server on a physical iPad. Leave it UNSET for production builds —
// the app then loads the bundled `dist/` from inside the binary.
//   On-device dev (one command does it all): npx cap run ios --livereload --external
//   Manual:  CAP_SERVER_URL=http://<mac-ip>:5173 npx cap sync ios && npx cap open ios
const devServerUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'app.euraai',
  appName: 'EuraAI',
  webDir: 'dist',
  ...(devServerUrl
    ? {
        server: {
          url: devServerUrl,
          cleartext: true, // allow http:// to the LAN dev server (DEV ONLY)
        },
      }
    : {}),
  ios: {
    // Keep the WKWebView from rubber-banding under Apple Pencil strokes.
    scrollEnabled: false,
    contentInset: 'never',
    // Use the modern capacitor:// scheme; matches absolute-path assets from Vite.
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    Keyboard: {
      // Don't let the soft keyboard shove the canvas around.
      resize: 'none' as never,
    },
    SplashScreen: {
      // We dismiss it manually in initNative() once React has rendered, so the
      // user never sees a white flash. Background matches the app's light UI.
      launchAutoHide: false,
      backgroundColor: '#fafafa',
      showSpinner: false,
    },
  },
};

export default config;
