# PromptCompiler V2 Suggestions

While V1 establishes a robust, production-ready core architecture for the AI pipeline and MV3 extension boundaries, transitioning from a functional tool to a scalable, live product requires addressing operational and business-critical infrastructure.

Below are the key recommendations for the V2 roadmap:

## 1. The Billing Engine (Pro Tier Gap)
While the V1 tier middleware currently separates Free and Pro users conceptually, V2 must implement actual payment processing to handle user upgrades dynamically.
* **Integration:** Implement Stripe Checkout or a similar payment gateway.
* **Webhooks:** Set up backend webhook listeners to catch subscription events securely.
* **Database Sync:** Write logic to automatically update a user's `tier` in the Supabase `profiles` table when their payment clears.

## 2. DevOps & CI/CD Automation
V1 relies heavily on manual smoke tests and local terminal commands. To ensure stable releases and prevent human error, deployment pipelines must be automated.
* **Backend Automation:** Wire up GitHub Actions or AWS CodePipeline to automatically test and deploy the Hono backend on merge to main.
* **Extension Bundling:** Automate the WXT/Vite build process to generate the production Chrome Web Store zip artifact.
* **Testing:** Run the backend integration tests and UI E2E tests automatically on every PR.

## 3. Client-Side Observability
Extensions are fragile because they rely on host website DOMs (Notion, Slack, GitHub, etc.) that can change without warning.
* **Error Tracking:** Integrate an observability tool like Sentry directly into the content script and background service worker.
* **Alerting:** Set up alerts to notify the team instantly if a host site updates their UI and breaks the `MutationObserver` or input instrumentation, allowing for rapid patching before users report silent failures.

## 4. Product Analytics
Abuse telemetry and rate limits track system health, but V2 needs to track *user success* and feature adoption to validate product-market fit.
* **Integration:** Add privacy-respecting product analytics (e.g., PostHog or Mixpanel).
* **Key Metrics to Track:**
    * Completion rate of `/bind` actions (identifying funnel drop-offs).
    * Usage distribution across the three generation modes (Efficiency, Balanced, Detailed).
    * Interaction rates with the hover preview popovers vs. immediate acceptance