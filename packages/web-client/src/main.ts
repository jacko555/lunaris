import { Rng } from "@lunaris/sim-core";

// Milestone 0 placeholder page. The PixiJS tile renderer, worker-hosted sim
// loop, and HUD arrive in Milestone 2 (see TASKS.md).
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("#app root element missing");
}

// Smoke-tests the sim-core workspace link end to end in the deployed build.
const rng = new Rng(42);
app.innerHTML = `
  <div>
    <h1>LUNARIS</h1>
    <p>Hard-realism lunar colonization sim — under construction.</p>
    <p>sim-core linked · first draw from Rng(42) = ${rng.next().toFixed(6)}</p>
  </div>
`;
