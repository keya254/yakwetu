# Storefront (React + Vite)

## Pages kept
| Route | Purpose |
|-------|---------|
| `/` | Home / browse / recommendations |
| `/movie/:id` | Movie details + buy |
| `/checkout/:id` | Pay / unlock |
| `/watch/:id` | Player + finish watching |
| `/login` | OTP signup |
| `/admin.html` | Admin analytics & follow-up |
| `/demo-lab.html` | Scenario SMS demo tools |

## Develop
```bash
cd storefront
npm install
npm run dev
```
Proxies `/api` → `http://localhost:3001`.

## Build
```bash
npm run build
```
Docker builds this automatically via `deploy/Dockerfile.storefront`.
