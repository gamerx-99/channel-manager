import { createWorkerApp } from "./app";

const app = createWorkerApp();

export default {
  fetch: app.fetch,
};
