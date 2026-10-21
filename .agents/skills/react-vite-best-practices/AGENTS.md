# React + Vite Best Practices — POS-Lite compiled reference

Local adaptation of agent-skills v2.0.0 (MIT). See [SKILL.md](SKILL.md) for scope.
Read [project constraints](references/project-constraints.md) first; historical impact percentages are not project benchmarks.
This file is compiled from current rules; edit source rules and regenerate together. Load only relevant rules for ordinary tasks.

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Preserve automatic chunking until a measured problem exists

No manualChunks config is not a defect. Inspect the installed Vite bundler types/version first.
Vite8 uses Rolldown; build.rolldownOptions is the native option surface, while compatibility options may differ.
Do not paste older rollupOptions/manualChunks/advancedChunks snippets without checking support.
Don't add router/state dependencies merely to name vendor chunks.
Route/lazy boundaries may solve the actual cost more simply.

Compare initial JS transferred/parsed, request waterfall and repeat-visit cache behavior under the same conditions.
Splitting too finely can add requests, shared dependency cycles or load-time regressions.
Keep initial POS/review state stable. Typecheck/build and exercise affected lazy routes after a justified change.

Reference: [Vite build options](https://vite.dev/config/build-options)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Version-aware minification

Keep the installed Vite minifier default unless measurements justify another option.
The reviewed Vite8 types support Oxc; inspect actual types/docs before changing flags.
Do not nest esbuild inside build or assume an old drop-console snippet applies to Oxc.
Do not mangle API/DTO property names or strip error logging to hide oversized dependencies.
Never rely on minification as secret redaction; secrets must not enter client code.
Keep required license notices.

If evaluating another minifier, compare actual gzip/Brotli transfer and build time, verify production UI behavior,
and document installed dependency/config changes. No fixed percentage savings claim without measurement.

Reference: [Vite minify](https://vite.dev/config/build-options#build-minify)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Match the user's Android browser

Start with the installed Vite default target. Read its version-specific baseline and test the actual supported browser set.
Do not change to esnext solely for a size estimate or assume every Android device supports the latest syntax.
Transpilation is not a blanket polyfill for missing runtime APIs.
Add legacy support only for a demonstrated support requirement and verify both build paths.

Record browser/device versions, syntax/runtime API requirements and measured payload difference.
Do not claim a fixed10–15% gain or add a plugin without need.

Reference: [Vite target](https://vite.dev/config/build-options#build-target)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Source-map policy

sourcemap:false is a valid default without a private debugging workflow.
sourcemap:hidden omits the browser sourceMappingURL comment but still emits map files;
it does not prevent downloading a publicly served .map URL.
If private error tracking is authorized, generate/upload maps privately and remove/exclude them from public assets,
or explicitly deny access and verify the deployed URL behavior.
Do not add a monitoring account/plugin or upload source automatically.
Never put credentials into code/maps; sourcemapExcludeSources alone isn't an access control.

Reference: [Vite sourcemap](https://vite.dev/config/build-options#build-sourcemap)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Use defaults and inspect the actual bundle

ESM imports allow tree shaking; barrel or namespace imports are not automatically broken.
Don't declare missing package sideEffects metadata a defect in this app.
Do not set moduleSideEffects:no-external, propertyReadSideEffects:false or disable try/catch safeguards blindly:
initialization, CSS, polyfills or runtime getters may be significant.
If publishing a genuinely side-effect-free shared package, declare accurate metadata and preserve style/init files.
Do not add lodash/date/router libraries just because examples use them.

Measure what remains in the production artifact and test affected initialization/styles before and after changes.
Dependency prebundling is a dev optimization, not proof of production tree shaking.

Reference: [Vite build options](https://vite.dev/config/build-options)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Configure Build-Time Compression

**Impact: CRITICAL (60-80% smaller asset size)**

Configure build-time compression to serve pre-compressed assets, reducing server load and improving delivery speed.

## Incorrect

```tsx
// ❌ Bad: No compression configured
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Relying only on server-side compression
    // which adds CPU overhead on every request
  },
});
```

```tsx
// ❌ Bad: Runtime compression adds latency
import express from 'express';
import compression from 'compression';

const app = express();

// Compresses every response on-the-fly
app.use(compression());
app.use(express.static('dist'));
```

**Problems:**
- Server-side runtime compression adds CPU overhead and latency to every request
- Lower compression levels used at runtime to keep latency acceptable
- No Brotli support in most runtime compression middleware
- Compression work repeated for every request instead of done once at build time

## Correct

```tsx
// ✅ Good: Pre-compress assets during build
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    react(),
    // Generate gzip compressed files
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024, // Only compress files > 1KB
      deleteOriginFile: false,
    }),
    // Also generate Brotli compressed files for modern browsers
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
    }),
  ],
  build: {
    cssMinify: true,
  },
});
```

```tsx
// ✅ Good: Advanced compression with maximum quality
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import viteCompression from 'vite-plugin-compression';
import { constants as zlibConstants } from 'zlib';

export default defineConfig({
  plugins: [
    react(),
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024,
      compressionOptions: {
        level: 9, // Maximum compression
      },
      filter: /\.(js|css|html|json|svg|txt|xml|wasm)$/i,
    }),
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
      compressionOptions: {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 11, // Maximum quality
        },
      },
      filter: /\.(js|css|html|json|svg|txt|xml|wasm)$/i,
    }),
  ],
});
```

```nginx
# nginx.conf - Serve pre-compressed files
server {
    listen 80;
    root /var/www/app/dist;

    gzip_static on;
    brotli_static on;

    location ~* \.(js|css|html|json|svg|txt|xml|wasm)$ {
        gzip_static on;
        brotli_static on;
        try_files $uri $uri/ =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header Vary "Accept-Encoding";
    }
}
```

```tsx
// ✅ Good: Express server with pre-compressed file serving
import express from 'express';
import expressStaticGzip from 'express-static-gzip';

const app = express();

app.use('/', expressStaticGzip('dist', {
  enableBrotli: true,
  orderPreference: ['br', 'gzip'],
  serveStatic: {
    maxAge: '1y',
    immutable: true,
  },
}));

app.listen(3000);
```

**Benefits:**
- Pre-compressed files eliminate on-the-fly compression overhead
- Maximum compression levels achievable without impacting response latency
- Brotli offers 15-25% better compression than gzip for text-based content
- Faster Time to First Byte with no compression overhead per request
- Both gzip and Brotli versions provide maximum browser compatibility

| Format | Browser Support | Typical Ratio | Best For |
|--------|-----------------|---------------|----------|
| Gzip | 95%+ | 70-80% | Universal fallback |
| Brotli | 90%+ | 80-90% | Modern browsers |

Reference: [vite-plugin-compression](https://github.com/vbenjs/vite-plugin-compression)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Configure Asset Hashing for Cache Busting

**Impact: CRITICAL (Ensures latest version delivery)**

Configure content-based asset hashing to enable aggressive caching while ensuring users always receive the latest version after deployments.

## Incorrect

```tsx
// ❌ Bad: No hash - files get cached indefinitely
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
```

```tsx
// ❌ Bad: Version-based hashing - all files invalidated on any change
output: {
  entryFileNames: `assets/[name].${packageJson.version}.js`,
  chunkFileNames: `assets/[name].${packageJson.version}.js`,
  assetFileNames: `assets/[name].${packageJson.version}.[ext]`,
}
```

**Problems:**
- Without hashes, users see stale content after deployments
- Version-based hashes invalidate all files even when only one changed
- No way to set aggressive cache headers without risking stale content
- CDNs and browser caches serve outdated files

## Correct

```tsx
// ✅ Good: Content-based hashing with organized asset directories
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/js/[name]-[hash].js',
        chunkFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.') || [];
          const ext = info[info.length - 1];

          if (/png|jpe?g|gif|svg|webp|avif|ico/i.test(ext)) {
            return 'assets/images/[name]-[hash][extname]';
          }
          if (/woff2?|eot|ttf|otf/i.test(ext)) {
            return 'assets/fonts/[name]-[hash][extname]';
          }
          if (/css/i.test(ext)) {
            return 'assets/css/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
```

```tsx
// ✅ Good: Server caching configuration
import express from 'express';
import path from 'path';

const app = express();

// Immutable caching for hashed assets (1 year)
app.use('/assets', express.static(path.join(__dirname, 'dist/assets'), {
  maxAge: '1y',
  immutable: true,
}));

// Short cache for index.html (always check for updates)
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: '5m',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  },
}));
```

```nginx
# nginx.conf - Optimal caching strategy
server {
    listen 80;
    root /var/www/app/dist;

    location ~* \.html$ {
        add_header Cache-Control "no-cache, must-revalidate";
        add_header Vary "Accept-Encoding";
        try_files $uri /index.html;
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header Vary "Accept-Encoding";
        try_files $uri =404;
    }

    location = /sw.js {
        add_header Cache-Control "no-cache, must-revalidate";
        try_files $uri =404;
    }
}
```

**Benefits:**
- Content hashes create new URLs when files change, bypassing cached versions automatically
- Hashed files can be cached indefinitely with the `immutable` directive
- Users receive new code immediately after deployment without clearing cache
- Unchanged files remain cached while only updated files are downloaded
- Works seamlessly with CDNs and edge caching strategies

| Cache-Control | Target |
|--------------|--------|
| `public, max-age=31536000, immutable` | Hashed assets |
| `no-cache, must-revalidate` | HTML files, service workers |

Reference: [Vite Build Options - rollupOptions](https://vitejs.dev/config/build-options.html#build-rollupoptions)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Use React.lazy() for Route-Based Splitting

**Impact: CRITICAL (50-80% smaller initial bundle)**

Loading all route components upfront delays initial page load. Users download code for pages they may never visit. Route-based code splitting ensures users only download code for the current route.

## Incorrect

```typescript
// ❌ Bad: All imports are eager - loaded immediately
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Admin from './pages/Admin'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}
```

**Problems:**
- All 5 page components are bundled together and loaded on initial page load
- Users download code for pages they may never visit
- Larger initial bundle means slower Time to Interactive
- No benefit from caching individual route chunks

## Correct

```typescript
// ✅ Good: Lazy load route components
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

const Home = lazy(() => import('./pages/Home'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Settings = lazy(() => import('./pages/Settings'))
const Profile = lazy(() => import('./pages/Profile'))
const Admin = lazy(() => import('./pages/Admin'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
```

```typescript
// ✅ Good: Preload on hover for instant navigation
const Dashboard = lazy(() => import('./pages/Dashboard'))

function NavLink() {
  const preloadDashboard = () => {
    import('./pages/Dashboard')
  }

  return (
    <Link
      to="/dashboard"
      onMouseEnter={preloadDashboard}
      onFocus={preloadDashboard}
    >
      Dashboard
    </Link>
  )
}
```

**Benefits:**
- Initial bundle reduced by 50-80% since only the current route is loaded
- Time to Interactive significantly improved
- Each route loads only when navigated to
- Vite automatically names chunks based on file path — no magic comments needed
- Preloading on hover makes navigation feel instant

Reference: [React lazy](https://react.dev/reference/react/lazy) | [Vite Code Splitting](https://vitejs.dev/guide/build.html#chunking-strategy)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Strategic Suspense Boundaries for Lazy Loading

**Impact: CRITICAL (Progressive loading, better UX)**

Without proper Suspense boundaries, a single lazy component can block the entire UI. Strategic placement of Suspense boundaries allows parts of the UI to load independently.

## Incorrect

```typescript
// ❌ Bad: Single Suspense at root - entire app shows loading state
function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Header />
      <Sidebar />
      <MainContent />
      <Footer />
    </Suspense>
  )
}
```

**Problems:**
- If any lazy component is loading, the entire app shows the loading state
- No progressive rendering — users see nothing until everything loads
- Poor perceived performance even on fast connections
- No granular control over loading fallbacks per section

## Correct

```typescript
// ✅ Good: Strategic Suspense boundaries per section
function App() {
  return (
    <div className="app-layout">
      {/* Header loads immediately - not lazy */}
      <Header />

      <div className="main-layout">
        {/* Sidebar has its own boundary */}
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />
        </Suspense>

        {/* Main content independent */}
        <Suspense fallback={<ContentSkeleton />}>
          <MainContent />
        </Suspense>
      </div>

      {/* Footer loads immediately */}
      <Footer />
    </div>
  )
}
```

```typescript
// ✅ Good: Nested Suspense for complex UIs
function Dashboard() {
  return (
    <div className="dashboard">
      <h1>Dashboard</h1>

      <div className="dashboard-grid">
        <Suspense fallback={<WidgetSkeleton />}>
          <StatsWidget />
        </Suspense>

        <Suspense fallback={<WidgetSkeleton />}>
          <ChartWidget />
        </Suspense>

        <Suspense fallback={<WidgetSkeleton />}>
          <RecentActivityWidget />
        </Suspense>
      </div>
    </div>
  )
}
```

```typescript
// ✅ Good: Error Boundaries with Suspense
import { ErrorBoundary } from 'react-error-boundary'

function App() {
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="error-container">
      <h2>Something went wrong</h2>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  )
}
```

```typescript
// ✅ Good: Skeleton components match actual content layout
function ContentSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-1/4 mb-4" />
      <div className="h-4 bg-gray-200 rounded w-full mb-2" />
      <div className="h-4 bg-gray-200 rounded w-full mb-2" />
      <div className="h-4 bg-gray-200 rounded w-3/4" />
    </div>
  )
}
```

**Benefits:**
- Parts of UI render independently without blocking each other
- Better perceived performance with skeleton loading states
- Graceful degradation on slow networks
- Error boundaries catch loading failures per section, not globally

Reference: [React Suspense](https://react.dev/reference/react/Suspense) | [react-error-boundary](https://github.com/bvaughn/react-error-boundary)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Use Dynamic Imports for Heavy Components

**Impact: CRITICAL (30-50% reduction in initial bundle)**

Heavy components like charts, editors, and complex forms should not be loaded until needed. Dynamic imports allow loading code on-demand, reducing initial bundle size.

## Incorrect

```typescript
// ❌ Bad: All heavy libraries loaded upfront
import { Chart } from 'chart.js'
import ReactQuill from 'react-quill'
import { PDFViewer } from '@react-pdf/renderer'
import MonacoEditor from '@monaco-editor/react'

function Dashboard() {
  const [showChart, setShowChart] = useState(false)

  return (
    <div>
      <button onClick={() => setShowChart(true)}>Show Chart</button>
      {showChart && <Chart data={data} />}
    </div>
  )
}
```

**Problems:**
- Chart.js, React Quill, PDF renderer, and Monaco are all loaded even if never used
- Initial bundle bloated with hundreds of KBs of library code
- Slower Time to Interactive for all users regardless of feature usage
- Heavy parsing blocks the main thread on mobile devices

## Correct

```typescript
// ✅ Good: Lazy load heavy components
import { lazy, Suspense, useState } from 'react'

const Chart = lazy(() => import('./components/Chart'))
const Editor = lazy(() => import('./components/Editor'))
const PDFViewer = lazy(() => import('./components/PDFViewer'))

function Dashboard() {
  const [showChart, setShowChart] = useState(false)
  const [showEditor, setShowEditor] = useState(false)

  return (
    <div>
      <button onClick={() => setShowChart(true)}>Show Chart</button>
      <button onClick={() => setShowEditor(true)}>Show Editor</button>

      {showChart && (
        <Suspense fallback={<ChartSkeleton />}>
          <Chart data={data} />
        </Suspense>
      )}

      {showEditor && (
        <Suspense fallback={<EditorSkeleton />}>
          <Editor />
        </Suspense>
      )}
    </div>
  )
}
```

```typescript
// ✅ Good: Conditional dynamic import for libraries
async function exportToPDF() {
  const { PDFDocument } = await import('pdf-lib')
  const pdfDoc = await PDFDocument.create()
  // ... generate PDF
}

function ExportButton() {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    await exportToPDF()
    setLoading(false)
  }

  return (
    <button onClick={handleExport} disabled={loading}>
      {loading ? 'Generating...' : 'Export PDF'}
    </button>
  )
}
```

```typescript
// ✅ Good: Preload on interaction intent
const HeavyModal = lazy(() => import('./HeavyModal'))

function ModalTrigger() {
  const [isOpen, setIsOpen] = useState(false)

  const preload = () => {
    import('./HeavyModal')
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        onMouseEnter={preload}
        onFocus={preload}
      >
        Open Settings
      </button>

      {isOpen && (
        <Suspense fallback={<ModalSkeleton />}>
          <HeavyModal onClose={() => setIsOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
```

```typescript
// Declare lazy components at module scope to preserve identity/state.
const AdminPanel = lazy(() => import('./AdminPanel'))

function App({ user }: { user: { isAdmin: boolean } }) {

  return (
    <div>
      <MainContent />
      {user.isAdmin && (
        <Suspense fallback={<Loading />}>
          <AdminPanel />
        </Suspense>
      )}
    </div>
  )
}
```

**Benefits:**
- Initial bundle can be 50%+ smaller by deferring heavy libraries
- Faster Time to Interactive since only critical code is parsed upfront
- Better user experience on slow connections and mobile devices
- Preloading on hover makes subsequent loads feel instant
- Feature-flag loading avoids shipping admin code to regular users

Libraries that should typically be dynamically imported:
- Chart libraries (Chart.js, Recharts, D3)
- Rich text editors (React Quill, TipTap, Slate)
- Code editors (Monaco, CodeMirror)
- PDF libraries (react-pdf, pdf-lib)
- Date pickers with locales
- Map libraries (Mapbox, Google Maps)
- Markdown renderers

Reference: [Vite Dynamic Import](https://vitejs.dev/guide/features.html#dynamic-import) | [React lazy](https://react.dev/reference/react/lazy)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Lazy Load Non-Critical Components

**Impact: CRITICAL (20-40% smaller initial bundle)**

Use React.lazy for component-level code splitting to load non-critical UI components on demand.

## Incorrect

```tsx
// ❌ Bad: All components imported eagerly
import { useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SettingsPanel from './components/SettingsPanel';
import NotificationCenter from './components/NotificationCenter';
import UserProfileModal from './components/UserProfileModal';
import HelpDrawer from './components/HelpDrawer';
import FeedbackForm from './components/FeedbackForm';
import AdvancedFilters from './components/AdvancedFilters';
import ExportDialog from './components/ExportDialog';

function Dashboard() {
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  return (
    <div>
      <Header />
      <Sidebar />
      <MainContent />
      {showSettings && <SettingsPanel />}
      {showProfile && <UserProfileModal />}
    </div>
  );
}
// All modals, drawers, and dialogs loaded even if never opened
```

**Problems:**
- All modal, drawer, and dialog code is downloaded on initial page load
- Users pay the cost of parsing code they may never use
- Larger initial bundle slows Time to Interactive
- Heavy components block the main thread during parsing on mobile

## Correct

```tsx
// ✅ Good: Component-level lazy loading
import { lazy, Suspense, useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import { Skeleton } from './components/ui/Skeleton';

const SettingsPanel = lazy(() => import('./components/SettingsPanel'));
const NotificationCenter = lazy(() => import('./components/NotificationCenter'));
const UserProfileModal = lazy(() => import('./components/UserProfileModal'));
const HelpDrawer = lazy(() => import('./components/HelpDrawer'));
const FeedbackForm = lazy(() => import('./components/FeedbackForm'));
const AdvancedFilters = lazy(() => import('./components/AdvancedFilters'));
const ExportDialog = lazy(() => import('./components/ExportDialog'));

function LazyModal({
  isOpen,
  children
}: {
  isOpen: boolean;
  children: React.ReactNode
}) {
  if (!isOpen) return null;

  return (
    <Suspense fallback={<Skeleton className="modal-skeleton" />}>
      {children}
    </Suspense>
  );
}

function Dashboard() {
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  return (
    <div>
      <Header
        onSettingsClick={() => setShowSettings(true)}
        onProfileClick={() => setShowProfile(true)}
      />
      <Sidebar />
      <MainContent />

      <LazyModal isOpen={showSettings}>
        <SettingsPanel onClose={() => setShowSettings(false)} />
      </LazyModal>

      <LazyModal isOpen={showProfile}>
        <UserProfileModal onClose={() => setShowProfile(false)} />
      </LazyModal>
    </div>
  );
}
```

```tsx
// ✅ Good: Lazy component with preloading
import { lazy, ComponentType, LazyExoticComponent } from 'react';

interface PreloadableComponent<T extends ComponentType<any>>
  extends LazyExoticComponent<T> {
  preload: () => Promise<{ default: T }>;
}

export function lazyWithPreload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): PreloadableComponent<T> {
  const Component = lazy(factory) as PreloadableComponent<T>;
  Component.preload = factory;
  return Component;
}

const SettingsPanel = lazyWithPreload(() => import('./components/SettingsPanel'));

function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => SettingsPanel.preload()}
      onFocus={() => SettingsPanel.preload()}
    >
      Settings
    </button>
  );
}
```

```tsx
// ✅ Good: Lazy loading below-the-fold content with Intersection Observer
import { lazy, Suspense } from 'react';
import { useInView } from 'react-intersection-observer';

const RelatedProducts = lazy(() => import('./components/RelatedProducts'));
const CustomerReviews = lazy(() => import('./components/CustomerReviews'));

function ProductPage({ productId }: { productId: string }) {
  const { ref: reviewsRef, inView: reviewsInView } = useInView({
    triggerOnce: true,
    rootMargin: '200px',
  });

  return (
    <div>
      <ProductHeader productId={productId} />
      <ProductGallery productId={productId} />

      <section ref={reviewsRef}>
        {reviewsInView && (
          <Suspense fallback={<ReviewsSkeleton />}>
            <CustomerReviews productId={productId} />
          </Suspense>
        )}
      </section>
    </div>
  );
}
```

**Benefits:**
- Modals, drawers, and dialogs only load when actually opened
- Faster First Contentful Paint since critical UI renders immediately
- Below-the-fold content loads as users scroll, not on initial page load
- Preloading on hover eliminates perceived delay when opening components
- Better memory usage since components only occupy memory when rendered

| Component Type | Lazy Load? | Reason |
|---------------|------------|--------|
| Modals/Dialogs | Yes | Only shown on interaction |
| Drawers/Panels | Yes | Hidden by default |
| Below-fold content | Yes | Not in initial viewport |
| Tabs (non-default) | Yes | Hidden until selected |
| Header/Navigation | No | Always visible |
| Above-fold content | No | Critical for FCP |

Reference: [React lazy](https://react.dev/reference/react/lazy) | [react-intersection-observer](https://github.com/thebuilder/react-intersection-observer)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Prefetch Code Chunks on User Intent

**Impact: CRITICAL (Instant navigation perceived speed)**

Use prefetch and preload hints to load code chunks before they are needed, improving perceived navigation speed.

## Incorrect

```tsx
// ❌ Bad: No prefetching - chunks load only when navigation occurs
import { lazy, Suspense } from 'react';
import { Routes, Route, Link } from 'react-router-dom';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <>
      <nav>
        <Link to="/">Dashboard</Link>
        <Link to="/analytics">Analytics</Link>
        <Link to="/settings">Settings</Link>
      </nav>

      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Suspense>
    </>
  );
}
// User clicks link -> waits for chunk download -> sees loading -> page renders
```

**Problems:**
- Users see loading spinners on every navigation
- Chunks only start downloading after the user clicks
- No anticipation of user intent leads to perceived slowness
- Wasted idle time that could be used for preloading

## Correct

```tsx
// ✅ Good: Prefetch on hover/focus for instant-feeling navigation
import { lazy, Suspense, useCallback } from 'react';
import { Routes, Route, Link, LinkProps } from 'react-router-dom';

function lazyWithPreload<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  const Component = lazy(factory);
  (Component as any).preload = factory;
  return Component as typeof Component & { preload: typeof factory };
}

const Dashboard = lazyWithPreload(() => import('./pages/Dashboard'));
const Analytics = lazyWithPreload(() => import('./pages/Analytics'));
const Settings = lazyWithPreload(() => import('./pages/Settings'));

interface PrefetchLinkProps extends LinkProps {
  preload?: () => Promise<any>;
}

function PrefetchLink({ preload, onMouseEnter, onFocus, ...props }: PrefetchLinkProps) {
  const handlePreload = useCallback(() => {
    preload?.();
  }, [preload]);

  return (
    <Link
      {...props}
      onMouseEnter={(e) => {
        handlePreload();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        handlePreload();
        onFocus?.(e);
      }}
    />
  );
}

function App() {
  return (
    <>
      <nav>
        <PrefetchLink to="/" preload={Dashboard.preload}>Dashboard</PrefetchLink>
        <PrefetchLink to="/analytics" preload={Analytics.preload}>Analytics</PrefetchLink>
        <PrefetchLink to="/settings" preload={Settings.preload}>Settings</PrefetchLink>
      </nav>

      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Suspense>
    </>
  );
}
// User hovers link -> chunk downloads -> user clicks -> instant navigation
```

```tsx
// ✅ Good: Prefetch based on viewport visibility
import { useEffect, useRef } from 'react';

interface PrefetchOnVisibleProps {
  children: React.ReactNode;
  preload: () => Promise<any>;
  rootMargin?: string;
}

export function PrefetchOnVisible({
  children,
  preload,
  rootMargin = '200px',
}: PrefetchOnVisibleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefetched = useRef(false);

  useEffect(() => {
    if (!ref.current || prefetched.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !prefetched.current) {
          prefetched.current = true;
          preload();
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [preload, rootMargin]);

  return <div ref={ref}>{children}</div>;
}
```

```tsx
// ✅ Good: Prefetch after idle time
import { useEffect, useRef } from 'react';

export function usePrefetchAfterIdle(
  preloadFns: Array<() => Promise<any>>,
  delay: number = 2000
) {
  const prefetched = useRef(false);

  useEffect(() => {
    if (prefetched.current) return;

    const prefetch = () => {
      if (prefetched.current) return;
      prefetched.current = true;

      preloadFns.forEach((fn) => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => fn(), { timeout: 5000 });
        } else {
          setTimeout(fn, 100);
        }
      });
    };

    const timeoutId = setTimeout(prefetch, delay);
    return () => clearTimeout(timeoutId);
  }, [preloadFns, delay]);
}

// Usage
function App() {
  usePrefetchAfterIdle([Analytics.preload, Settings.preload], 2000);
  return (/* ... */);
}
```

**Benefits:**
- Code loads while users decide, making clicks feel instantaneous
- Eliminates loading spinners for common navigation paths
- Prefetching during idle time does not compete with critical resources
- Maintains code splitting benefits with smarter preloading
- Users on slow connections benefit the most from preloading

| Strategy | Trigger | Best For |
|----------|---------|----------|
| Hover/Focus | User intent signal | Navigation links |
| Viewport Entry | Scroll position | Below-fold sections |
| Idle Time | After initial load | Common routes |
| `modulepreload` | Page load | Critical vendors |

Reference: [Vite modulePreload](https://vitejs.dev/config/build-options.html#build-modulepreload) | [React lazy](https://react.dev/reference/react/lazy)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Prefer dependency discovery

Missing optimizeDeps is not itself a defect. Measure repeated optimization or identify a missed linked/dynamic import
before adding a targeted include/exclude. Check installed dependencies; don't install router/query/store/date libraries
to satisfy a sample config. Inspect Vite8's installed optimizer option types before using legacy esbuildOptions.
Warm only actual frequently used files when measurements justify it.
Do not repeatedly clear caches or force optimization to mask a persistent resolution error.

Reference: [Vite dependency prebundling](https://vite.dev/guide/dep-pre-bundling)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Structure Components for Fast Refresh

**Impact: HIGH (Instant updates without losing state)**

Structure components to take full advantage of React Fast Refresh for instant updates during development.

## Incorrect

```tsx
// ❌ Bad: Named exports can break Fast Refresh in some cases
export const App = () => {
  return <div>App</div>;
};

// Multiple component exports in one file
export const Header = () => <header>Header</header>;
export const Footer = () => <footer>Footer</footer>;
export const Sidebar = () => <aside>Sidebar</aside>;
```

```tsx
// ❌ Bad: Module-level side effects break Fast Refresh
import { fetchUser } from './api';

const initialUser = await fetchUser('current');

export default function UserProfile() {
  const [user] = useState(initialUser);
  return <div>{user.name}</div>;
}
```

```tsx
// ❌ Bad: Mixing components with non-component exports
export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  );
}

export const MAX_COUNT = 100;
export const formatCount = (n: number) => n.toLocaleString();
```

```tsx
// ❌ Bad: Anonymous component - Fast Refresh can't identify it
export default () => {
  return <div>Anonymous</div>;
};
```

**Problems:**
- Multiple components per file may cause full page reloads instead of hot updates
- Module-level side effects re-execute on every edit, breaking state
- Non-component exports in component files trigger full module replacement
- Anonymous components cannot be tracked by Fast Refresh

## Correct

```tsx
// ✅ Good: Default export for main component, one per file
export default function App() {
  return (
    <div>
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
```

```tsx
// ✅ Good: Separate file for constants
// constants/counter.ts
export const MAX_COUNT = 100;
export const MIN_COUNT = 0;

// utils/format.ts
export function formatCount(n: number): string {
  return n.toLocaleString();
}

// components/Counter.tsx - Pure component file
import { useState } from 'react';
import { MAX_COUNT, MIN_COUNT } from '../constants/counter';
import { formatCount } from '../utils/format';

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="counter">
      <button onClick={() => setCount(c => Math.max(c - 1, MIN_COUNT))}>-</button>
      <span>{formatCount(count)}</span>
      <button onClick={() => setCount(c => Math.min(c + 1, MAX_COUNT))}>+</button>
    </div>
  );
}
```

```tsx
// ✅ Good: Proper data fetching with hooks instead of module-level side effects
import { useQuery } from '@tanstack/react-query';
import { fetchUser } from '../api/users';

export default function UserProfile() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user', 'current'],
    queryFn: () => fetchUser('current'),
  });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div className="user-profile">
      <Avatar src={user.avatar} alt={user.name} />
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
}
```

```tsx
// ✅ Good: Set displayName on HOCs for Fast Refresh and DevTools
export function withAuth<P extends object>(
  WrappedComponent: ComponentType<P>
) {
  function WithAuth(props: P) {
    const { user, isLoading } = useAuth();
    if (isLoading) return <LoadingSpinner />;
    if (!user) return <Navigate to="/login" />;
    return <WrappedComponent {...props} />;
  }

  WithAuth.displayName = `WithAuth(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return WithAuth;
}
```

**Benefits:**
- State preserved across edits — no losing form inputs or scroll position
- Changes reflect in ~50ms, enabling rapid UI iteration
- Error recovery restores previous state without full reload
- Only changed components re-render, keeping the rest of the app intact

| Pattern | Fast Refresh | Notes |
|---------|--------------|-------|
| Default export function | Works | Recommended |
| Named export function | Usually works | Name must be PascalCase |
| Anonymous function | Fails | Always name components |
| Multiple components/file | May break | One component per file |
| Non-component exports | May break | Separate into utility files |

Reference: [React Fast Refresh](https://react.dev/learn/editor-setup#your-editor) | [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Start with react() and Vite defaults

No custom HMR config is fine for ordinary local development.
The reviewed plugin-react6 Options has no fastRefresh:true flag; check actual installed types.
Don't force ws, polling or public host without diagnosing the network/file-watch issue.
For authorized Android LAN testing explicitly scope host/allowedHosts; never use allowedHosts:true as a shortcut.
Keep API proxy port aligned with Express.

Separate non-component exports as the Fast Refresh lint requires; avoid unconditional hot.accept hacks.
Dispose listeners/interceptors when custom HMR code genuinely needs cleanup.
Do not introduce Zustand/Axios merely to handle refresh.

POS-Lite plans same-origin HttpOnly session cookies plus CSRF; do not copy localStorage/Bearer token interceptors.
Preserve pending transaction identity across refresh and don't auto-submit money after HMR.

Reference: [Vite server options](https://vite.dev/config/server-options)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Optimize Image Loading and Format

**Impact: HIGH (40-70% reduction in image payload)**

Unoptimized images are often the largest assets, significantly impacting page load time. Proper image handling reduces bandwidth and improves Core Web Vitals.

## Incorrect

```typescript
// ❌ Bad: Large images loaded eagerly with no optimization
function Gallery() {
  return (
    <div>
      <img src="/images/hero.png" />
      <img src="/images/feature1.png" />
      <img src="/images/feature2.png" />
      <img src="/images/feature3.png" />
    </div>
  )
}
```

**Problems:**
- No lazy loading — all images downloaded immediately
- No responsive images — oversized images on small screens
- No explicit dimensions — causes Cumulative Layout Shift (CLS)
- Unoptimized PNG format — WebP/AVIF are significantly smaller
- Missing alt attributes — accessibility violation

## Correct

```typescript
// ✅ Good: Optimized image loading
function Gallery() {
  return (
    <div>
      {/* Critical above-fold image */}
      <img
        src="/images/hero.webp"
        alt="Hero banner"
        width={1200}
        height={600}
        fetchPriority="high"
      />

      {/* Below-fold images - lazy load */}
      <img
        src="/images/feature1.webp"
        alt="Feature 1"
        width={400}
        height={300}
        loading="lazy"
        decoding="async"
      />
      <img
        src="/images/feature2.webp"
        alt="Feature 2"
        width={400}
        height={300}
        loading="lazy"
        decoding="async"
      />
    </div>
  )
}
```

```typescript
// ✅ Good: Responsive images with format fallback
function ResponsiveImage() {
  return (
    <picture>
      <source
        srcSet="/images/hero-480.webp 480w,
                /images/hero-768.webp 768w,
                /images/hero-1200.webp 1200w"
        type="image/webp"
        sizes="(max-width: 480px) 480px,
               (max-width: 768px) 768px,
               1200px"
      />
      <img
        src="/images/hero-1200.jpg"
        alt="Hero image"
        width={1200}
        height={600}
        loading="lazy"
      />
    </picture>
  )
}
```

```typescript
// ✅ Good: Vite image optimization plugin
// vite.config.ts
import { defineConfig } from 'vite'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'

export default defineConfig({
  plugins: [
    ViteImageOptimizer({
      png: { quality: 80 },
      jpeg: { quality: 80 },
      webp: { lossless: true },
    }),
  ],
})
```

```typescript
// ✅ Good: Reusable Image component
interface ImageProps {
  src: string
  alt: string
  width: number
  height: number
  priority?: boolean
  className?: string
}

export function Image({
  src,
  alt,
  width,
  height,
  priority = false,
  className,
}: ImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : 'auto'}
      className={className}
    />
  )
}
```

```typescript
// ✅ Good: Inline small images and use URL imports for backgrounds
// vite.config.ts
export default defineConfig({
  build: {
    assetsInlineLimit: 4096, // Inline images < 4KB as base64
  },
})

// For CSS background images
import heroImage from './images/hero.webp?url'

function Hero() {
  return (
    <div
      className="hero"
      style={{ backgroundImage: `url(${heroImage})` }}
    />
  )
}
```

**Benefits:**
- 40-70% reduction in image payload with modern formats (WebP, AVIF)
- Better LCP (Largest Contentful Paint) with priority loading for hero images
- Reduced CLS (Cumulative Layout Shift) by specifying explicit dimensions
- Lazy loading defers off-screen images, speeding up initial page load
- Automatic inlining of small images eliminates extra HTTP requests

Reference: [Vite Static Asset Handling](https://vitejs.dev/guide/assets.html) | [web.dev Image Optimization](https://web.dev/fast/#optimize-your-images)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Use SVGs as React Components

**Impact: HIGH (Better styling and integration)**

SVGs can be used as images or as React components. Using them as components enables styling with CSS, dynamic colors, and better integration with React.

## Incorrect

```typescript
// ❌ Bad: Using SVG as image - limited styling options
function Logo() {
  return <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
}

// ❌ Bad: Inline SVG everywhere - duplicated code
function Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  )
}
```

**Problems:**
- SVGs as `<img>` tags cannot be styled with CSS (no color changes, no hover effects)
- Inline SVGs are duplicated across components, bloating the bundle
- No tree shaking — unused icons still included in the build
- Cannot leverage `currentColor` for dynamic theming

## Correct

```bash
npm install vite-plugin-svgr -D
```

```typescript
// ✅ Good: vite.config.ts - Configure SVGR plugin
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  plugins: [
    react(),
    svgr({
      exportAsDefault: false,
      svgrOptions: {
        plugins: ['@svgr/plugin-svgo', '@svgr/plugin-jsx'],
        svgoConfig: {
          plugins: [
            {
              name: 'removeViewBox',
              active: false, // Keep viewBox for scaling
            },
          ],
        },
      },
    }),
  ],
})
```

```typescript
// ✅ Good: Import as React component for full styling control
import Logo from './assets/logo.svg?react'
import logoUrl from './assets/logo.svg'

function Header() {
  return (
    <header>
      {/* As component - fully styleable */}
      <Logo className="w-8 h-8 text-blue-600 hover:text-blue-700" />

      {/* As image when styling isn't needed */}
      <img src={logoUrl} alt="Logo" className="w-8 h-8" />
    </header>
  )
}
```

```typescript
// ✅ Good: TypeScript support
// src/vite-env.d.ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

declare module '*.svg?react' {
  import type { FunctionComponent, SVGProps } from 'react'
  const content: FunctionComponent<SVGProps<SVGSVGElement>>
  export default content
}

declare module '*.svg' {
  const content: string
  export default content
}
```

```typescript
// ✅ Good: Dynamic SVG colors via currentColor
import SearchIcon from './assets/search.svg?react'

function SearchButton({ active }: { active: boolean }) {
  return (
    <button className={active ? 'text-blue-600' : 'text-gray-400'}>
      <SearchIcon className="w-5 h-5" />
      Search
    </button>
  )
}
```

```typescript
// ✅ Good: Icon component pattern with tree shaking
import type { SVGProps, FunctionComponent } from 'react'

import HomeIcon from '@/assets/icons/home.svg?react'
import SettingsIcon from '@/assets/icons/settings.svg?react'
import UserIcon from '@/assets/icons/user.svg?react'

const icons = {
  home: HomeIcon,
  settings: SettingsIcon,
  user: UserIcon,
} as const

type IconName = keyof typeof icons

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 24, className, ...props }: IconProps) {
  const IconComponent = icons[name]
  return (
    <IconComponent
      width={size}
      height={size}
      className={className}
      {...props}
    />
  )
}

// Usage
// <Icon name="home" size={20} className="text-gray-600" />
```

**Benefits:**
- SVGs fully styleable with Tailwind CSS or any CSS framework
- Dynamic colors via `currentColor` without maintaining multiple SVG files
- Better tree shaking — unused icons excluded from the build
- SVGO optimization strips unnecessary metadata, reducing file size
- TypeScript support provides autocompletion for icon names

Reference: [vite-plugin-svgr](https://github.com/pd4d10/vite-plugin-svgr) | [SVGR](https://react-svgr.com/)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Web Font Loading in Vite

**Impact: HIGH (Font loading affects LCP and CLS)**

Render-blocking external font requests add network round trips and cause layout shifts. Self-hosting fonts with proper preloading eliminates third-party dependencies and gives you full control over loading behavior.

## Incorrect

```tsx
// ❌ Bad — render-blocking CDN font in index.html
// index.html
<head>
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap"
    rel="stylesheet"
  />
</head>
```

```tsx
// ❌ Bad — no font-display, no preload, full character set
// styles/global.css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700');

body {
  font-family: 'Inter', sans-serif;
}
```

**Problems:**
- Render-blocking request to third-party CDN
- Extra DNS lookup and TLS handshake for fonts.googleapis.com and fonts.gstatic.com
- No control over font-display behavior
- Full character set downloaded even if only Latin is needed
- GDPR concerns with Google Fonts CDN (user IP sent to Google)

## Correct

```bash
# Download font files locally (e.g., Inter-Regular.woff2, Inter-Medium.woff2, Inter-Bold.woff2)
# Place them in src/assets/fonts/
```

```css
/* src/styles/fonts.css */
/* ✅ Good — self-hosted, subsetted, font-display: swap */
@font-face {
  font-family: 'Inter';
  src: url('/src/assets/fonts/Inter-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F;
}

@font-face {
  font-family: 'Inter';
  src: url('/src/assets/fonts/Inter-Medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F;
}

@font-face {
  font-family: 'Inter';
  src: url('/src/assets/fonts/Inter-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F;
}
```

```html
<!-- ✅ Good — preload critical font in index.html -->
<head>
  <link
    rel="preload"
    href="/src/assets/fonts/Inter-Regular.woff2"
    as="font"
    type="font/woff2"
    crossorigin
  />
</head>
```

```typescript
// ✅ Good — vite.config.ts handles font files
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && /\.(woff2?|ttf|otf|eot)$/.test(assetInfo.name)) {
            return 'assets/fonts/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
```

**Benefits:**
- No third-party network requests or DNS lookups
- `font-display: swap` prevents invisible text during load
- `unicode-range` limits download to needed character sets
- Preloading ensures critical fonts load early, improving LCP
- Cache-busted font files via Vite's asset hashing
- Full GDPR compliance with no external requests

Reference: [Vite Static Asset Handling](https://vite.dev/guide/assets.html)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Public Directory vs Import

**Impact: HIGH (Wrong asset handling breaks caching and increases bundle size)**

Vite offers two ways to serve assets: the `public/` directory and JavaScript imports. Using the wrong one leads to cache busting failures or unnecessary bundling. Prefer importing assets via JavaScript unless the specific guarantees of the public directory are required.

## Incorrect

```tsx
// ❌ Bad — importing files that should stay static in public/
import robots from '../public/robots.txt?raw'
import manifest from '../public/manifest.json'

// ❌ Bad — putting everything in public/ to avoid imports
function Logo() {
  return <img src="/logo.png" alt="Logo" /> // No hash, no cache busting
}

function App() {
  return (
    <div>
      <Logo />
      {/* All assets in public/ — none get hashed */}
      <img src="/hero-banner.png" alt="Hero" />
      <img src="/icons/arrow.svg" alt="Arrow" />
    </div>
  )
}
```

**Problems:**
- Assets in `public/` are served as-is with no content hashing — browser cache issues on updates
- Importing from `public/` bypasses Vite's asset pipeline
- No tree-shaking or dead code elimination for unused assets
- Large images in `public/` are not optimized or inlined by Vite
- Missing assets in `public/` fail silently at runtime instead of at build time

## Correct

```tsx
// ✅ Good — import assets that benefit from hashing and optimization
import logo from './assets/logo.png'        // → /assets/logo-a1b2c3d4.png
import heroBanner from './assets/hero.png'   // → /assets/hero-e5f6g7h8.png
import ArrowIcon from './assets/arrow.svg?react'

function App() {
  return (
    <div>
      {/* Imported — hashed filename, cache-busted on change */}
      <img src={logo} alt="Logo" />
      <img src={heroBanner} alt="Hero" />
      <ArrowIcon />
    </div>
  )
}
```

```
# ✅ Good — public/ only for files that MUST keep exact names
public/
├── favicon.ico          # Browsers look for exact path
├── robots.txt           # Crawlers expect /robots.txt
├── manifest.json        # PWA manifest at fixed URL
├── _redirects           # Hosting platform config (Netlify)
└── og-image.png         # Open Graph — URL shared externally
```

```typescript
// ✅ Good — reference public/ files by absolute path (no import needed)
function Head() {
  return (
    <Helmet>
      <link rel="icon" href="/favicon.ico" />
      <meta property="og:image" content="/og-image.png" />
    </Helmet>
  )
}
```

```typescript
// ✅ Good — dynamic imports for assets based on runtime values
function CountryFlag({ code }: { code: string }) {
  // Vite glob import — all matched files are hashed
  const flags = import.meta.glob('./assets/flags/*.svg', {
    eager: true,
    as: 'url',
  })

  const src = flags[`./assets/flags/${code}.svg`]
  return src ? <img src={src} alt={code} /> : null
}
```

**Benefits:**
- Imported assets get content-hashed filenames for reliable cache busting
- Build fails if an imported asset is missing — no silent 404s at runtime
- Small assets are automatically inlined as base64 (below `assetsInlineLimit`)
- `public/` files keep exact names required by browsers and external services
- Clear separation of concerns between processed and static assets

Reference: [Vite Static Asset Handling](https://vite.dev/guide/assets.html#the-public-directory)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Use VITE_ Prefix for Environment Variables

**Impact: MEDIUM (Security and proper configuration)**

Vite only exposes environment variables prefixed with `VITE_` to client-side code. This prevents accidental exposure of sensitive server-side variables.

## Incorrect

```env
# ❌ Bad: .env
API_KEY=secret123
DATABASE_URL=postgres://...
APP_TITLE=My App
```

```typescript
// ❌ Bad: Variables not exposed - returns undefined
const apiKey = import.meta.env.API_KEY // undefined
const title = import.meta.env.APP_TITLE // undefined
```

```env
# ❌ Bad: Sensitive data with VITE_ prefix (exposed to browser!)
VITE_DATABASE_URL=postgres://...
VITE_API_SECRET=secret123
VITE_PRIVATE_KEY=...
```

**Problems:**
- Variables without `VITE_` prefix are not available in client code
- Sensitive data with `VITE_` prefix is embedded in the bundle and visible to anyone
- No type safety leads to runtime errors from undefined variables
- No separation between client-safe and server-only configuration

## Correct

```env
# ✅ Good: .env
# Client-side variables (exposed to browser)
VITE_API_URL=https://api.example.com
VITE_APP_TITLE=My App
VITE_ENABLE_ANALYTICS=true

# Server-side only (NOT exposed to browser)
DATABASE_URL=postgres://...
API_SECRET=secret123
```

```typescript
// ✅ Good: Access client-side variables
const apiUrl = import.meta.env.VITE_API_URL
const appTitle = import.meta.env.VITE_APP_TITLE
const enableAnalytics = import.meta.env.VITE_ENABLE_ANALYTICS === 'true'

// Built-in variables
const isDev = import.meta.env.DEV
const isProd = import.meta.env.PROD
const mode = import.meta.env.MODE
const baseUrl = import.meta.env.BASE_URL
```

```typescript
// ✅ Good: Type-safe environment variables
// src/vite-env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_APP_TITLE: string
  readonly VITE_ENABLE_ANALYTICS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

```env
# ✅ Good: Environment-specific files
# .env.development
VITE_API_URL=http://localhost:8000/api

# .env.production
VITE_API_URL=https://api.example.com

# .env.staging
VITE_API_URL=https://staging-api.example.com
```

```typescript
// ✅ Good: Runtime configuration for values that change without rebuild
// public/config.js
window.APP_CONFIG = {
  apiUrl: 'https://api.example.com',
}

// src/config.ts
export const config = {
  apiUrl: window.APP_CONFIG?.apiUrl || import.meta.env.VITE_API_URL,
}
```

**Benefits:**
- Prevents accidental exposure of secrets like database URLs and API keys
- Clear separation between client-safe and server-only configuration
- TypeScript declarations catch undefined variable access at compile time
- Environment-specific files allow different configs per deployment target
- Runtime configuration enables config changes without rebuilding

Reference: [Vite Env Variables](https://vitejs.dev/guide/env-and-mode.html)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Public build config vs server runtime

Vite mode controls selected env files; NODE_ENV is a separate setting. --mode staging alone doesn't make backend staging
or guarantee import.meta.env.DEV. Environment variables already present when Vite starts have higher priority.
Types don't validate config values; validate public inputs and server inputs separately.

Use same-origin /api/v1 unless a real deployment needs a public API URL.
Never commit real env secrets. This repo ignores .env/.env.* except example files;
preserve that rule rather than copying generic advice to commit mode files.
Public VITE_* values are embedded at build time, not runtime secret config.
Adapt any shell examples to PowerShell when relevant.

Reference: [Vite env and mode](https://vite.dev/guide/env-and-mode)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## VITE_* is public, and naming alone is not protection

VITE_* values are exposed to the browser by design. Server-only variables also leak if copied through define,
envPrefix changes, plugins, generated files, logs or source maps. Do not dump process.env into client config.
Session/DB/CSRF secrets remain server-side. No authentication token in localStorage.
Use same-origin session cookie and explicit CSRF handling for mutations.

Review public config allowlist and production artifacts without printing secret values.
A name-based development console warning is not a release secret check or config validation.
Do not add Stripe/JWT/payment integrations from generic examples; they are not POS-Lite requirements.

Reference: [Vite env variables](https://vite.dev/guide/env-and-mode)

---

> POS-Lite: read [project constraints](references/project-constraints.md) first. Examples are conditional; measure before changing defaults or adding dependencies.

## Bundle Analysis with Visualizer

**Impact: MEDIUM (Can't optimize what you can't measure)**

Without bundle analysis, large dependencies go unnoticed and bundle size creeps up over time. A visualizer gives you an interactive map of exactly what is in your bundle and how much space each module takes.

## Incorrect

```typescript
// ❌ Bad — guessing which dependencies are large
// "I think lodash is big, let me remove it"
// "The bundle seems slow, maybe it's the icons?"

// vite.config.ts — no analysis tooling
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // No way to know:
  // - Which dependency is the largest?
  // - Is tree-shaking working?
  // - Are there duplicate packages?
  // - Did that new library add 200KB?
})
```

**Problems:**
- No visibility into what makes the bundle large
- Optimization efforts are based on guesswork
- Regressions in bundle size go undetected
- Duplicate or unused dependencies waste bandwidth
- Cannot verify tree-shaking is working correctly

## Correct

```bash
npm install -D rollup-plugin-visualizer
```

```typescript
// ✅ Good — vite.config.ts with bundle visualizer
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'stats.html',      // Output file
      open: true,                   // Auto-open in browser after build
      gzipSize: true,               // Show gzipped sizes
      brotliSize: true,             // Show brotli-compressed sizes
      template: 'treemap',          // 'treemap' | 'sunburst' | 'network'
    }),
  ],
})
```

```typescript
// ✅ Good — only enable visualizer when analyzing (not every build)
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    // Only include visualizer when ANALYZE env var is set
    process.env.ANALYZE === 'true' &&
      visualizer({
        filename: 'stats.html',
        open: true,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }),
  ].filter(Boolean) as PluginOption[],
})
```

```json
// ✅ Good — add an analyze script to package.json
{
  "scripts": {
    "build": "vite build",
    "analyze": "ANALYZE=true vite build"
  }
}
```

```bash
# Run the analysis
npm run analyze
# Opens stats.html in browser with an interactive treemap
```

```
# How to read the visualizer output:
#
# 1. Large rectangles = large modules — focus optimization here
# 2. Check for:
#    - Unexpectedly large dependencies (e.g., moment.js, lodash full build)
#    - Duplicate packages (same lib bundled twice at different versions)
#    - Code that should be lazy-loaded but is in the main chunk
#    - Entire icon libraries when only a few icons are used
#
# 3. Common fixes after analysis:
#    - Replace moment.js (330KB) with date-fns or dayjs (2-7KB)
#    - Use named imports: import { debounce } from 'lodash-es'
#    - Lazy-load heavy routes: React.lazy(() => import('./HeavyPage'))
#    - Split vendor chunks in build.rollupOptions.output.manualChunks
```

**Benefits:**
- Interactive visualization of every module in the bundle
- Gzip and Brotli size estimates show real-world transfer sizes
- Catches regressions when new dependencies are added
- Verifies tree-shaking is eliminating unused code
- On-demand analysis avoids slowing down regular builds

Reference: [rollup-plugin-visualizer](https://github.com/btd/rollup-plugin-visualizer)
