# 🚀 Talha Boilerplate

A premium, production-ready foundation for modern web applications built with **React**, **TypeScript**, and **Vite**.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite)
![MUI](https://img.shields.io/badge/MUI-5.x-007FFF?logo=mui)

---

## ✨ Features

### 🛡️ Production-Grade Architecture
- **Global Resilience**: Integrated `react-error-boundary` with a polished UI and **Sentry** monitoring for real-time error tracking.
- **Robust Authentication**: Centralized session management with **Zustand**, featuring persistent storage and automatic **Token Refresh** logic.
- **Strict Type Safety**: Fully typed ecosystem with custom TS configurations and ECharts type-safe wrappers.

### 🎨 Premium UI/UX
- **Material UI V5**: Sleek, modern components with customized theme support.
- **Theme Management**: Integrated Light/Dark mode with a persistent hook architecture.
- **Animations**: Fluid micro-interactions and page transitions powered by **Framer Motion**.
- **Responsive Layout**: Mobile-first design with a dynamic sidebar/navbar system.
- **404 Galaxy**: A custom, animated "Lost in Space" 404 page for catch-all routing.

### 📈 Data & Forms
- **ECharts Integration**: High-performance data visualization for dashboards.
- **TanStack Query**: Efficient server-state management with automated caching and mutations.
- **Validation Layers**: Form management with **React Hook Form** and schema-driven validation via **Zod**.
- **Axios Wrappers**: Unified API helper with automated header injection and error reporting.

### ⚡ Performance & SEO
- **Optimized Bundling**: Smart vendor chunking (MUI, ECharts, Utils) for faster loads and better caching.
- **SEO Ready**: Document metadata, OpenGraph tags, and semantic HTML structure.
- **Path Aliasing**: Clean imports using `@/*` mapping to `src/*`.

---

## 🛠️ Tech Stack

- **Core**: React 18, Vite 7 (SWC), TypeScript
- **Styling**: Material UI (MUI), Emotion, Styled Components
- **State**: Zustand (Local), TanStack Query (Server)
- **Forms**: React Hook Form, Zod
- **API**: Axios, Axios-Retry
- **Monitoring**: Sentry
- **Icons**: MUI Icons

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm / yarn / pnpm

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/iot-Noob/talha-boilerplate.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   Create a `.env` file in the root based on your requirements:
   ```env
   VITE_API_URL=http://your-api-url.com
   VITE_SENTRY_DSN=your-sentry-dsn
   ```

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
```
Verify the build output in the `dist` folder.

---

## 📁 Project Structure

```text
src/
├── api/             # Axios instance, Interceptors, Query Client
├── components/      # Common UI components (Navbar, ErrorBoundaries)
├── context/         # React Contexts (Theme, Auth)
├── HOCS/            # Higher-Order Components (AuthHOC)
├── hooks/           # Custom reusable hooks
├── pages/           # Page components (Dashboard, Login, Signup, 404)
├── routes/          # Unified routing logic & slices
├── store/           # Zustand stores for global state
└── App.tsx          # Root application component
```

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.

---

**Built with ❤️ by Talha.**
