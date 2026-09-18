# EarthRe Web Frontend

Responsive React + TypeScript + Vite frontend for the EarthRe SLA Monitoring Dashboard, styled with Vanilla CSS.

## Local start

Backend/API must be available at `http://localhost:8080` unless `VITE_API_BASE_URL` is set to another endpoint.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Open:

```text
http://localhost:5173
```

## Quality gate

```powershell
npm run check
```

This runs frontend TypeScript, Vitest and the Vite production build.

## Responsive logs

The semantic table markup is preserved, but CSS changes visual presentation by viewport:

```text
>= 1024px   operational table
<= 1023px   responsive two-column record cards
<= 560px    responsive one-column record cards
```

## Production

`VITE_API_BASE_URL` is a **build-time** Vite value. The Phase 4 deployment script sets it to the deployed Cloud Run API URL, runs the frontend quality gate/build, and then publishes `web/dist` to Firebase Hosting.

From the repository root:

```powershell
.\deploy\04-deploy-web.ps1
```

Do not commit a production `.env` file.
