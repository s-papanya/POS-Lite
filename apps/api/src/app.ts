import express from "express";

export const app = express();

app.disable("x-powered-by");
app.use(express.json());

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok" });
});